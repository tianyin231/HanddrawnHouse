"""Blender 后台入口：复用已安装 Skill 建墙，再生成两层原生文件和 GLB。"""
from pathlib import Path
import importlib.util
import json
import math
import subprocess
import sys
import bpy
import bmesh
from mathutils import Vector, Quaternion

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from exterior_details import create_facade_details, create_rainwater_details
OUT = ROOT / "output"
P = json.loads((ROOT / "house_parameters.json").read_text(encoding="utf-8"))
spec = importlib.util.spec_from_file_location("architecture_skill", ROOT / ".agents/skills/cad-2d-to-3d/scripts/build_architecture_blender.py")
SKILL = importlib.util.module_from_spec(spec)
spec.loader.exec_module(SKILL)
# Skill 使用上下各10毫米的对称切片；窗台恰为1.2米时，切片会包含窗台下方墙体。
# 二维约定 sill <= cut < head，因此在该边界从上侧取样，让窗洞判定一致。
_symmetric_validation_cut=SKILL.create_validation_cut
def upper_side_validation_cut(source_objects,plan,cut_height_mm,collection,mat):
    return _symmetric_validation_cut(source_objects,plan,cut_height_mm+10.05,collection,mat)
SKILL.create_validation_cut=upper_side_validation_cut
W, Y0 = P["site_width"]/1000, P["courtyard_depth"]/1000
Y1 = Y0 + P["house_depth"]/1000
XE = W-P["east_bay_width"]/1000
FONT_PATH = "C:/Windows/Fonts/msyh.ttc"


def srgb(value):
    return value/12.92 if value <= .04045 else ((value+.055)/1.055)**2.4


def pbr(name, color, roughness=.78, metallic=0):
    if isinstance(color,str):
        color=tuple(srgb(int(color[i:i+2],16)/255) for i in (1,3,5))+(1,)
    mat=bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.diffuse_color=color
    mat.use_nodes=True
    nodes=mat.node_tree.nodes
    nodes.clear()
    output=nodes.new("ShaderNodeOutputMaterial")
    bsdf=nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value=color
    bsdf.inputs["Roughness"].default_value=roughness
    bsdf.inputs["Metallic"].default_value=metallic
    mat.node_tree.links.new(bsdf.outputs["BSDF"],output.inputs["Surface"])
    return mat


def assign(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)


def collection(name):
    col=bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(col)
    return col


def mesh_object(name, verts, faces, col, mat, recalculate=True):
    mesh=bpy.data.meshes.new(name+"/mesh")
    mesh.from_pydata(verts,[],faces)
    mesh.update()
    if recalculate:
        bm=bmesh.new()
        bm.from_mesh(mesh)
        bmesh.ops.recalc_face_normals(bm,faces=bm.faces)
        bm.to_mesh(mesh)
        bm.free()
    obj=bpy.data.objects.new(name,mesh)
    col.objects.link(obj)
    obj.data.materials.append(mat)
    obj["model_part"]=True
    return obj


def box(name, center, size, col, mat):
    obj=SKILL.add_box(name,center,size,0,col,mat)
    obj["model_part"]=True
    return obj


def rod(name, a, b, col, mat, radius=.027):
    a,b=Vector(a),Vector(b)
    d=b-a
    bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=radius,depth=d.length,location=(a+b)/2)
    obj=bpy.context.object
    obj.name=name
    obj.rotation_euler=d.to_track_quat("Z","Y").to_euler()
    SKILL.move_to_collection(obj,col)
    assign(obj,mat)
    obj["model_part"]=True
    return obj


def railing(name, a, b, col, mat, height=None, tread=None, riser=None):
    a,b=Vector(a),Vector(b)
    height=height or P["guardrail_height"]/1000
    # 竖向杆件，净距不大于110毫米；不使用便于攀爬的多道水平横杆。
    count=max(2,math.ceil((b-a).length/.12)+1)
    for i in range(count):
        q=a+(b-a)*i/(count-1)
        top=q+Vector((0,0,height))
        if tread:
            distance=abs(q.x-a.x)
            q.z=a.z-riser+min(round(abs(b.z-a.z)/riser)+1,math.floor(distance/tread+1e-6)+1)*riser
        rod(f"{name}/post-{i}",q,top,col,mat,.012)
    rod(f"{name}/handrail",a+Vector((0,0,height)),b+Vector((0,0,height)),col,mat)


