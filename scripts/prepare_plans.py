"""两张草图转为可复建的户型数据；尺寸统一从 house_parameters.json 读取。"""
from pathlib import Path
import json
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from geometry import stair_geometry, add_space_measurements

ROOT = Path(__file__).resolve().parents[1]
P = json.loads((ROOT / "house_parameters.json").read_text(encoding="utf-8"))
W = P["site_width"]
Y0 = P["courtyard_depth"]
Y1 = Y0 + P["house_depth"]
XW = P["west_bay_width"]
XE = W - P["east_bay_width"]
YN = Y1 - P["north_room_depth"]
YD = YN - P["dining_depth"]
YK = YD - P["kitchen_depth"]
YM = Y0 + P["master_bedroom_depth"]
E = P["exterior_wall_thickness"]
I = P["interior_wall_thickness"]
XNW = P["northwest_room_width"]
XB = XW - P["passage_clear_width"] - I
STAIRS = stair_geometry(P)
XS = STAIRS["entry_x"]
SCREEN_X = XE - I - P["annex_passage_clear_width"]
SCALE = 0.06
MARGIN = 72
SIZE = (round(W * SCALE + MARGIN * 2), round(Y1 * SCALE + MARGIN * 2))


def xy(point):
    return (MARGIN + point[0] * SCALE, MARGIN + (Y1 - point[1]) * SCALE)


def rectify(source, corners, width, height):
    """仅为读图和叠图做透视校正；手绘比例不作为尺寸权威。"""
    target = [(0, 0), (width, 0), (width, height), (0, height)]
    a, b = [], []
    for (x, y), (u, v) in zip(target, corners):
        a.extend([[x, y, 1, 0, 0, 0, -u*x, -u*y],
                  [0, 0, 0, x, y, 1, -v*x, -v*y]])
        b.extend([u, v])
    coeff = np.linalg.solve(np.asarray(a), np.asarray(b))
    return source.transform((width, height), Image.Transform.PERSPECTIVE,
                            coeff, Image.Resampling.BICUBIC)


def normalize_image(number):
    if number == 1:
        image = Image.open(ROOT / "references/sketch-dimensions.jpg").convert("RGB")
        north = [(158, 588), (870, 554), (901, 1260), (156, 1260)]
        south = [(156, 1260), (901, 1260), (920, 1713), (143, 1687)]
    else:
        image = Image.open(ROOT / "references/sketch-layout.jpg").convert("RGB")
        image = image.transpose(Image.Transpose.ROTATE_270)
        north = [(125, 563), (814, 536), (869, 1220), (132, 1247)]
        south = [(132, 1247), (869, 1220), (899, 1625), (140, 1640)]
    width = round(W*SCALE)
    house_h, yard_h = round(P["house_depth"]*SCALE), round(Y0*SCALE)
    canvas = Image.new("RGB", SIZE, "#f4f0e8")
    canvas.paste(rectify(image, north, width, house_h), (MARGIN, MARGIN))
    canvas.paste(rectify(image, south, width, yard_h), (MARGIN, MARGIN+house_h))
    destination = ROOT / f"work/reference-floor-{number}.png"
    canvas.save(destination)
    return destination


