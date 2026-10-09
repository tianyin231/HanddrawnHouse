"""按现有洞口补外立面构件；尺寸为方案表达，不代表选型或施工验收。"""
import math
import bpy
from mathutils import Vector
from site_details import yard_height


def merge_material_parts(parts, prefix, root, metadata):
    """细部按材质合并，避免手机为每根窗框和每条管箍各绘制一次。"""
    buckets = {}
    for obj in parts:
        buckets.setdefault(obj.data.materials[0].name, []).append(obj)
    result = []
    for index, objects in enumerate(buckets.values()):
        bpy.ops.object.select_all(action="DESELECT")
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        if len(objects) > 1:
            bpy.ops.object.join()
        obj = bpy.context.view_layer.objects.active
        obj.name = f"{prefix}/{index}"
        obj.parent = root
        obj["model_part"] = True
        obj["concept_only"] = True
        for key, value in metadata.items():
            obj[key] = value
        if obj.data.materials[0].name == "exterior/glass":
            obj["glazing_proxy"] = True
        result.append(obj)
    return result


def create_facade_details(plan, p, box, mesh, collection, material):
    level = plan["level"]
    col = collection("architecture/facade-details")
    root = bpy.data.objects.new(f"FacadeDetails_{level}", None)
    col.objects.link(root)
    root["model_component"] = True
    root["facade_root"] = True
    root["concept_only"] = True
    root["model_status"] = "needs_review"
    frame = material("exterior/sash", "#414b50", .42, .18)
    rubber = material("exterior/gasket", "#282e2f", .82)
    stone = material("exterior/sill-stone", "#b3b6b1", .9)
    wood = material("exterior/door-panel", "#807565", .7)
    metal = material("exterior/hardware", "#5e6261", .3, .65)
    glass = material("exterior/glass", "#d8e4e5", .12)
    bsdf = next(node for node in glass.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Transmission Weight"].default_value = .82
    bsdf.inputs["IOR"].default_value = 1.5
    lamp = material("exterior/porch-light", "#f4d7a0", .4)
    lamp_bsdf = next(node for node in lamp.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    lamp_bsdf.inputs["Emission Color"].default_value = lamp.diffuse_color
    lamp_bsdf.inputs["Emission Strength"].default_value = .35
    walls = {wall["id"]: wall for wall in plan["walls"]}
    drop = p["entrance_proposal"]["yard_drop_mm"] / 1000

    for opening in plan["openings"]:
        is_window = opening["kind"] == "window"
        if not is_window and opening["id"] not in ("main-hall-door", "annex-south-door", "annex-north-door"):
            continue
        wall = walls[opening["wall_id"]]
        a, b = Vector((*wall["a"], 0)) / 1000, Vector((*wall["b"], 0)) / 1000
        along = (b - a).normalized()
        outward = Vector((-along.y, along.x, 0))
        if wall["id"] in ("east-house", "south-master", "hall-front", "stair-north"):
            outward = -outward
        origin = a + along * opening["offset"] / 1000
        if wall["id"].startswith("annex-"):
            origin.z = -drop
        width = opening["width"] / 1000
        bottom, top = (opening.get("sill") or 0) / 1000, opening["head"] / 1000
        pieces = []

        def block(label, x0, x1, z0, z1, depth, offset, mat):
            center = origin + along * ((x0 + x1) / 2) + outward * offset + Vector((0, 0, (z0 + z1) / 2))
            obj = box(label, center, (x1 - x0, depth, z1 - z0), col, mat)
            obj.rotation_euler.z = math.atan2(along.y, along.x)
            pieces.append(obj)
            return obj

        def ring(label, x0, x1, z0, z1, face, depth, offset, mat):
            for xx0, xx1 in ((x0, x0 + face), (x1 - face, x1)):
                block(label, xx0, xx1, z0, z1, depth, offset, mat)
            for zz0, zz1 in ((z0, z0 + face), (z1 - face, z1)):
                block(label, x0 + face, x1 - face, zz0, zz1, depth, offset, mat)

        if is_window:
            count = 2 if width >= 1.3 else 1
            # 大窗采用两轨推拉，小高窗闭合表达；仅厨房南窗的开启方式已经确认。
            for index in range(count):
                left = .045 + index * (width - .09) / count - (.014 if index else 0)
                right = .045 + (index + 1) * (width - .09) / count + (.014 if index < count - 1 else 0)
                offset = (-.019 if index else .019) if count == 2 else 0
                ring("sash", left, right, bottom + .045, top - .045, .043, .036, offset, frame)
                ring("gasket", left + .043, right - .043, bottom + .088, top - .088, .009, .021, offset, rubber)
                for pane in (-.009, .009):
                    block("pane", left + .050, right - .050, bottom + .096, top - .096, .006, offset + pane, glass)
                handle_x = right - .028 if index == 0 else left + .028
                block("window-handle", handle_x - .009, handle_x + .009,
                      bottom + (top - bottom) * .48, bottom + (top - bottom) * .48 + .12, .025, offset - .035, metal)
            for offset in (-.035, .035):
                block("track", .025, width - .025, bottom + .02, bottom + .045, .009, offset, frame)
            # 南向窗台可向自家空间出挑；北、东、西侧压在已有外墙边界内。
            outside = wall["thickness"] / 2000 + (.035 if outward.y < -.5 else 0)
            inside = -.075
            section = [(inside, bottom + .006), (outside, bottom - .015),
                       (outside, bottom - .060), (outside - .014, bottom - .060),
                       (outside - .014, bottom - .050), (outside - .021, bottom - .050),
                       (outside - .021, bottom - .060), (inside, bottom - .045)]
            vertices = [tuple(origin + along * x + outward * y + Vector((0, 0, z)))
                        for x in (0, width) for y, z in section]
            n = len(section)
            faces = [tuple(range(n)), tuple(range(n, n * 2))]
            faces += [(i, (i + 1) % n, (i + 1) % n + n, i + n) for i in range(n)]
            pieces.append(mesh("sloped-sill-with-drip", vertices, faces, col, stone))
            operation = "horizontal_sliding" if count == 2 else "inward_sash_proposal"
        else:
            count = 2 if width > 1.5 else 1
            operation = "closed_door_leaves_swing_pending"
            for index in range(count):
                left = .055 + index * (width - .11) / count + .003
                right = .055 + (index + 1) * (width - .11) / count - .003
                block("door-leaf", left, right, .012, top - .055, .065, 0, frame)
                block("door-inset", left + .075, right - .075, .14, top - .16, .012, .037, wood)
                for h in (.38, top - .39):
                    block("door-panel-joint", left + .08, right - .08, h, h + .008, .006, .045, frame)
                handle_x = right - .09 if index == 0 else left + .09
                for offset in (-.075, .095):
                    block("door-pull", handle_x - .012, handle_x + .012, .90, 1.34, .024, offset, metal)
                    for h in (.95, 1.29):
                        block("handle-fixing", handle_x - .014, handle_x + .014, h, h + .026, .07, offset / 2, metal)
                for h in (.28, top - .28):
                    block("door-hinge", left - .012, left + .006, h, h + .11, .065, 0, metal)
        merge_material_parts(pieces, f"facade/{opening['id']}", root, {
            "opening_id": opening["id"], "detail_kind": "window" if is_window else "door",
            "operation": operation, "model_status": "needs_review", "is_proxy": True,
            "leaf_count": count, "wall_id": wall["id"]})
        if opening["id"] == "main-hall-door":
            pieces = []
            wall_face = wall["thickness"] / 2000
            block("porch-light/body", width/2-.19, width/2+.19, 2.42, 2.53, .07, wall_face+.035, frame)
            block("porch-light/diffuser", width/2-.16, width/2+.16, 2.407, 2.425, .05, wall_face+.04, lamp)
            merge_material_parts(pieces, "facade/porch-light", root, {"detail_kind":"porch_light"})
            emitter = bpy.data.objects.new("porch-light/emitter", None)
            col.objects.link(emitter)
            emitter.parent = root
            emitter.location = origin + along*(width/2) + outward*(wall_face+.18) + Vector((0,0,2.39))
            emitter["model_component"] = True
            emitter["facade_lamp"] = True
            emitter["lighting_status"] = "atmosphere_only_not_illuminance_design"

    if level == 1:
        pieces = []
        w, d = p["site_width"] / 1000, p["courtyard_depth"] / 1000
        t, h = p["exterior_wall_thickness"] / 1000, p["courtyard_wall_height"] / 1000 - drop
        east_bay = p["east_bay_width"] / 1000
        # 压顶的外缘收在宅界内，增加的滴水边仅朝院内；不碰附属间前的 2 米通道。
        for name, center, size in [
            ("south", ((w-east_bay)/2, (t+.025)/2, h+.025), (w-east_bay, t+.025, .05)),
            ("west", ((t+.025)/2, (4+d)/2, h+.025), (t+.025, d-4, .05)),
            ("east", (w-(t+.025)/2, (4.09+d)/2, h+.025), (t+.025, d-4.09, .05))]:
            pieces.append(box("yard-coping/"+name, center, size, col, stone))
        for y in (.18, 3.82):
            pieces.append(box("gate-pier-cap", (.18, y, 2.10-drop+.035), (.36, .36, .07), col, stone))
        merge_material_parts(pieces, "facade/yard-coping", root, {"detail_kind": "coping"})
    return root


def create_rainwater_details(p, envelope, box, mesh, collection, material, site):
    col = collection("architecture/rainwater-proposal")
    root = bpy.data.objects.new("RainwaterSystem", None)
    col.objects.link(root)
    root.parent = bpy.data.objects["Floor_1"]
    root["model_component"] = True
    root["concept_only"] = True
    root["model_status"] = "needs_review"
    root["drainage_status"] = "visible_route_only_capacity_overflow_and_outfall_pending"
    mat = material("exterior/rainwater", "#606968", .58, .18)
    dark = material("exterior/drain-inlet", "#333c3c", .88)
    height = p["floor_to_floor"] / 1000
    facade_y = p["courtyard_depth"] / 1000
    pipe_y = facade_y - .12
    yard = yard_height(site,pipe_y)
    parts = []

    def tube(name, path, outer=.055, inner=.051):
        # 截面随中心线转弯并在折点斜接；两端中空，不用封顶圆柱伪装水管。
        points = [Vector(point) for point in path]
        vertices = []
        count = 16
        for i, point in enumerate(points):
            before = (point - points[i-1]).normalized() if i else (points[1] - point).normalized()
            after = (points[i+1] - point).normalized() if i < len(points)-1 else before
            tangent = (before + after).normalized()
            u = Vector((1, 0, 0))
            v = tangent.cross(u).normalized()
            stretch = 1 / max(.5, tangent.dot(before))
            for radius in (outer, inner):
                for j in range(count):
                    angle = j * math.tau / count
                    vertices.append(tuple(point + u * (math.cos(angle)*radius) + v * (math.sin(angle)*radius*stretch)))
        faces = []
        for i in range(len(points)-1):
            for ring in (0, 1):
                a = (i*2+ring)*count
                b = ((i+1)*2+ring)*count
                faces.extend((a+j, a+(j+1)%count, b+(j+1)%count, b+j) for j in range(count))
        for i in (0, len(points)-1):
            a = i*2*count
            faces.extend((a+j, a+(j+1)%count, a+count+(j+1)%count, a+count+j) for j in range(count))
        obj = mesh(name, vertices, faces, col, mat)
        parts.append(obj)
        return obj

    routes = []
    for outlet in envelope["drainageOutlets"]:
        x, y, z = outlet["position"]
        z += height
        path = [(x,y,z-.008), (x,y,z-.22), (x,pipe_y,z-.22-(pipe_y-y)), (x,pipe_y,yard+.025)]
        tube("rainwater/"+outlet["id"], path)
        for joint in (z-.12, 4.8, 3.25, 1.65, yard+.22):
            at_y = y if joint > path[2][2] else pipe_y
            tube("rainwater/socket", [(x,at_y,joint-.035),(x,at_y,joint+.035)], .062, .055)
        for h in (.40, 2.05, 3.75, 5.30):
            tube("rainwater/clip", [(x,pipe_y,h-.018),(x,pipe_y,h+.018)], .067, .055)
            parts.append(box("rainwater/wall-fixing", (x,(pipe_y+facade_y)/2,h), (.035,facade_y-pipe_y,.03), col, mat))
        # 两个雨水口都留在院内边角；仅表示待接地下雨水管的位置。
        gx = max(.21, min(p["site_width"]/1000-.21, x))
        gy = facade_y-.15
        parts.append(box("rainwater/inlet", (gx,gy,yard+.001), (.38,.28,.012), col, dark))
        for i in range(11):
            xx = gx-.17+i*.034
            parts.append(box("rainwater/grate", (xx,gy,yard+.012), (.012,.26,.015), col, mat))
        routes.append({"id":outlet["id"],"centerline_m":path,"diameter_mm":outlet["diameterMm"]})
    # 附属间采用东北角内落水，立管贴内墙，不占用西侧 2 米净通道。
    annex=site["annex"]
    x,y=annex["outlet"]
    z=annex["elevation"]+annex["roofLow"]
    path=[(x,y,z+.018),(x,y,annex["elevation"]-.12)]
    tube("rainwater/annex",path)
    tube("rainwater/annex-roof-collar",[(x,y,z-.012),(x,y,z+.025)],.12,.051)
    for h in (.35,1.45):tube("rainwater/annex-clip",[(x,y,h-.02),(x,y,h+.02)],.065,.055)
    routes.append({"id":"annex","centerline_m":path,"diameter_mm":110,"outfall":"below_floor_connection_pending"})
    import json
    root["routes"] = json.dumps(routes)
    merge_material_parts(parts, "rainwater/assembly", root, {"detail_kind":"rainwater", "model_status":"needs_review"})
    return root
