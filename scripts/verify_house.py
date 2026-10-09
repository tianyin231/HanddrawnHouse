"""检查原生模型、挑空和 GLB 回读；不把生成数据的一致性当作实测精度。"""
from pathlib import Path
import json
import math
import struct
import subprocess
import bpy
import bmesh
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/"output"
P=json.loads((ROOT/"house_parameters.json").read_text(encoding="utf-8"))
bpy.ops.wm.open_mainfile(filepath=str(OUT/"house.blend"))
objects=[o for o in bpy.context.scene.objects if o.get("model_part")]


def bounds(meshes):
    points=[o.matrix_world@Vector(v) for o in meshes for v in o.bound_box]
    return [[min(v[i] for v in points) for i in range(3)],
            [max(v[i] for v in points) for i in range(3)]]


def floor_hit(obj,x,y):
    inverse=obj.matrix_world.inverted()
    origin=inverse@Vector((x,y,30))
    direction=inverse.to_3x3()@Vector((0,0,-1))
    hit,position,_,_=obj.ray_cast(origin,direction)
    return bool(hit),list(obj.matrix_world@position) if hit else None


assert all(math.isfinite(v) for o in objects for vertex in o.data.vertices for v in vertex.co)
assert len([o for o in bpy.context.scene.objects if o.get("model_root")])==2
assert abs(bpy.data.objects["Floor_2"].location.z-P["floor_to_floor"]/1000)<1e-6
upper=bpy.data.objects["F2/floor/property-boundary"]
source1=json.loads((ROOT/"plan_floor_1.json").read_text(encoding="utf-8"))
stair=source1["stairs"]
hx0,hy0,hx1,hy1=[v/1000 for v in stair["upper_hole"]]
yard_hit,_=floor_hit(upper,P["site_width"]/2000,P["courtyard_depth"]/2000)
stair_hit,_=floor_hit(upper,(hx0+hx1)/2,(hy0+hy1)/2)
porch_hit,porch_point=floor_hit(upper,(P["west_bay_width"]+stair["entry_x"])/2000,P["courtyard_depth"]/1000+1)
assert not yard_hit,"二层楼板错误覆盖院子"
assert not stair_hit,"二层楼梯洞未切通"
assert porch_hit and abs(porch_point[2]-P["floor_to_floor"]/1000)<1e-5
# 验证真实入口高差；旧的一层大板不得仍覆盖降低后的庭院。
entrance=P["entrance_proposal"]
drop=entrance["yard_drop_mm"]/1000
lower=bpy.data.objects["F1/floor/property-boundary"]
assert not floor_hit(lower,6.4,3.5)[0],"室内楼板仍盖在院面上"
yard=bpy.data.objects["F1/room-floor/courtyard"]
assert abs(floor_hit(yard,6.4,3.5)[1][2]+drop)<1e-5
entry_tops=[]
for i in range(1,entrance["riser_count"]+1):
    obj=bpy.data.objects[f"F1/entrance/step-{i}"]
    lo,hi=bounds([obj])
    hit,point=floor_hit(obj,(lo[0]+hi[0])/2,(lo[1]+hi[1])/2)
    assert hit and abs(point[2]-(-drop+i*drop/entrance["riser_count"]))<1e-5
    assert abs(hi[0]-lo[0]-entrance["width_mm"]/1000)<1e-5
    if i<entrance["riser_count"]: assert abs(hi[1]-lo[1]-entrance["tread_mm"]/1000)<1e-5
    entry_tops.append(point[2])
assert abs(hi[1]-P["courtyard_depth"]/1000)<1e-5
assert abs(floor_hit(lower,entrance["center_x_mm"]/1000,P["courtyard_depth"]/1000+.2)[1][2])<1e-5
for obj in objects:
    if obj.name.startswith("F1/wall/") and obj.get("wall_id","").startswith(("yard-","annex-")):
        assert abs(bounds([obj])[0][2]+drop)<1e-5,"院墙或附属间悬空"