def stair_flight(name,x0,x1,y0,y1,z0,z1,count,col,mat):
    # 台阶顶面与斜底板构成一个闭合网格，避免用实心方块堵住梯下空间。
    poly=[(x0,z0)]
    tread=(x1-x0)/(count-1)
    for i in range(1,count+1):
        h=z0+(z1-z0)*i/count
        poly.append((x0+(i-1)*tread,h))
        if i<count: poly.append((x0+i*tread,h))
    poly.extend([(x1,z1-.20),(x0,z0-.20)])
    n=len(poly)
    verts=[(x,y,z) for y in (y0,y1) for x,z in poly]
    faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]
    faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    return mesh_object(name,verts,faces,col,mat)


def create_stairs(plan, col, stair_mat, metal):
    x0,y0,x1,y1=[v/1000 for v in plan["stairs"]["bounds"]]
    fw=plan["stairs"]["flight_width"]/1000
    turn=plan["stairs"]["turn_x"]/1000
    rise=P["floor_to_floor"]/1000
    n=P["stair_risers"]//2
    rh=rise/(2*n)
    stair_flight("stair/flight-1",x0,turn,y0,y0+fw,0,rise/2,n,col,stair_mat)
    stair_flight("stair/flight-2",turn,x0,y1-fw,y1,rise/2,rise,n,col,stair_mat)
    box("stair/mid-landing",((turn+x1)/2,(y0+y1)/2,rise/2-.10),(x1-turn,y1-y0,.20),col,stair_mat)
    for label,y,zstart,zend,a,b in [
        ("south",y0, rh,rise/2,x0,turn),
        ("inner-first",y0+fw,rh,rise/2,x0,turn),
        ("inner-second",y1-fw,rise/2+rh,rise,turn,x0),
        ("north",y1,rise/2+rh,rise,turn,x0)]:
        railing("stair/"+label,(a,y,zstart),(b,y,zend),col,metal,
                P["stair_handrail_height"]/1000,P["stair_tread"]/1000,rh)
    for y in (y0,y1):
        railing("stair/landing-"+str(y),(turn,y,rise/2),(x1,y,rise/2),col,metal)
    railing("stair/landing-east",(x1,y0,rise/2),(x1,y1,rise/2),col,metal)


def cut_upper_stair_void(floor,col,mat,plan):
    x0,y0,x1,y1=[v/1000 for v in plan["stairs"]["upper_hole"]]
    cutter=box("temporary/stair-void",((x0+x1)/2,(y0+y1)/2,-.05),(x1-x0,y1-y0,1.0),col,mat)
    mod=floor.modifiers.new("楼梯洞口","BOOLEAN")
    mod.operation="DIFFERENCE"
    mod.solver="EXACT"
    mod.object=cutter
    bpy.context.view_layer.objects.active=floor
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(cutter,do_unlink=True)
    return (x0,y0,x1,y1)


def configure_render(camera, target, scale, size=(1500,1350)):
    target=Vector(target)
    camera.location=target+Vector((18,-28,34))
    camera.rotation_euler=(target-camera.location).to_track_quat("-Z","Y").to_euler()
    camera.data.type="ORTHO"
    camera.data.sensor_fit="HORIZONTAL"
    camera.data.ortho_scale=scale
    camera.data.clip_end=250
    scene=bpy.context.scene
    scene.camera=camera
    scene.render.engine="BLENDER_WORKBENCH"
    scene.render.resolution_x,scene.render.resolution_y=size
    scene.render.resolution_percentage=100
    scene.render.film_transparent=True
    scene.render.image_settings.file_format="PNG"
    scene.render.image_settings.color_mode="RGBA"
    shade=scene.display.shading
    shade.light="STUDIO"
    shade.color_type="MATERIAL"
    shade.show_shadows=True
    shade.show_cavity=True
    shade.cavity_type="BOTH"
    shade.curvature_ridge_factor=1.25
    shade.curvature_valley_factor=1.15
    shade.show_object_outline=True
    shade.object_outline_color=(.22,.25,.23)
    scene.view_settings.view_transform="Standard"


def export_glb(path):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in bpy.context.scene.objects:
        if obj.get("model_part") or obj.get("model_root") or obj.get("model_component"):
            obj.hide_set(False)
            obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(path),export_format="GLB",use_selection=True,
        export_extras=True,export_cameras=False,export_lights=False,export_animations=False)