def add_daylight_proposals(plan, level):
    """窗洞属于本轮设计建议；邻界遮挡未知，不能据此声称采光达标。"""
    def window(name, host, offset, width, sill, head, space, note):
        plan["openings"].append({"id": name, "kind": "window", "wall_id": host,
            "offset": offset, "width": width, "sill": sill, "head": head,
            "height": head-sill, "space_id": space, "evidence": "inferred",
            "design_status": "proposal", "source": note})

    west = "西侧临街：高小窗建议，窗台2.1米；兼顾隐私，仍需核对街侧条件"
    north = "北侧邻居院墙仅隔约0.2至0.3米：小高窗效果待核，未认定采光达标"
    east = "东侧整条约3米空地：建议直接开窗，窗位及有效开扇待深化"
    south = "朝自家前院开窗：前院7米、上方挑空；南邻一层遮挡尚未做日照计算"
    for name, y, space in [("master",8700,"master-bedroom"),
                           ("bath-lower",12000,"bathroom-lower"),
                           ("bath-upper",14400,"bathroom-upper"),
                           ("bedroom",17300,"bedroom-nw")]:
        window("west-"+name,"west-house",y-Y0,900,2100,2700,space,west)
    window("south-master","south-master",900,2200,900,2400,"master-bedroom",south)
    window("east-stairs","east-house",900,2000,1900,2700,"stairwell",east)
    window("east-north-bedroom","east-house",10200,2100,900,2400,"bedroom-ne",east)
    window("north-nw","north-house",1700,900,2100,2700,"bedroom-nw",north)
    # 厅堂门两侧留玻璃窗；不把门廊和楼梯再次封成暗走道。
    main_start=(XS-XW-2000)/2
    window("hall-front-west","hall-front",350,main_start-650,900,2600,"hall",south)
    window("hall-front-east","hall-front",main_start+2300,main_start-650,900,2600,"hall",south)
    if level == 1:
        window("north-incense","north-house",XNW+450,600,2100,2700,"north-small",north+"；烧香间另需组织排烟")
        for index,x in enumerate([XNW+P["north_small_room_width"]+800,XE-1700]):
            window(f"north-middle-{index+1}","north-house",x,900,2100,2700,"bedroom-middle",north)
        window("east-dining","east-house",YD-Y0+650,1700,900,2400,"dining",east)
        window("east-kitchen","east-house",YK-Y0+550,1400,1200,2500,"kitchen",east)
        kw=P["kitchen_south_window"]
        window("south-kitchen","stair-north",kw["west_offset"],kw["width"],kw["sill"],kw["head"],"kitchen",P["notes"]["kitchen_window"])
        plan["openings"][-1].update({"operation":kw["operation"],"panel_count":kw["panel_count"],
            "stair_clearance_mm":YK-I/2-STAIRS["bounds"][3],
            "opening_projection_mm":0,"glass_status":"frame_proxy_only"})
        plan["proposals"]=[]
    else:
        for index,x in enumerate([XNW+1200,XE-2300]):
            window(f"north-living-{index+1}","north-house",x,900,2100,2700,"north-living",north)
        window("east-bedroom","east-house",YK-Y0+950,2100,900,2400,"bedroom-east",east)
        window("east-small","east-house",YN-1500-Y0+400,700,1800,2600,"east-small",east)
        plan["proposals"]=[]
    plan["daylight"]={"status":"concept_not_simulated","north_gap_mm":[200,300],
        "east_gap_mm":3000,"south_neighbor_floors":1,
        "issues":["北排中间卧室仅北侧小高窗，邻墙高度未知，直接采光尚未解决；借厅光不能替代直接采光",
                  "二层北侧起居区同样需要复核北窗效果；二层天窗不能直接解决一层暗卧",
                  "窗尺寸为建议，未扣窗框评估有效采光面积，展示照明不代表真实日照"],
        "confirmed_context":P["site_context"]}