# 检查实际保存的实体及父子标高，避免只验证浏览器生成函数。
envelope=json.loads(subprocess.run(["node",str(ROOT/"scripts/export-roof.mjs")],
    check=True,capture_output=True,text=True,encoding="utf-8").stdout)
roof_root=bpy.data.objects["RoofConcept"]
roof=bpy.data.objects["RoofConcept/roof-assembly"]
assert roof_root.parent==bpy.data.objects["Floor_2"] and roof.parent==roof_root
assert roof_root["concept_only"] and roof_root["model_status"]=="needs_review"
assert roof_root["classification"]==envelope["classification"]
assert len(roof.data.vertices)==len(envelope["positions"])
assert len(roof.data.polygons)==len(envelope["triangles"])
for vertex,(x,y,z) in zip(roof.data.vertices,envelope["positions"]):
    assert (vertex.co-Vector((x,-z,y))).length<1e-5
assert [face.material_index for face in roof.data.polygons]==envelope["materials"]
bm=bmesh.new()
bm.from_mesh(roof.data)
assert all(edge.is_manifold for edge in bm.edges),"屋顶体量未闭合"
assert bm.calc_volume(signed=True)>0,"屋顶体量朝向错误"
bm.free()
roof_bounds=bounds([roof])
assert abs(roof_bounds[0][2]-(P["floor_to_floor"]/1000+envelope["localMinHeightM"]))<1e-5
assert abs(roof_bounds[1][2]-envelope["worldRidgeHeightMm"]/1000)<1e-5
assert abs(roof_bounds[0][1]-envelope["footprintMm"][1]/1000)<1e-5
assert not floor_hit(roof,P["site_width"]/2000,P["courtyard_depth"]/2000)[0]
rainwater=bpy.data.objects["RainwaterSystem"]
assert rainwater.parent==bpy.data.objects["Floor_1"]
routes=json.loads(rainwater["routes"])
assert len(routes)==2
for route,outlet in zip(routes,envelope["drainageOutlets"]):
    path=route["centerline_m"]
    x,y,z=outlet["position"]
    assert not floor_hit(roof,x,y)[0],"雨水管接到了封死的檐沟"
    assert (Vector(path[0])-Vector((x,y,z+P["floor_to_floor"]/1000-.008))).length<1e-6
    assert all(b[2]<a[2] for a,b in zip(path,path[1:])),"雨水管反坡"
    assert all(.05<point[0]<P["site_width"]/1000-.05 and point[1]<P["courtyard_depth"]/1000 for point in path)
    assert abs(path[-1][2]-(-drop+.025))<1e-6
for level in (1,2):
    facade=bpy.data.objects[f"FacadeDetails_{level}"]
    assert facade.parent==bpy.data.objects[f"Floor_{level}"]
    assert facade["model_status"]=="needs_review"
    plan=json.loads((ROOT/f"plan_floor_{level}.json").read_text(encoding="utf-8"))
    elevation=(level-1)*P["floor_to_floor"]/1000
    for opening in plan["openings"]:
        if opening["kind"]!="window": continue
        panes=[o for o in facade.children if o.get("opening_id")==opening["id"] and o.get("glazing_proxy")]
        assert len(panes)==1,(level,opening["id"],"玻璃遗漏或重复")
        lo,hi=bounds(panes)
        assert lo[2]>=elevation+opening["sill"]/1000+.09-1e-5
        assert hi[2]<=elevation+opening["head"]/1000-.09+1e-5
        if opening["id"]=="south-kitchen":
            assert panes[0]["operation"]=="horizontal_sliding" and panes[0]["leaf_count"]==2
    # 附属间门扇必须随院面落下，不能浮在旧的室内零标高上。
    for opening_id in (["main-hall-door","annex-south-door","annex-north-door"] if level==1 else ["main-hall-door"]):
        leaves=[o for o in facade.children if o.get("opening_id")==opening_id]
        assert leaves
        lo,hi=bounds(leaves)
        expected=elevation+(-drop if opening_id.startswith("annex-") else 0)+.012
        assert abs(lo[2]-expected)<1e-5,(opening_id,lo[2],expected)