def create_roof_concept():
    # 与浏览器共用概念几何；此处只转换坐标，不重复定义屋顶尺寸。
    result=subprocess.run(["node",str(ROOT/"scripts/export-roof.mjs")],
        check=True,capture_output=True,text=True,encoding="utf-8")
    envelope=json.loads(result.stdout)
    upper=bpy.data.objects["Floor_2"]
    col=collection("architecture/roof-concept")
    root=bpy.data.objects.new("RoofConcept",None)
    col.objects.link(root)
    root.parent=upper
    root["model_component"]=True
    root["concept_only"]=True
    root["model_status"]="needs_review"
    root["source"]="house_parameters.json"
    root["classification"]=envelope["classification"]
    root["proposal"]=envelope["proposal"]
    root["world_ridge_height_mm"]=envelope["worldRidgeHeightMm"]
    materials=[pbr(m["name"],m["color"],m["roughness"]) for m in envelope["materialDefinitions"]]
    # Three.js: X东/Y上/Z南；Blender: X东/Y北/Z上，保持右手坐标系。
    vertices=[(x,-z,y) for x,y,z in envelope["positions"]]
    mesh=mesh_object("RoofConcept/roof-assembly",vertices,envelope["triangles"],col,materials[0])
    mesh.parent=root
    mesh["concept_only"]=True
    mesh["model_status"]="needs_review"
    for material in materials[1:]: mesh.data.materials.append(material)
    for polygon,index in zip(mesh.data.polygons,envelope["materials"]): polygon.material_index=index
    return root,mesh,envelope


def create_courtyard_design():
    result=subprocess.run(["node",str(ROOT/"scripts/export-courtyard.mjs")],
        check=True,capture_output=True,text=True,encoding="utf-8")
    design=json.loads(result.stdout)
    col=collection("landscape/courtyard-concept")
    root=bpy.data.objects.new("CourtyardDesign",None)
    col.objects.link(root)
    root.parent=bpy.data.objects["Floor_1"]
    for key,value in design["metadata"].items():
        root[key]=json.dumps(value,ensure_ascii=False) if isinstance(value,dict) else value
    for item in design["meshes"]:
        options=item["material"]
        material=pbr("garden/"+item["materialName"],options["color"],options["roughness"],options.get("metalness",0))
        if "emissive" in options:
            bsdf=next(node for node in material.node_tree.nodes if node.type=="BSDF_PRINCIPLED")
            color=options["emissive"]
            bsdf.inputs["Emission Color"].default_value=tuple(srgb(int(color[i:i+2],16)/255) for i in (1,3,5))+(1,)
            bsdf.inputs["Emission Strength"].default_value=options["emissiveIntensity"]
        points=item["positions"]
        vertices=[(points[i],-points[i+2],points[i+1]) for i in range(0,len(points),3)]
        faces=[(i,i+1,i+2) for i in range(0,len(vertices),3)]
        # 导入的是逐三角面展开的网格，保留原始绕序与法线；孤立面不能重新猜内外。
        obj=mesh_object(item["name"],vertices,faces,col,material,recalculate=False)
        obj.parent=root
        obj["garden_material"]=item["materialName"]
        obj["concept_only"]=True
        normals=item["normals"]
        for polygon in obj.data.polygons: polygon.use_smooth=True
        obj.data.normals_split_custom_set_from_vertices([(normals[i],-normals[i+2],normals[i+1]) for i in range(0,len(normals),3)])
    return root