def make_plan(level):
    ensuite = level in P["ensuite_floors"]
    suite_y = P["suite_entry_y"]
    plan = {
        "schema_version": 1, "name": f"手绘住宅 · {level}层",
        "units": "mm", "level": level,
        "elevation": (level-1)*P["floor_to_floor"],
        "reference_image": f"work/reference-floor-{level}.png",
        "acceptance": {"status": "needs_review", "note": "用户授权按两张草图制作可修改模型，尺寸和推定开口待核。"},
        "acceptance_checks": [],
        "calibration": {
            "model_points": [[0, 0], [W, 0], [0, Y0], [W, Y0], [0, Y1], [W, Y1]],
            "image_points": [list(xy(p)) for p in [[0, 0], [W, 0], [0, Y0], [W, Y0], [0, Y1], [W, Y1]]],
            "note": "分区透视校正后的绘图坐标；配准残差不代表测量精度。"
        },
        "property_boundary": [[0, 0 if level == 1 else Y0], [W, 0 if level == 1 else Y0], [W, Y1], [0, Y1]],
        "excluded_regions": [], "walls": [], "openings": [], "beams": [],
        "columns": [], "removed_walls": [], "spaces": [], "connections": [],
        "circulation": {"entry_space": "courtyard" if level == 1 else "stairwell", "required_reachable_spaces": []},
        "evidence": [
            {"id": "different-floors", "status": "known", "source": "用户回复：两张分别是不同楼层"},
            {"id": "source-dimensions", "status": "known", "source": P["notes"]["dimensions"]},
            {"id": "overall-width", "status": "known", "precision": "approximate", "value_mm": W, "source": P["notes"]["site_width"]},
            {"id": "verticals", "status": "inferred", "source": P["notes"]["heights"]},
            {"id": "openings", "status": "inferred", "source": P["notes"]["openings"]},
            {"id": "external-windows", "status": "inferred", "source": P["notes"]["openings"]}
        ],
        "parameters_file": "house_parameters.json"
    }

    def wall(name, a, b, exterior=False, height=None, evidence="inferred"):
        plan["walls"].append({"id": name, "a": a, "b": b,
            "thickness": P["exterior_wall_thickness"] if exterior else P["interior_wall_thickness"],
            "class": "exterior" if exterior else "interior", "evidence": evidence,
            "height": height or P["wall_height"]})

    def opening(name, host, offset, width, source="草图门弧/通道位置；门宽高推定"):
        plan["openings"].append({"id": name, "kind": "door", "wall_id": host,
            "offset": offset, "width": width, "head": P["door_height"],
            "evidence": "inferred", "source": source})

    def room(name, label, x0, y0, x1, y1, color):
        plan["spaces"].append({"id": name, "label": label,
            "polygon": [[x0,y0],[x1,y0],[x1,y1],[x0,y1]], "color": color,
            "evidence": "inferred"})

    def connect(a, b, door=None, segment=None):
        item = {"id": f"{a}-to-{b}", "spaces": [a,b], "kind": "door" if door else "open", "evidence": "inferred"}
        item.update({"opening_id": door} if door else {"segment": segment})
        plan["connections"].append(item)

    # 外轮廓尺寸含整道外墙；共享内隔墙按中心分摊，实体不能越出宅基地。
    wall("west-house", [E/2,Y0], [E/2,Y1], True)
    wall("east-house", [W-E/2,Y0], [W-E/2,Y1], True)
    wall("north-house", [0,Y1-E/2], [W,Y1-E/2], True)
    wall("south-master", [0,Y0+E/2], [XW,Y0+E/2], True)
    # 用户最新红圈取消楼梯朝院子的整面墙及窗，两层均敞开；二层仅设临空护栏。
    # 标注黄色段完全敞开，红色门横跨过道，分开公共通行与主卧套间。
    wall("west-spine", [XW,Y0], [XW,suite_y if ensuite else YN])
    wall("bathroom-east", [XB,YM], [XB,YN])
    wall("bathroom-divider", [0,YM+2000], [XB,YM+2000])
    wall("bathroom-south", [0,YM], [XB,YM])
    wall("nw-bedroom-east", [XNW,YN], [XNW,Y1])
    wall("nw-bedroom-south", [0,YN], [XNW,YN])
    wall("ne-bedroom-west", [XE,YN], [XE,Y1])
    wall("ne-bedroom-south", [XE,YN], [W,YN])
    # 用户改为从门廊上楼：厅前墙接到餐厨分隔墙，封闭原来预留的直通敞口。
    wall("hall-front", [XW,YK], [XE,YK])
    wall("stair-north", [XE,YK], [W,YK])
    opening("nw-bedroom-door", "nw-bedroom-south", XB+I/2+50, 900)
    opening("ne-bedroom-door", "ne-bedroom-south", 180, 900)
    if ensuite:
        wall("suite-entry-partition", [XB,suite_y], [XW,suite_y])
        opening("master-suite-entry-door", "suite-entry-partition", I/2, P["passage_clear_width"],
                "用户红色标注：套间入口门；门宽和精确坐标暂定")
    else:
        opening("west-suite-door", "west-spine", 6700, 1000)
    opening("bathroom-lower-door", "bathroom-east", 500, 900)
    opening("bathroom-upper-door", "bathroom-east", 3100, 900)
    opening("main-hall-door", "hall-front", (XS-XW-2000)/2, 2000)

    bed, bath, hall, circulation = "#d9ccb7", "#bed4d3", "#e4ddd1", "#d3d2c6"
    room("bedroom-nw", "卧室1", 0,YN,XNW,Y1,bed)
    room("bedroom-ne", "卧室3" if level == 1 else "卧室2", XE,YN,W,Y1,bed)
    room("master-bedroom", "主卧", 0,Y0,XW,YM,bed)
    room("bathroom-lower", "主卧卫浴" if ensuite else "卫浴2", 0,YM,XB,YM+2000,bath)
    room("bathroom-upper", "卫浴1", 0,YM+2000,XB,YN,bath)
    room("west-passage", "过道", XB,suite_y if ensuite else YM,XW,YN,circulation)
    if ensuite:
        room("suite-passage", "内廊", XB,YM,XW,suite_y,bed)
    room("hall", "厅堂", XW,YK,XE,YN,hall)
    room("porch", "门廊" if level == 1 else "前厅 / 阳台", XW,Y0,XS,YK,circulation)
    room("stairwell", "敞开楼梯", XS,Y0,W,YK,circulation)
    connect("west-passage", "bedroom-nw", "nw-bedroom-door")
    connect("west-passage", "bathroom-upper", "bathroom-upper-door")
    if ensuite:
        connect("hall", "west-passage", segment=[[XW,suite_y],[XW,YN]])
        connect("west-passage", "suite-passage", "master-suite-entry-door")
        connect("suite-passage", "bathroom-lower", "bathroom-lower-door")
        connect("suite-passage", "master-bedroom", segment=[[XB,YM],[XW,YM]])
        plan["evidence"].append({"id": "master-ensuite", "status": "known",
            "source": P["notes"]["master_ensuite"],
            "reference_image": "references/ensuite-correction.png"})
    else:
        connect("hall", "west-passage", "west-suite-door")
        connect("west-passage", "bathroom-lower", "bathroom-lower-door")
        connect("west-passage", "master-bedroom", segment=[[XB,YM],[XW,YM]])
    connect("porch", "hall", "main-hall-door")
    connect("porch", "stairwell", segment=[[XS,Y0],[XS,YK]])

    if level == 1:
        small_end = XNW + P["north_small_room_width"]
        wall("north-small-east", [small_end,YN], [small_end,Y1])
        wall("north-middle-south", [XNW,YN], [XE,YN])
        wall("east-spine", [XE,YK], [XE,YN])
        wall("dining-kitchen-divider", [XE,YD], [W,YD])
        opening("north-small-door", "north-middle-south", 350, 800)
        opening("middle-bedroom-door", "north-middle-south", XE-XNW-1100, 950)
        opening("dining-door", "east-spine", YD-YK+550, 1100)
        opening("kitchen-door", "east-spine", 650, 950)
        room("north-small", "烧香间", XNW,YN,small_end,Y1,bath)
        room("bedroom-middle", "卧室2", small_end,YN,XE,Y1,bed)
        room("dining", "餐厅", XE,YD,W,YN,"#d8d5ba")
        room("kitchen", "厨房", XE,YK,W,YD,bath)
        room("courtyard", "前院", 0,0,W,Y0,"#c8ccc0")
        room("annex-south", "附属间A", XE,0,W,2000,"#d5c6ae")
        room("annex-north", "附属间B", XE,2000,W,4000,"#d5c6ae")
        low = P["courtyard_wall_height"]
        wall("yard-west", [E/2,4000], [E/2,Y0], True, low)
        wall("yard-south", [0,E/2], [W,E/2], True, low)
        wall("yard-east", [W-E/2,0], [W-E/2,Y0], True, low)
        wall("annex-west", [XE,0], [XE,4000], height=P["annex_height"])
        wall("annex-north", [XE,4000], [W,4000], height=P["annex_height"])
        wall("annex-divider", [XE,2000], [W,2000], height=P["annex_height"])
        wall("yard-screen", [SCREEN_X,0], [SCREEN_X,4000], height=1800, evidence="known")
        opening("annex-south-door", "annex-west", 500, 800)
        opening("annex-north-door", "annex-west", 2500, 800)
        connect("dining", "bedroom-ne", "ne-bedroom-door")
        connect("hall", "north-small", "north-small-door")
        connect("hall", "bedroom-middle", "middle-bedroom-door")
        connect("hall", "dining", "dining-door")
        connect("hall", "kitchen", "kitchen-door")
        connect("courtyard", "porch", segment=[[XW,Y0],[XS,Y0]])
        connect("courtyard", "annex-south", "annex-south-door")
        connect("courtyard", "annex-north", "annex-north-door")
        plan["entry"] = {"kind": "gate", "segment": [[0,0],[0,4000]], "evidence": "inferred", "source": "图2左下侧开口及图1立柱示意"}
        plan["evidence"].append({"id":"courtyard-correction","status":"known",
            "source":P["notes"]["courtyard_correction"],"reference_image":"references/courtyard-correction.png"})
        plan["annex_passage"]={"clear_width_mm":P["annex_passage_clear_width"],
            "bounds":[SCREEN_X+I/2,E,XE-I/2,4000],"screen_axis_x":SCREEN_X}
    else:
        closet_y = YN-1500
        wall("east-bedroom-west", [XE,YK], [XE,closet_y])
        wall("east-bedroom-north", [XE,closet_y], [W,closet_y])
        wall("east-small-west", [XE+1100,closet_y], [XE+1100,YN])
        opening("east-bedroom-door", "east-bedroom-north", 150, 900)
        opening("east-small-door", "east-small-west", 300, 750)
        room("north-living", "起居厅", XNW,YN,XE,Y1,hall)
        room("bedroom-east", "卧室3", XE,YK,W,closet_y,bed)
        room("east-small", "右侧小间", XE+1100,closet_y,W,YN,bath)
        room("east-vestibule", "过厅", XE,closet_y,XE+1100,YN,circulation)
        connect("hall", "north-living", segment=[[XNW,YN],[XE,YN]])
        connect("hall", "east-vestibule", segment=[[XE,closet_y],[XE,YN]])
        connect("east-vestibule", "bedroom-ne", "ne-bedroom-door")
        connect("east-vestibule", "bedroom-east", "east-bedroom-door")
        connect("east-vestibule", "east-small", "east-small-door")
        plan["excluded_regions"] = [{"id": "courtyard-airspace", "kind": "void", "polygon": [[0,0],[W,0],[W,Y0],[0,Y0]], "note": P["notes"]["upper_front_area"]}]
        plan["evidence"].append({"id": "courtyard-void", "status": "known", "source": "用户确认院子上方挑空，不铺二层楼板"})
    plan["circulation"]["required_reachable_spaces"] = [s["id"] for s in plan["spaces"]]
    plan["stairs"] = STAIRS
    add_daylight_proposals(plan, level)
    if level==1:
        plan["evidence"].append({"id":"kitchen-south-window","status":"known",
            "source":"用户确认厨房南向允许开窗，并要求结合楼梯遮挡布置；窗尺寸、分扇属于本轮建议"})
    add_space_measurements(plan, P)
    plan["acceptance_checks"] = [
        {"id": "overall-dimensions", "question": "总宽约14.7米；含墙尺寸分配与墙厚仍需现场复核", "status": "needs_review", "review_region": [0,Y0,W,Y1]},
        {"id": "east-spaces", "question": "右侧门洞与小间用途、分隔是否正确", "status": "needs_review", "review_region": [XE,YK,W,Y1]}
    ]
    if ensuite:
        plan["acceptance_checks"].append({"id": "master-ensuite",
            "question": "黄色处敞开、红色处设套间入口门，下方卫浴归主卧套间",
            "status": "confirmed", "review_region": [0,YM,XW,YN],
            "note": "用户确认两层均修改；门洞宽度和准确位置仍为推定。"})
    return plan