garden_root=bpy.data.objects["CourtyardDesign"]
garden_objects=list(garden_root.children)
assert garden_root.parent==bpy.data.objects["Floor_1"]
assert garden_root["concept_only"] and garden_root["model_status"]=="needs_review"
garden_bounds=bounds(garden_objects)
assert garden_bounds[0][0]>=-1e-5 and garden_bounds[1][0]<=P["site_width"]/1000+1e-5
assert garden_bounds[0][1]>=-1e-5 and garden_bounds[1][1]<=P["courtyard_depth"]/1000+1e-5
garden_layout=json.loads(garden_root["layout"])
assert abs(garden_layout["passage"][2]-garden_layout["passage"][0]-P["annex_passage_clear_width"]/1000)<1e-5
original_bounds=bounds(objects)
original_count=len(objects)
# 真实实体边界、楼梯踏面与两层出口，不能只验证图片相似。
assert abs(original_bounds[0][0])<1e-5 and abs(original_bounds[1][0]-P["site_width"]/1000)<1e-5,original_bounds
assert abs(original_bounds[0][1])<1e-5 and abs(original_bounds[1][1]-(P["courtyard_depth"]+P["house_depth"])/1000)<1e-5
assert stair["direction"]=="west-east-west"
assert stair["entry_space"]=="porch"
assert stair["riser_count"]*stair["riser_height"]==P["floor_to_floor"]
assert stair["tread_depth"]==280 and stair["riser_height"]==160
assert stair["flight_clear_width"]>=1100
assert abs(stair["turn_x"]-stair["bounds"][0]-(stair["riser_count"]//2-1)*stair["tread_depth"])<.01
for index,forward in ((1,True),(2,False)):
    obj=bpy.data.objects[f"F1/stair/flight-{index}"]
    start=stair["bounds"][0]/1000
    turn=stair["turn_x"]/1000
    y=(stair["bounds"][1]+stair["flight_width"]/2)/1000 if forward else (stair["bounds"][3]-stair["flight_width"]/2)/1000
    for i in range(stair["riser_count"]//2-1):
        x=start+(i+.5)*stair["tread_depth"]/1000 if forward else turn-(i+.5)*stair["tread_depth"]/1000
        hit,point=floor_hit(obj,x,y)
        expected=((i+1)*stair["riser_height"]+(0 if forward else P["floor_to_floor"]/2))/1000
        assert hit and abs(point[2]-expected)<1e-5,(index,i,point,expected)
exit_hit,_=floor_hit(upper,hx0-.5,(stair["bounds"][3]-stair["flight_width"]/2)/1000)
assert exit_hit,"二层楼梯出口没有落脚平台"
assert not any(o.get("wall_id")=="stair-west" for o in objects),"敞开楼梯仍存在西侧实墙"
window_checks=[]
for level in (1,2):
    source=json.loads((ROOT/f"plan_floor_{level}.json").read_text(encoding="utf-8"))
    walls={w["id"]:w for w in source["walls"]}
    for op in source["openings"]:
        if op["kind"]!="window": continue
        wall=walls[op["wall_id"]]
        a,b=Vector((*wall["a"],0))/1000,Vector((*wall["b"],0))/1000
        direction=(b-a).normalized()
        center=a+direction*(op["offset"]+op["width"]/2)/1000
        normal=Vector((-direction.y,direction.x,0))
        obj=bpy.data.objects[f"F{level}/wall/{wall['id']}"]
        inverse=obj.matrix_world.inverted()
        def wall_ray(z):
            point=center+normal*.6
            point.z=z+(level-1)*P["floor_to_floor"]/1000
            return obj.ray_cast(inverse@point,inverse.to_3x3()@(-normal))[0]
        assert not wall_ray((op["sill"]+op["head"])/2000),(level,op["id"],"窗洞未贯通")
        assert wall_ray(op["sill"]/1000-.1),(level,op["id"],"窗台缺失")
        assert wall_ray(op["head"]/1000+.1),(level,op["id"],"窗楣缺失")
        window_checks.append(f"F{level}/{op['id']}")
    spaces={s["id"]:s for s in source["spaces"]}
    assert spaces["master-bedroom"]["nominal_size_mm"]==[4000,4500]
    assert spaces["bedroom-nw"]["nominal_size_mm"][0]==4200
    assert spaces["suite-passage"]["clear_size_mm"][0]==P["passage_clear_width"]
    assert "stair-west" not in walls
    assert "south-stair" not in walls
    assert not any(o["id"]=="south-stairs" for o in source["openings"])
    assert not source.get("proposals")
    assert not any(set(c["spaces"])=={"hall","stairwell"} for c in source["connections"])
    assert any(c["kind"]=="open" and set(c["spaces"])=={"porch","stairwell"} for c in source["connections"])
    assert walls["hall-front"]["b"][0]==P["site_width"]-P["east_bay_width"]
    if level==1:
        assert spaces["dining"]["nominal_size_mm"]==[4000,3000]
        assert spaces["kitchen"]["nominal_size_mm"]==[4000,2500]
        kw=next(o for o in source["openings"] if o["id"]=="south-kitchen")
        assert kw["wall_id"]=="stair-north" and kw["space_id"]=="kitchen"
        assert [kw["width"],kw["sill"],kw["head"]]==[2400,1200,2600]
        assert kw["operation"]=="horizontal_sliding" and kw["opening_projection_mm"]==0
        assert kw["stair_clearance_mm"]>=500
        screen=walls["yard-screen"]
        annex=walls["annex-west"]
        assert annex["a"][0]-annex["thickness"]/2-(screen["a"][0]+screen["thickness"]/2)==P["annex_passage_clear_width"]
report={
    "status":"pass", "model_status":"needs_review", "blender_version":bpy.app.version_string,
    "native_mesh_count":original_count,"native_bounds_m":original_bounds,
    "floor_roots":["Floor_1","Floor_2"],
    "floor_elevations_m":[0,P["floor_to_floor"]/1000],
    "upper_courtyard_void":not yard_hit,"upper_stairwell_void":not stair_hit,
    "upper_porch_surface_m":porch_point,
    "stairs":stair,"window_sill_head_ray_checks":window_checks,
    "entrance":{"status":"proposal_not_measured","yard_elevation_m":-drop,
        "step_tops_m":entry_tops,"landing_meets_porch":True,"street_level":"not_measured"},
    "exterior_details":{"status":"proposal_needs_review","window_count":len(window_checks),
        "door_leaves":"main_hall_both_floors_and_annex","glazing_and_sill_bounds_checked":True},
    "rainwater":{"status":rainwater["drainage_status"],"routes":routes,
        "gutter_outlets_open":True,"routes_stay_inside_site":True,"capacity_assessed":False},
    "dimensions":{"outer_width_mm":P["site_width"],"house_depth_mm":P["house_depth"],
                  "courtyard_depth_mm":P["courtyard_depth"],"master_clear_mm":[3670,4170]},
    "daylight_status":"not_simulated_north_middle_room_unresolved",
    "roof":{"status":"concept_only_needs_review","classification":envelope["classification"],
            "native_bounds_m":roof_bounds,"world_ridge_height_mm":envelope["worldRidgeHeightMm"],
            "closed_mesh":True,"courtyard_uncovered":True,"source":"viewer/roof-concept.js",
            "engineering_acceptance":"not_assessed"},
    "courtyard_design":{"status":"concept_only_needs_review","native_bounds_m":garden_bounds,
        "mesh_count":len(garden_objects),"annex_passage_clear_width_mm":P["annex_passage_clear_width"],
        "lighting_status":"atmosphere_only_not_daylight_simulation","engineering_acceptance":"not_assessed"},
    "note":"验证文件和几何生成一致性；总宽采用用户约数14.7米，墙厚和竖向暂定。未评估承重、日照达标及施工节点。"
}
glb=(OUT/"house.glb").read_bytes()
magic,version,length=struct.unpack_from("<4sII",glb)
assert magic==b"glTF" and version==2 and length==len(glb)
json_length,kind=struct.unpack_from("<I4s",glb,12)
assert kind==b"JSON"
gltf=json.loads(glb[20:20+json_length])
assert {"Floor_1","Floor_2"}.issubset({n.get("name") for n in gltf["nodes"]})
roof_node=next(n for n in gltf["nodes"] if n.get("name")=="RoofConcept")
assert roof_node["extras"]["concept_only"] and roof_node["extras"]["model_status"]=="needs_review"
assert not gltf.get("extensionsRequired"),"出现未预期的必需扩展"
report["glb_bytes"]=len(glb)
report["glb_node_count"]=len(gltf["nodes"])
report["glb_mesh_count"]=len(gltf["meshes"])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(OUT/"house.glb"))
imported=[o for o in bpy.context.scene.objects if o.type=="MESH"]
imported_bounds=bounds(imported)
assert len(imported)==original_count
error=max(abs(a-b) for av,bv in zip(original_bounds,imported_bounds) for a,b in zip(av,bv))
assert error<1e-4,(original_bounds,imported_bounds)
imported_roof=bpy.data.objects["RoofConcept/roof-assembly"]
assert max(abs(a-b) for av,bv in zip(roof_bounds,bounds([imported_roof])) for a,b in zip(av,bv))<1e-4
assert bpy.data.objects["RoofConcept"]["concept_only"]
report["roof"]["glb_roundtrip_checked"]=True
imported_garden=bpy.data.objects["CourtyardDesign"]
assert imported_garden["concept_only"]
assert len(imported_garden.children)==len(garden_objects)
assert max(abs(a-b) for av,bv in zip(garden_bounds,bounds(list(imported_garden.children))) for a,b in zip(av,bv))<1e-4
report["courtyard_design"]["glb_roundtrip_checked"]=True
report["glb_roundtrip_mesh_count"]=len(imported)
report["glb_roundtrip_bounds_error_m"]=error
report["two_dimensional_checks"]={}
report["master_ensuite_checks"]={}
for level in (1,2):
    qa=ROOT/f"work/qa-floor-{level}"
    plan=json.loads((qa/"floorplan_validation.json").read_text(encoding="utf-8"))
    projection=json.loads((qa/"projection-comparison.json").read_text(encoding="utf-8"))
    assert not plan["errors"]
    assert projection["f1"]>.99
    report["two_dimensional_checks"][str(level)]={
        "geometry_errors":plan["errors"],"unreachable_spaces":plan["circulation"]["unreachable_spaces"],
        "projection_f1":projection["f1"],"interpretation":"仅验证二维数据与生成的三维剖切一致。"
    }
    if level in P["ensuite_floors"]:
        source=json.loads((ROOT/f"plan_floor_{level}.json").read_text(encoding="utf-8"))
        # 关上红色入口门后，公共厅堂仍通上方卫浴，但进不了主卧和下方卫浴。
        adjacency={s["id"]:set() for s in source["spaces"]}
        for connection in source["connections"]:
            if connection.get("opening_id")=="master-suite-entry-door":
                continue
            a,b=connection["spaces"]
            adjacency[a].add(b)
            adjacency[b].add(a)
        reached={"hall"}
        pending=["hall"]
        while pending:
            for neighbor in adjacency[pending.pop()]-reached:
                reached.add(neighbor)
                pending.append(neighbor)
        assert "bathroom-upper" in reached
        assert not {"master-bedroom","bathroom-lower","suite-passage"}&reached
        assert adjacency["bathroom-lower"]=={"suite-passage"}
        walls={w["id"]:w for w in source["walls"]}
        assert walls["suite-entry-partition"]["a"][1]==walls["suite-entry-partition"]["b"][1]==P["suite_entry_y"]
        assert walls["west-spine"]["b"]==[P["west_bay_width"],P["suite_entry_y"]]
        report["master_ensuite_checks"][str(level)]={
            "entry_door_separates_suite":True,"lower_bathroom_access":"suite-passage",
            "hall_to_public_passage":"fully_open"
        }
(OUT/"validation.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
print("HOUSE_VERIFIED",original_count,len(glb),error)