def create_entrance_proposal(plan, detail, stone, metal):
    """室内仍为 ±0，院面暂降 450 毫米；同步降低院墙、门柱和附属间。"""
    q=P["entrance_proposal"]
    drop=q["yard_drop_mm"]/1000
    floor=bpy.data.objects["floor/property-boundary"]
    for vertex in floor.data.vertices:
        if vertex.co.y<Y0: vertex.co.y=Y0
    yard_ids={wall["id"] for wall in plan["walls"] if wall["id"].startswith(("yard-","annex-"))}
    for obj in list(bpy.context.scene.objects):
        if obj.get("wall_id") in yard_ids or obj.get("space_id") in ("courtyard","annex-south","annex-north") or obj.name.startswith("yard/gate-pier"):
            obj.location.z-=drop
            obj["site_offset_mm"]=-q["yard_drop_mm"]
            if obj.name.startswith("room-floor/"):
                for vertex in obj.data.vertices: vertex.co.z=0
    plinth=pbr("exterior/plinth","#747d7e",.95)
    box("yard/lowered-slab",(W/2,Y0/2,-drop-.102),(W,Y0,.20),detail,plinth)
    # 只表达地坪高差的封闭基座，不是地下基础施工做法。
    base=box("entrance/plinth",(W/2,(Y0+Y1)/2,-(drop+.20)/2),(W,Y1-Y0,drop-.20),detail,plinth)
    base["concept_only"]=True
    cx=q["center_x_mm"]/1000
    width=q["width_mm"]/1000
    landing=Y0-q["landing_outside_mm"]/1000
    tread=q["tread_mm"]/1000
    riser=drop/q["riser_count"]
    start=landing-(q["riser_count"]-1)*tread
    for i in range(q["riser_count"]):
        y0=start+i*tread
        y1=Y0 if i==q["riser_count"]-1 else y0+tread
        top=-drop+(i+1)*riser
        obj=box(f"entrance/step-{i+1}",(cx,(y0+y1)/2,(-drop+top)/2),(width,y1-y0,top+drop),detail,stone)
        obj["concept_only"]=True
        obj["model_status"]="needs_review"
        obj["riser_mm"]=riser*1000
        box(f"entrance/nosing-{i+1}",(cx,y0+.035,top-.002),(width-.10,.035,.006),detail,metal)
    for x in (cx-width/2+.045,cx+width/2-.045):
        for y,z in ((start+.12,-drop+riser),(landing+.15,0)):
            rod("entrance/handrail-post",(x,y,z),(x,y,z+.90),detail,metal,.017)
        rod("entrance/handrail",(x,start+.12,-drop+riser+.90),(x,landing+.15,.90),detail,metal,.025)


