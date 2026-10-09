"""院门、门廊支撑关系与场地找坡；不含结构配筋及排水能力验算。"""
import json
import math
import subprocess
import bpy


def load_site(root):
    return json.loads(subprocess.run(["node",str(root/"scripts/export-site.mjs")],check=True,
        capture_output=True,text=True,encoding="utf-8").stdout)


def yard_height(site,y):
    rows=site["yardRows"]
    for (a,za),(b,zb) in zip(rows,rows[1:]):
        if a<=y<=b: return za+(zb-za)*(y-a)/(b-a)
    raise ValueError("院面采样超出范围")


def create_site_details(plan,p,site,box,mesh,collection,material,merge):
    level=plan["level"]
    col=collection("architecture/site-details")
    white=material("site/porch-plaster","#e9e6db",.93)
    dark=material("site/gate-metal","#434d4e",.53,.25)
    stone=material("site/stone","#8b918e",.92)
    wood=material("site/gate-panel","#756d5d",.76)
    root=bpy.data.objects.new(f"StructureProposal_{level}",None)
    col.objects.link(root)
    root["model_component"]=True
    root["concept_only"]=True
    root["engineering_status"]="load_path_expression_only_not_structural_design"
    w,d=p["site_width"]/1000,p["courtyard_depth"]/1000
    h=p["wall_height"]/1000
    cw=site["columnWidth"]
    parts=[]
    for x in site["columns"]:
        obj=box("porch/column",(x,site["porchY"],h/2),(cw,cw,h),col,white)
        obj["column_center_x"]=x
        parts.append(obj)
    start=site["columns"][0]-cw/2
    parts.append(box("porch/front-beam",((start+w)/2,site["porchY"],h-site["beamDepth"]/2),
        (w-start,cw,site["beamDepth"]),col,white))
    parts.append(box("porch/slab-edge",((start+w)/2,d+.012,h+.10),(w-start,.024,.20),col,white))
    merge(parts,"porch/structure",root,{"detail_kind":"structure","is_proxy":True,"model_status":"needs_review"})
    root["columns_x_m"]=site["columns"]
    root["column_width_m"]=cw
    if level!=1:return

    drop=p["entrance_proposal"]["yard_drop_mm"]/1000
    site_root=bpy.data.objects.new("SiteDetails",None)
    col.objects.link(site_root)
    site_root["model_component"]=True
    site_root["site_root"]=True
    site_root["concept_only"]=True
    site_root["model_status"]="needs_review"
    site_root["layout"]=json.dumps(site)
    parts=[]

    # 屋内楼板不动；院面按两侧向沟找坡，入口第一踢面仍为 150 mm。
    surface=bpy.data.objects["room-floor/courtyard"]
    drain=site["drain"]
    y0,y1=drain["y"]-drain["width"]/2,drain["y"]+drain["width"]/2
    annex=site["annex"]
    annex_x=annex["bounds"][0]
    vertices,faces=[],[]
    for bottom,top,endx in ((0,y0,annex_x),(y1,4.09,annex_x),(4.09,d,w)):
        i=len(vertices)
        vertices.extend((x,y,yard_height(site,y)) for x,y in ((0,bottom),(endx,bottom),(endx,top),(0,top)))
        faces.append(tuple(range(i,i+4)))
    surface.location.z=0
    surface.data.clear_geometry();surface.data.from_pydata(vertices,[],faces);surface.data.update()
    old=bpy.data.objects["yard/lowered-slab"]
    bpy.data.objects.remove(old,do_unlink=True)

    def slab(name,x0,x1,a,b,lowered=False):
        xy=[(x0,a),(x1,a),(x1,b),(x0,b)]
        bottom=-drop-.25
        vertices=[(x,y,bottom) for x,y in xy]+[(x,y,yard_height(site,y)-(.12 if lowered else .002)) for x,y in xy]
        return mesh(name,vertices,[(3,2,1,0),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],col,stone)

    xs=[0,*drain["segments"][0],*drain["segments"][1],annex_x,w]
    ys=[0,y0,y1,4.09,d]
    for i in range(len(xs)-1):
        for j in range(len(ys)-1):parts.append(slab("yard/graded-slab",xs[i],xs[i+1],ys[j],ys[j+1],j==1 and i in (1,3)))
    parts.append(box("annex/floor-base",((annex_x+w)/2,2.045,-drop-.125),(w-annex_x,4.09,.25),col,stone))
    for wall in plan["walls"]:
        if not wall["id"].startswith("yard-"):continue
        a,b=wall["a"],wall["b"]
        size=(abs(b[0]-a[0])/1000,wall["thickness"]/1000,.25) if a[1]==b[1] else (wall["thickness"]/1000,abs(b[1]-a[1])/1000,.25)
        parts.append(box("yard/wall-base",((a[0]+b[0])/2000,(a[1]+b[1])/2000,-drop-.125),size,col,stone))
    for y in (.18,3.82):parts.append(box("yard/pier-base",(.18,y,-drop-.125),(.36,.36,.25),col,stone))
    for a,b in drain["segments"]:
        z=yard_height(site,drain["y"])
        for y in (y0+.007,y1-.007):parts.append(box("yard/channel-edge",((a+b)/2,y,z-.008),(b-a,.014,.02),col,dark))
        count=math.ceil((b-a)/.038)
        for i in range(count):
            x=a+(i+.5)*(b-a)/count
            parts.append(box("yard/drain-grate",(x,drain["y"],z-.007),(.013,drain["width"]-.025,.018),col,dark))
    # 院内检修口只是待接管的位置，不擅自连向邻地或街道。
    parts.append(box("yard/inspection-cover",(.72,1.76,yard_height(site,1.76)-.004),(.40,.40,.012),col,stone))
    merge(parts,"site/ground",site_root,{"detail_kind":"site_ground","model_status":"needs_review"})

    # 两扇内开院门，打开后沿门洞两端停放；花带已让出完整回转半径。
    gate=site["gate"]
    for index,(x,y) in enumerate(gate["hinges"]):
        pivot=bpy.data.objects.new(f"GateLeaf_{index+1}",None)
        col.objects.link(pivot)
        pivot.parent=site_root
        pivot["model_component"]=True
        pivot["gate_leaf"]=True
        pivot["open_angle"]=gate["openAngles"][index]
        length=gate["leafWidth"]
        sign=1 if index==0 else -1
        center=sign*length/2
        pieces=[]
        for zz in (.065,gate["height"]-.04):
            pieces.append(box("gate/rail",(0,center,zz),(.065,length,.065),col,dark))
        for yy in (sign*.035,sign*(length-.035)):
            pieces.append(box("gate/stile",(0,yy,gate["height"]/2),(.065,.065,gate["height"]),col,dark))
        pieces.append(box("gate/lower-panel",(0,center,.67),(.035,length-.11,1.17),col,wood))
        for i in range(15):
            yy=sign*(.11+i*(length-.22)/14)
            pieces.append(box("gate/upper-slat",(0,yy,1.57),(.035,.024,.65),col,dark))
        pieces.append(box("gate/handle",(.07,sign*(length-.14),.99),(.035,.028,.30),col,dark))
        merge(pieces,f"gate/leaf-{index+1}",pivot,{"detail_kind":"gate"})
        pivot.location=(x,y,gate["elevation"]+.035)
        pivot.rotation_euler.z=gate["openAngles"][index]
    canopy=[]
    canopy.append(box("gate/head-beam",(.18,2,2.20-drop),(.36,3.64,.20),col,white))
    canopy.append(box("gate/canopy",(.32,2,2.335-drop),(.64,4,.07),col,dark))
    merge(canopy,"gate/head",site_root,{"detail_kind":"gate_canopy"})