def draw_readable_plan(plan, target):
    canvas = Image.new("RGB", SIZE, "#faf8f3")
    d = ImageDraw.Draw(canvas)
    font = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 18)
    small = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 13)
    title = ImageFont.truetype("C:/Windows/Fonts/msyhbd.ttc", 25)
    for s in plan["spaces"]:
        d.polygon([xy(p) for p in s["polygon"]], fill=s["color"])
    for w in plan["walls"]:
        d.line([xy(w["a"]),xy(w["b"])],fill="#424c48",width=round(w["thickness"]*SCALE))
    walls = {w["id"]:w for w in plan["walls"]}
    for op in plan["openings"]:
        w = walls[op["wall_id"]]
        a,b = np.array(w["a"],float),np.array(w["b"],float)
        v = (b-a)/np.linalg.norm(b-a)
        start,end = a+v*op["offset"],a+v*(op["offset"]+op["width"])
        d.line([xy(start),xy(end)], fill="#faf8f3",width=round(w["thickness"]*SCALE)+2)
        d.line([xy(start),xy(end)], fill="#2b9aad" if op["kind"]=="window" else "#b57f43",width=3)
    for s in plan["spaces"]:
        points=np.asarray(s["polygon"])
        center=points.mean(axis=0)
        if s["id"]=="courtyard": center=np.array([4500,3800])
        if s["id"]=="stairwell": center=np.array([XS+500,YK-300])
        d.text(xy(center),s["label"],fill="#34433e",font=font,anchor="mm")
        if s["id"] in ("bedroom-nw","bedroom-ne","master-bedroom","bedroom-middle","dining","kitchen"):
            nominal=s["nominal_size_mm"]
            clear=s["clear_size_mm"]
            text=f"含墙 {nominal[0]/1000:g}×{nominal[1]/1000:g}m"
            d.text((xy(center)[0],xy(center)[1]+23),text,fill="#677770",font=small,anchor="mm")
            d.text((xy(center)[0],xy(center)[1]+42),f"净约 {clear[0]/1000:.2f}×{clear[1]/1000:.2f}",fill="#677770",font=small,anchor="mm")
    if plan["level"] == 2:
        d.text(xy([W/2,Y0/2]),"前院上方挑空 · 无楼板",font=font,fill="#78847c",anchor="mm")
    sx0,sy0,sx1,sy1 = plan["stairs"]["bounds"]
    turn=plan["stairs"]["turn_x"]
    fw=plan["stairs"]["flight_width"]
    for y in (sy0,sy1-fw):
        for i in range(P["stair_risers"]//2):
            x=sx0+i*P["stair_tread"]
            d.line([xy([x,y]),xy([x,y+fw])],fill="#7a817a",width=1)
    for a,b in [([sx0+200,sy0+fw/2],[turn-150,sy0+fw/2]),([turn-150,sy1-fw/2],[sx0+200,sy1-fw/2])]:
        d.line([xy(a),xy(b)],fill="#985f33",width=3)
        sign=1 if b[0]>a[0] else -1
        d.line([xy([b[0]-sign*180,b[1]-130]),xy(b),xy([b[0]-sign*180,b[1]+130])],fill="#985f33",width=3)
    for proposal in plan.get("proposals",[]):
        a,b=proposal["a"],proposal["b"]
        for y in range(a[1],b[1],260):
            d.line([xy([a[0],y]),xy([a[0],min(y+140,b[1])])],fill="#b78b47",width=5)
        d.text(xy([a[0]+240,(a[1]+b[1])/2]),"影壁\n建议位",font=small,fill="#9e7435",anchor="lm")
    if plan["level"]==1:
        d.text(xy([(SCREEN_X+XE)/2,2500]),"门前通道\n净宽2.00m",font=small,fill="#586f65",anchor="mm")
    d.text((MARGIN,15),plan["name"]+" · 尺寸与采光调整",font=title,fill="#34433e")
    d.text((MARGIN,48),f"北↑ 邻居院墙间隔约0.2–0.3m  |  东侧约3m空地  |  总宽约{W/1000:g}m",font=small,fill="#677770")
    d.text((MARGIN,SIZE[1]-42),"含墙分配尺寸：外墙24cm、内墙18cm暂定；蓝色为建议窗洞，高小窗也投影示意。",font=small,fill="#806f59")
    d.text((MARGIN,SIZE[1]-21),"南侧邻居一层，距院界约0.2–0.3m；北排中间房采光待核。楼梯箭头表示上楼方向。",font=small,fill="#806f59")
    for y0,y1,label in [(Y0,Y1,"13.0 m"),(0,Y0,"7.0 m")]:
        a,b=xy([0,y0]),xy([0,y1])
        d.line([(MARGIN-27,a[1]),(MARGIN-27,b[1])],fill="#677770",width=1)
        d.text((MARGIN-24,(a[1]+b[1])/2),label,font=small,fill="#677770",anchor="rm")
    canvas.save(target)


if __name__ == "__main__":
    for level in (1,2):
        normalize_image(level)
        plan=make_plan(level)
        (ROOT/f"plan_floor_{level}.json").write_text(json.dumps(plan,ensure_ascii=False,indent=2),encoding="utf-8")
        draw_readable_plan(plan, ROOT/f"output/floor-{level}-plan.png")
    print("已生成两层户型数据与校正参考图。")