def build_floor(level):
    plan_path=ROOT/f"plan_floor_{level}.json"
    plan=json.loads(plan_path.read_text(encoding="utf-8"))
    # 原 Skill 在独立后台场景中运行，不接触用户已打开的 Blender 场景。
    SKILL.build(plan_path,ROOT/f"work/raw-floor-{level}.blend",wall_height_mm=P["wall_height"],
        image_size=(round(P["site_width"]*.06+144),round((P["house_depth"]+P["courtyard_depth"])*.06+144)),
        report_path=ROOT/f"work/qa-floor-{level}/build-report.json")
    scene=bpy.context.scene
    scene.render.film_transparent=False
    scene.camera.data.sensor_fit="HORIZONTAL"
    scene.view_settings.view_transform="Standard"
    shell=bpy.data.collections[SKILL.COLLECTION_NAME]
    cuts=bpy.data.collections[SKILL.CUT_COLLECTION_NAME]
    # 先渲染 1.2 米剖切掩膜，后续材质和楼梯不参与墙体拓扑比较。
    for obj in scene.objects: obj.hide_render=True
    for obj in cuts.objects: obj.hide_render=False
    scene.render.filepath=str(ROOT/f"work/qa-floor-{level}/blender-cut-1200.png")
    bpy.ops.render.render(write_still=True)
    for obj in cuts.objects: obj.hide_render=True
    white=pbr("display/wall-ivory","#eeece4")
    plinth=pbr("display/slab","#929d95")
    frame=pbr("display/opening-proxy","#655b4d")
    window_frame=pbr("display/window-frame","#414b50",.45,.15)
    metal=pbr("display/rail","#4a5356",.40,.40)
    stair_mat=pbr("display/stair","#c8c8bf")
    floor=bpy.data.objects["floor/property-boundary"]
    # Skill 默认薄板0.05米，改为参数指定楼板厚度，顶标高仍是0。
    for vertex in floor.data.vertices:
        if vertex.co.z<0: vertex.co.z=-P["slab_thickness"]/1000
    assign(floor,plinth)
    wall_map={w["id"]:w for w in plan["walls"]}
    for obj in shell.objects:
        if obj.type!="MESH": continue
        obj.hide_render=False
        obj["model_part"]=True
        if obj.name.startswith("wall/"):
            info=wall_map[obj.name.split("/",1)[1]]
            height=info["height"]/1000
            obj.scale.z*=height/(P["wall_height"]/1000)
            obj.location.z=height/2
            assign(obj,white)
            obj["wall_id"]=info["id"]
            obj["evidence"]=info["evidence"]
            obj["thickness_mm"]=info["thickness"]
    detail=collection("architecture/details")
    for space in plan["spaces"]:
        if space["id"]=="stairwell": continue
        points=[(x/1000,y/1000) for x,y in space["polygon"]]
        if space["id"]=="courtyard":
            points=[(0,0),(XE,0),(XE,4),(W,4),(W,Y0),(0,Y0)]
        verts=[(x,y,.008) for x,y in points]
        mat=pbr("floor/"+space["id"],space["color"])
        obj=mesh_object("room-floor/"+space["id"],verts,[tuple(range(len(verts)))],detail,mat)
        obj["space_id"]=space["id"]
        obj["label"]=space["label"]
    if level==1:
        create_stairs(plan,detail,stair_mat,metal)
        for y in (.18,3.82):
            box(f"yard/gate-pier-{y}",(.18,y,1.05),(.36,.36,2.10),detail,white)
    else:
        hole=cut_upper_stair_void(floor,detail,plinth,plan)
        x0,y0,x1,y1=hole
        # 护栏是可删除的示意构件，不当作图纸已确认细节。
        railing("upper/stair-south",(x0,y0,0),(x1,y0,0),detail,metal)
        railing("upper/stair-north",(x0,y1,0),(x1,y1,0),detail,metal)
        railing("upper/stair-west",(x0,y0,0),(x0,y0+plan["stairs"]["flight_width"]/1000,0),detail,metal)
        railing("upper/porch-guard",(P["west_bay_width"]/1000+.1,Y0+.12,0),(W-P["exterior_wall_thickness"]/1000,Y0+.12,0),detail,metal)
    for obj in bpy.data.collections[SKILL.OPENING_COLLECTION_NAME].objects:
        if obj.type=="MESH":
            assign(obj,window_frame if obj.get("opening_kind")=="window" else frame)
            # 门窗示意框嵌入洞口，不挤占已算好的通道净宽。
            wall=wall_map[obj["wall_id"]]
            thickness=wall["thickness"]/1000
            axis=0 if wall["a"][0]==wall["b"][0] else 1
            frame_depth=.08 if obj.get("opening_kind")=="window" else .12
            obj.scale[axis]*=frame_depth/(thickness+.03)
            obj.hide_render=False
            obj["model_part"]=True
            obj["is_proxy"]=True
    if level==1: create_entrance_proposal(plan,detail,stair_mat,metal)
    create_facade_details(plan,P,box,mesh_object,collection,pbr)
    font=bpy.data.fonts.load(FONT_PATH,check_existing=True)
    for obj in bpy.data.collections[SKILL.SPACE_COLLECTION_NAME].objects:
        obj.hide_render=True
        if obj.type=="FONT": obj.data.font=font
    status=bpy.data.objects["validation/acceptance-status"]
    status.data.body=f"{level}层 · 待核尺寸模型"
    status.data.size=.35
    # 根节点把整层组织起来，Three.js 可独立切换楼层可见性。
    parent=collection(f"Floor_{level} / {'一层' if level==1 else '二层'}")
    root=bpy.data.objects.new(f"Floor_{level}",None)
    parent.objects.link(root)
    root["model_root"]=True
    root["label"]="一层" if level==1 else "二层"
    root["acceptance_status"]="needs_review"
    for obj in list(scene.objects):
        if obj!=root:
            if obj.parent is None: obj.parent=root
            if not obj.get("facade_root"): obj.name=f"F{level}/"+obj.name
    root.location.z=plan["elevation"]/1000
    for col in list(scene.collection.children):
        if col==parent: continue
        scene.collection.children.unlink(col)
        parent.children.link(col)
        col.name=f"F{level}/"+col.name
    camera=scene.camera
    # 相机已归楼层根节点，局部视点无需叠加楼层标高。
    configure_render(camera,(W/2,(Y0+Y1)/2 if level==2 else Y1/2,.35),23 if level==2 else 26)
    scene.render.filepath=str(OUT/f"floor-{level}-3d.png")
    bpy.ops.render.render(write_still=True)
    for obj in scene.objects:
        if obj.type=="FONT": obj.hide_set(False)
    scene["model_status"]="needs_review"
    scene["floor_number"]=level
    scene["floor_to_floor_m"]=P["floor_to_floor"]/1000
    text=bpy.data.texts.new(f"plan_floor_{level}.json")
    text.write(plan_path.read_text(encoding="utf-8"))
    export_glb(OUT/f"floor-{level}.glb")
    bpy.ops.object.select_all(action="DESELECT")
    bpy.ops.file.pack_all()
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/f"floor-{level}.blend"))
    return len([o for o in scene.objects if o.get("model_part")])


def assemble():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene=bpy.context.scene
    scene.unit_settings.system="METRIC"
    scene.unit_settings.length_unit="METERS"
    for level in (1,2):
        with bpy.data.libraries.load(str(OUT/f"floor-{level}.blend"),link=False) as (available,loaded):
            loaded.collections=[name for name in available.collections if name.startswith(f"Floor_{level} /")]
        for col in loaded.collections:
            scene.collection.children.link(col)
    roof_root,roof_mesh,envelope=create_roof_concept()
    garden=create_courtyard_design()
    rainwater=create_rainwater_details(P,envelope,box,mesh_object,collection,pbr)
    bpy.ops.object.camera_add()
    camera=bpy.context.object
    camera.name="总览相机"
    configure_render(camera,(W/2,10,2.4),28)
    scene.world=bpy.data.worlds.new("World")
    scene.world.color=(.8,.8,.8)
    # 原生文件保留真实层高，分层展开只用于预览图。
    scene["model_status"]="needs_review"
    scene["source_floor_order"]="图1一层；图2二层"
    scene["courtyard_upper_floor"]="void_confirmed_by_user"
    scene["roof_status"]="concept_only_not_structural_or_drainage_design"
    scene["courtyard_design_status"]="concept_only_pending_site_and_material_review"
    scene["parameters"]=(ROOT/"house_parameters.json").read_text(encoding="utf-8")
    for filename in ("house_parameters.json","plan_floor_1.json","plan_floor_2.json"):
        text=bpy.data.texts.new(filename)
        text.write((ROOT/filename).read_text(encoding="utf-8"))
    export_glb(OUT/"house.glb")
    bpy.ops.object.select_all(action="DESELECT")
    scene.render.filepath=str(OUT/"house-stacked.png")
    bpy.ops.render.render(write_still=True)
    upper=bpy.data.objects["Floor_2"]
    roof_mesh.hide_render=True
    for obj in rainwater.children: obj.hide_render=True
    for level in (1,2):
        for obj in bpy.data.objects[f"FacadeDetails_{level}"].children: obj.hide_render=True
    for obj in garden.children: obj.hide_render=True
    upper.location.z+=5.0
    configure_render(camera,(W/2,11,4.7),30,(1500,1500))
    scene.render.filepath=str(OUT/"house-exploded.png")
    bpy.ops.render.render(write_still=True)
    upper.location.z-=5.0
    roof_mesh.hide_render=False
    for obj in rainwater.children: obj.hide_render=False
    for level in (1,2):
        for obj in bpy.data.objects[f"FacadeDetails_{level}"].children: obj.hide_render=False
    for obj in garden.children: obj.hide_render=False
    # 从厨房内按真实楼层标高观察窗外楼梯，保留二层楼板的遮挡。
    # 此图只表达空间关系；Workbench 展示灯光不用于判断日照或照度。
    kw=P["kitchen_south_window"]
    center_x=XE+(kw["west_offset"]+kw["width"]/2)/1000
    kitchen_south=Y1-(P["north_room_depth"]+P["dining_depth"]+P["kitchen_depth"])/1000
    camera.location=(center_x,kitchen_south+P["kitchen_depth"]/1000-.35,1.65)
    target=Vector((center_x,kitchen_south,(kw["sill"]+kw["head"])/2000))
    camera.rotation_euler=(target-camera.location).to_track_quat("-Z","Y").to_euler()
    camera.data.type="PERSP"
    camera.data.lens=26
    camera.data.clip_start=.05
    scene.render.resolution_x,scene.render.resolution_y=1200,850
    scene.render.film_transparent=False
    scene.render.filepath=str(OUT/"kitchen-window-inside.png")
    bpy.ops.render.render(write_still=True)
    configure_render(camera,(W/2,10,2.4),28)
    # 打开文件时直接看到整个模型，而不是默认原点附近。
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type=="VIEW_3D":
                rv=area.spaces.active.region_3d
                rv.view_location=(W/2,10,2.2)
                rv.view_distance=31
                rv.view_rotation=camera.rotation_euler.to_quaternion()
                area.spaces.active.shading.type="SOLID"
                area.spaces.active.shading.color_type="MATERIAL"
    bpy.ops.file.pack_all()
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/"house.blend"))
    print("HOUSE_BUILD_COMPLETE",str(OUT/"house.blend"))


if __name__=="__main__":
    args=sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else []
    if args and args[0]=="assemble":
        assemble()
    else:
        level=int(args[0]) if args else 1
        print("FLOOR_BUILD_COMPLETE",level,build_floor(level))
