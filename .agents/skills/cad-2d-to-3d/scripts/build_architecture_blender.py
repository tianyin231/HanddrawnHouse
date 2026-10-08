#!/usr/bin/env python3
"""Build a validation-first Blender architectural shell from a plan contract."""

from __future__ import annotations

import json
import hashlib
import math
from pathlib import Path

import bpy
from mathutils import Vector


COLLECTION_NAME = "cad_2d_to_3d/shell"
CUT_COLLECTION_NAME = "cad_2d_to_3d/validation-cut"
SPACE_COLLECTION_NAME = "cad_2d_to_3d/spaces"
OPENING_COLLECTION_NAME = "cad_2d_to_3d/opening-markers"
CIRCULATION_COLLECTION_NAME = "cad_2d_to_3d/circulation"
BUILT_IN_COLLECTION_NAME = "cad_2d_to_3d/built-ins"
FIXTURE_COLLECTION_NAME = "cad_2d_to_3d/fixtures"


def mm(value):
    return float(value) / 1000.0


def material(name, color):
    existing = bpy.data.materials.get(name)
    mat = existing or bpy.data.materials.new(name)
    mat.diffuse_color = color
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    emission = nodes.new("ShaderNodeEmission")
    emission.inputs["Color"].default_value = color
    emission.inputs["Strength"].default_value = 1.0
    links.new(emission.outputs["Emission"], output.inputs["Surface"])
    return mat


def wood_plank_tile_material():
    """Warm, matte wood-look plank tile with staggered joints."""
    name = "architecture/floor-wood-look-plank-tile"
    existing = bpy.data.materials.get(name)
    mat = existing or bpy.data.materials.new(name)
    mat.diffuse_color = (0.48, 0.25, 0.10, 1.0)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    output = nodes.new("ShaderNodeOutputMaterial")
    principled = nodes.new("ShaderNodeBsdfPrincipled")
    principled.inputs["Roughness"].default_value = 0.72
    texcoord = nodes.new("ShaderNodeTexCoord")
    brick = nodes.new("ShaderNodeTexBrick")
    brick.offset = 0.5
    brick.offset_frequency = 2
    brick.inputs["Color1"].default_value = (0.50, 0.27, 0.11, 1.0)
    brick.inputs["Color2"].default_value = (0.32, 0.14, 0.045, 1.0)
    brick.inputs["Mortar"].default_value = (0.18, 0.085, 0.035, 1.0)
    brick.inputs["Scale"].default_value = 6.0
    brick.inputs["Mortar Size"].default_value = 0.0015
    brick.inputs["Mortar Smooth"].default_value = 0.0005
    brick.inputs["Brick Width"].default_value = 0.72
    brick.inputs["Row Height"].default_value = 0.44
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.12
    bump.inputs["Distance"].default_value = 0.003

    links.new(texcoord.outputs["Generated"], brick.inputs["Vector"])
    links.new(brick.outputs["Color"], principled.inputs["Base Color"])
    links.new(brick.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], principled.inputs["Normal"])
    links.new(principled.outputs["BSDF"], output.inputs["Surface"])
    return mat


def ensure_collection(name):
    existing = bpy.data.collections.get(name)
    if existing:
        for obj in list(existing.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.collections.remove(existing)
    collection = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(collection)
    return collection


def create_validation_cut(source_objects, plan, cut_height_mm, collection, mat):
    """Intersect built solids with a thin horizontal slab for plan validation."""
    points = plan["property_boundary"]
    xs = [mm(point[0]) for point in points]
    ys = [mm(point[1]) for point in points]
    margin = 1.0
    thickness = 0.02
    slab = add_box(
        "validation-cut/slab",
        ((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2,
         mm(cut_height_mm)),
        (max(xs) - min(xs) + 2 * margin,
         max(ys) - min(ys) + 2 * margin, thickness),
        0.0, collection, mat,
    )
    cut_objects = []
    for source in source_objects:
        duplicate = source.copy()
        duplicate.data = source.data.copy()
        duplicate.name = f"validation-cut/{source.name}"
        collection.objects.link(duplicate)
        modifier = duplicate.modifiers.new("validation-cut/intersect", "BOOLEAN")
        modifier.operation = "INTERSECT"
        modifier.solver = "EXACT"
        modifier.object = slab
        bpy.context.view_layer.objects.active = duplicate
        duplicate.select_set(True)
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        duplicate.select_set(False)
        duplicate.data.materials.clear()
        duplicate.data.materials.append(mat)
        duplicate.hide_set(True)
        duplicate.hide_render = True
        cut_objects.append(duplicate)
    bpy.data.objects.remove(slab, do_unlink=True)
    return cut_objects


def add_space_markers(plan, collection, mat):
    markers = []
    for space in plan.get("spaces", []):
        polygon = space["polygon"]
        center = (
            mm(sum(point[0] for point in polygon) / len(polygon)),
            mm(sum(point[1] for point in polygon) / len(polygon)),
            0.03,
        )
        curve = bpy.data.curves.new(f"space/{space['id']}-text", type="FONT")
        curve.body = space.get("label", space["id"])
        curve.align_x = "CENTER"
        curve.align_y = "CENTER"
        curve.size = 0.24 if len(curve.body) > 16 else 0.28
        obj = bpy.data.objects.new(f"space/{space['id']}", curve)
        obj.location = center
        obj["space_id"] = space["id"]
        obj["evidence"] = space.get("evidence", "inferred")
        obj["polygon_mm"] = json.dumps(polygon)
        curve.materials.append(mat)
        collection.objects.link(obj)
        obj.hide_render = True
        markers.append(obj)
    return markers


def add_acceptance_marker(plan, collection, review_mat, accepted_mat):
    acceptance = plan.get("acceptance", {})
    status = acceptance.get("status", "needs_review")
    points = plan["property_boundary"]
    center_x = mm((min(point[0] for point in points)
                   + max(point[0] for point in points)) / 2)
    top_y = mm(max(point[1] for point in points)) + 0.5
    curve = bpy.data.curves.new("validation/acceptance-status-text", type="FONT")
    curve.body = ("2D PLAN ACCEPTED" if status == "accepted"
                  else "PROVISIONAL - 2D REVIEW REQUIRED")
    curve.align_x = "CENTER"
    curve.align_y = "CENTER"
    curve.size = 0.24
    obj = bpy.data.objects.new("validation/acceptance-status", curve)
    obj.location = (center_x, top_y, 0.03)
    obj["acceptance_status"] = status
    obj["acceptance_note"] = acceptance.get("note", "")
    curve.materials.append(accepted_mat if status == "accepted" else review_mat)
    collection.objects.link(obj)
    obj.hide_render = True
    return obj


def frame_top_view(plan):
    points = plan["property_boundary"]
    xs = [mm(point[0]) for point in points]
    ys = [mm(point[1]) for point in points]
    center = Vector(((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, 0.0))
    distance = max(max(xs) - min(xs), max(ys) - min(ys)) * 1.5
    for window in bpy.context.window_manager.windows:
        for area in window.screen.areas:
            if area.type != "VIEW_3D":
                continue
            region = next((item for item in area.regions if item.type == "WINDOW"), None)
            if region:
                with bpy.context.temp_override(window=window, area=area, region=region):
                    bpy.ops.view3d.view_axis(type="TOP", align_active=False)
            region_3d = area.spaces.active.region_3d
            region_3d.view_location = center
            region_3d.view_distance = distance
            area.tag_redraw()


def set_reference_review_mode():
    """Show the true plan cut as wire over the calibrated source image."""
    scene = bpy.context.scene
    camera = bpy.data.objects["validation/camera-top"]
    scene.camera = camera
    camera.hide_set(False)
    for obj in bpy.data.collections[COLLECTION_NAME].objects:
        if obj.type == "MESH":
            obj.hide_set(True)
    for obj in bpy.data.collections[CUT_COLLECTION_NAME].objects:
        obj.hide_set(False)
        obj.display_type = "WIRE"
        obj.show_in_front = True
    for obj in bpy.data.collections[SPACE_COLLECTION_NAME].objects:
        obj.hide_set(True)
    for obj in bpy.data.collections[OPENING_COLLECTION_NAME].objects:
        obj.hide_set(True)
    circulation = bpy.data.collections.get(CIRCULATION_COLLECTION_NAME)
    if circulation:
        for obj in circulation.objects:
            obj.hide_set(True)
    for window in bpy.context.window_manager.windows:
        for area in window.screen.areas:
            if area.type == "VIEW_3D":
                area.spaces.active.region_3d.view_perspective = "CAMERA"
                area.spaces.active.overlay.show_overlays = True
                area.spaces.active.overlay.show_extras = True
                area.tag_redraw()
    bpy.context.view_layer.update()


def set_model_top_view(plan):
    """Restore solid shell and semantic space labels after reference review."""
    camera = bpy.data.objects["validation/camera-top"]
    camera.hide_set(True)
    for obj in bpy.data.collections[COLLECTION_NAME].objects:
        if obj.type == "MESH":
            obj.hide_set(False)
            obj.display_type = "SOLID"
            obj.show_in_front = False
    for obj in bpy.data.collections[CUT_COLLECTION_NAME].objects:
        obj.hide_set(True)
    for obj in bpy.data.collections[SPACE_COLLECTION_NAME].objects:
        obj.hide_set(False)
    for obj in bpy.data.collections[OPENING_COLLECTION_NAME].objects:
        obj.hide_set(False)
    circulation = bpy.data.collections.get(CIRCULATION_COLLECTION_NAME)
    if circulation:
        for obj in circulation.objects:
            obj.hide_set(True)
    frame_top_view(plan)
    bpy.context.view_layer.update()


def set_model_review_region(plan, check_id):
    """Focus the solid top view on one semantic acceptance-check region."""
    check = next((item for item in plan.get("acceptance_checks", [])
                  if item.get("id") == check_id), None)
    if check is None:
        raise KeyError(f"unknown acceptance check: {check_id}")
    region = check.get("review_region")
    if not region or len(region) != 4:
        raise ValueError(f"acceptance check {check_id} has no valid review_region")
    set_model_top_view(plan)
    min_x, min_y, max_x, max_y = [mm(value) for value in region]
    center = Vector(((min_x + max_x) / 2, (min_y + max_y) / 2, 0.0))
    distance = max(max_x - min_x, max_y - min_y) * 1.5
    for window in bpy.context.window_manager.windows:
        for area in window.screen.areas:
            if area.type != "VIEW_3D":
                continue
            region_3d = area.spaces.active.region_3d
            region_3d.view_location = center
            region_3d.view_distance = distance
            area.tag_redraw()
    bpy.context.view_layer.update()
    return {"id": check_id, "status": check.get("status"),
            "review_region": region}


def set_circulation_review_mode(plan):
    """Show the semantic space-connection graph over the solid top view."""
    set_model_top_view(plan)
    circulation = bpy.data.collections.get(CIRCULATION_COLLECTION_NAME)
    if circulation is None:
        raise KeyError(f"missing collection: {CIRCULATION_COLLECTION_NAME}")
    for obj in circulation.objects:
        obj.hide_set(False)
        obj.show_in_front = True
    for window in bpy.context.window_manager.windows:
        for area in window.screen.areas:
            if area.type == "VIEW_3D":
                area.tag_redraw()
    bpy.context.view_layer.update()
    return {"entry_space": plan.get("circulation", {}).get("entry_space"),
            "connection_count": len(plan.get("connections", []))}


def reset_scene():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    root = bpy.context.scene.collection
    for child in list(root.children):
        root.children.unlink(child)
        bpy.data.collections.remove(child)


def move_to_collection(obj, collection):
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    collection.objects.link(obj)


def add_box(name, center, size, angle, collection, mat):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    obj = bpy.context.object
    obj.name = name
    # primitive_cube_add(size=1) creates unit dimensions, so scale equals the
    # requested full dimension on each axis.
    obj.scale = size
    obj.rotation_euler.z = angle
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.data.materials.append(mat)
    move_to_collection(obj, collection)
    return obj


def add_built_ins(plan, collection, cabinet_mat, cabinet_front_mat,
                  countertop_mat):
    """Build simple modular cabinetry from axis-aligned 2D footprints."""
    objects = []
    for item in plan.get("built_ins", []):
        x0, y0 = (mm(value) for value in item["a"])
        x1, y1 = (mm(value) for value in item["b"])
        xmin, xmax = sorted((x0, x1))
        ymin, ymax = sorted((y0, y1))
        width = xmax - xmin
        depth = ymax - ymin
        height = mm(item["height"])
        modules = max(1, int(item.get("modules", 1)))
        front = item.get("front", "north")
        if front not in {"north", "south", "east", "west"}:
            raise ValueError(f"unsupported built-in front: {front}")

        body_height = height - (0.04 if item["kind"] == "water-bar-base-cabinet" else 0.0)
        body = add_box(
            f"built-in/{item['id']}/carcass",
            ((xmin + xmax) / 2, (ymin + ymax) / 2, body_height / 2),
            (width, depth, body_height), 0.0, collection, cabinet_mat)
        objects.append(body)

        gap = 0.012
        run_length = width if front in {"north", "south"} else depth
        panel_width = (run_length - gap * (modules + 1)) / modules
        panel_bottom = 0.09
        panel_top = body_height - 0.05
        panel_height = panel_top - panel_bottom
        for index in range(modules):
            along = (xmin if front in {"north", "south"} else ymin)
            along += gap + panel_width / 2 + index * (panel_width + gap)
            if front in {"north", "south"}:
                center = (along, ymax + 0.012 if front == "north" else ymin - 0.012,
                          panel_bottom + panel_height / 2)
                size = (panel_width, 0.024, panel_height)
            else:
                center = (xmax + 0.012 if front == "east" else xmin - 0.012, along,
                          panel_bottom + panel_height / 2)
                size = (0.024, panel_width, panel_height)
            panel = add_box(
                f"built-in/{item['id']}/front-{index + 1:02d}",
                center, size, 0.0,
                collection, cabinet_front_mat)
            objects.append(panel)

        if front in {"north", "south"}:
            plinth_center = ((xmin + xmax) / 2,
                              ymax - 0.035 if front == "north" else ymin + 0.035,
                              0.045)
            plinth_size = (width - 0.08, 0.07, 0.09)
        else:
            plinth_center = (xmax - 0.035 if front == "east" else xmin + 0.035,
                              (ymin + ymax) / 2, 0.045)
            plinth_size = (0.07, depth - 0.08, 0.09)
        plinth = add_box(
            f"built-in/{item['id']}/plinth", plinth_center,
            plinth_size, 0.0, collection, cabinet_mat)
        objects.append(plinth)

        if item["kind"] in {"water-bar-base-cabinet", "kitchen-base-cabinet"}:
            top = add_box(
                f"built-in/{item['id']}/countertop",
                ((xmin + xmax) / 2, (ymin + ymax) / 2, height - 0.02),
                (width + 0.04, depth + 0.05, 0.04), 0.0,
                collection, countertop_mat)
            objects.append(top)

        for obj in objects:
            if "built_in_id" not in obj:
                obj["built_in_id"] = item["id"]
                obj["built_in_kind"] = item["kind"]
                obj["space_id"] = item["space_id"]
                obj["evidence"] = item.get("evidence", "inferred")
    return objects


def add_cylinder(name, center, radius, depth, collection, mat,
                 rotation=(0.0, 0.0, 0.0), scale_xy=(1.0, 1.0), vertices=48):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices, radius=radius, depth=depth,
        location=center, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.scale.x = scale_xy[0]
    obj.scale.y = scale_xy[1]
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    move_to_collection(obj, collection)
    return obj


def pale_lilac_marble_material():
    name = "architecture/pale-lilac-marble"
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.diffuse_color = (0.78, 0.69, 0.84, 1.0)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    principled = nodes.new("ShaderNodeBsdfPrincipled")
    principled.inputs["Roughness"].default_value = 0.28
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 3.2
    noise.inputs["Detail"].default_value = 7.0
    noise.inputs["Roughness"].default_value = 0.7
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.40
    ramp.color_ramp.elements[0].color = (0.88, 0.84, 0.90, 1.0)
    ramp.color_ramp.elements[1].position = 0.58
    ramp.color_ramp.elements[1].color = (0.48, 0.27, 0.58, 1.0)
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.08
    bump.inputs["Distance"].default_value = 0.002
    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], principled.inputs["Base Color"])
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], principled.inputs["Normal"])
    links.new(principled.outputs["BSDF"], output.inputs["Surface"])
    return mat


def add_fixtures(plan, collection, mats):
    """Create recognizable, replaceable room equipment from plan footprints."""
    objects = []

    def box(item, suffix, center, size, mat_key):
        obj = add_box(
            f"fixture/{item['id']}/{suffix}", center, size, 0.0,
            collection, mats[mat_key])
        objects.append(obj)
        return obj

    def cyl(item, suffix, center, radius, depth, mat_key,
            rotation=(0.0, 0.0, 0.0), scale_xy=(1.0, 1.0)):
        obj = add_cylinder(
            f"fixture/{item['id']}/{suffix}", center, radius, depth,
            collection, mats[mat_key], rotation=rotation, scale_xy=scale_xy)
        objects.append(obj)
        return obj

    for item in plan.get("fixtures", []):
        cx, cy = (mm(v) for v in item["center"])
        sx, sy, sz = (mm(v) for v in item["size"])
        kind = item["kind"]
        before = len(objects)
        if kind == "fridge":
            box(item, "body", (cx, cy, sz / 2), (sx, sy, sz), "appliance")
            box(item, "front", (cx, cy - sy / 2 - 0.012, sz / 2),
                (sx - 0.04, 0.024, sz - 0.06), "appliance-front")
            box(item, "divider", (cx, cy - sy / 2 - 0.027, sz * 0.40),
                (sx - 0.08, 0.012, 0.018), "dark")
            box(item, "handle", (cx + sx * 0.34, cy - sy / 2 - 0.045, sz * 0.64),
                (0.025, 0.025, 0.52), "metal")
        elif kind == "dishwasher":
            box(item, "body", (cx, cy, sz / 2), (sx, sy, sz), "appliance")
            box(item, "front", (cx, cy - sy / 2 - 0.012, sz / 2),
                (sx - 0.035, 0.024, sz - 0.035), "metal")
            box(item, "control", (cx, cy - sy / 2 - 0.03, sz - 0.06),
                (sx - 0.07, 0.018, 0.08), "dark")
        elif kind == "sink":
            top = mm(item.get("top", 900))
            box(item, "rim", (cx, cy, top), (sx, sy, 0.035), "metal")
            box(item, "basin", (cx, cy, top - sz / 2),
                (sx - 0.08, sy - 0.08, sz), "sink-dark")
            cyl(item, "faucet", (cx, cy + sy * 0.42, top + 0.19),
                0.018, 0.38, "metal")
        elif kind == "cooktop":
            top = mm(item.get("top", 925))
            box(item, "glass", (cx, cy, top), (sx, sy, sz), "dark")
            for dx, dy in ((-0.13, -0.10), (0.13, -0.10), (-0.13, 0.10), (0.13, 0.10)):
                cyl(item, f"burner-{dx}-{dy}", (cx + dx, cy + dy, top + sz / 2 + 0.006),
                    0.075, 0.012, "metal")
        elif kind == "range-hood":
            bottom = mm(item.get("bottom", 1550))
            box(item, "canopy", (cx, cy, bottom + 0.11), (sx, sy, 0.22), "metal")
            box(item, "chimney", (cx, cy + sy * 0.28, bottom + 0.22 + (sz - 0.22) / 2),
                (sx * 0.46, sy * 0.42, sz - 0.22), "metal")
        elif kind == "washer-dryer-stack":
            box(item, "body", (cx, cy, sz / 2), (sx, sy, sz), "appliance")
            for z in (sz * 0.27, sz * 0.73):
                cyl(item, f"door-{z}", (cx, cy - sy / 2 - 0.02, z),
                    sx * 0.26, 0.045, "dark", rotation=(math.pi / 2, 0.0, 0.0))
                cyl(item, f"rim-{z}", (cx, cy - sy / 2 - 0.048, z),
                    sx * 0.31, 0.018, "metal", rotation=(math.pi / 2, 0.0, 0.0))
        elif kind == "vanity":
            box(item, "cabinet", (cx, cy, sz / 2), (sx, sy, sz), "cabinet-front")
            box(item, "top", (cx, cy, sz + 0.025), (sx + 0.04, sy + 0.04, 0.05), "stone")
            cyl(item, "basin", (cx, cy - 0.04, sz + 0.08), sx * 0.20, 0.11,
                "ceramic", scale_xy=(1.0, 0.65))
        elif kind == "mirror":
            bottom = mm(item.get("bottom", 1100))
            box(item, "panel", (cx, cy, bottom + sz / 2), (sx, sy, sz), "mirror")
        elif kind == "toilet":
            box(item, "tank", (cx, cy + sy * 0.31, sz * 0.64),
                (sx, sy * 0.30, sz * 0.60), "ceramic")
            cyl(item, "bowl", (cx, cy - sy * 0.08, sz * 0.34), sx * 0.48,
                sz * 0.42, "ceramic", scale_xy=(1.0, 1.42))
            cyl(item, "seat", (cx, cy - sy * 0.08, sz * 0.57), sx * 0.43,
                0.055, "metal", scale_xy=(1.0, 1.40))
        elif kind == "shower":
            box(item, "tray", (cx, cy, 0.035), (sx, sy, 0.07), "ceramic")
            box(item, "glass", (cx - sx / 2, cy, sz / 2),
                (0.022, sy, sz), "glass")
            cyl(item, "riser", (cx + sx * 0.32, cy + sy * 0.36, sz * 0.53),
                0.016, sz * 0.78, "metal")
            cyl(item, "head", (cx + sx * 0.32, cy + sy * 0.28, sz * 0.86),
                0.11, 0.035, "metal")
        elif kind == "double-desk":
            box(item, "top", (cx, cy, sz - 0.035), (sx, sy, 0.07), "desk")
            for dx in (-sx * 0.43, 0.0, sx * 0.43):
                box(item, f"leg-{dx}", (cx + dx, cy, (sz - 0.07) / 2),
                    (0.055, sy * 0.82, sz - 0.07), "metal")
            box(item, "cable-tray", (cx, cy + sy * 0.33, sz - 0.17),
                (sx * 0.82, 0.08, 0.12), "dark")
            for index, dx in enumerate((-sx * 0.25, sx * 0.25), start=1):
                chair_y = cy - sy / 2 - 0.34
                box(item, f"chair-{index}-seat", (cx + dx, chair_y, 0.44),
                    (0.46, 0.46, 0.08), "dark")
                box(item, f"chair-{index}-back", (cx + dx, chair_y - 0.21, 0.72),
                    (0.46, 0.06, 0.56), "dark")
                for leg_dx in (-0.16, 0.16):
                    box(item, f"chair-{index}-leg-{leg_dx}",
                        (cx + dx + leg_dx, chair_y, 0.20),
                        (0.035, 0.035, 0.40), "metal")
        elif kind == "oval-marble-table":
            cyl(item, "top", (cx, cy, sz - 0.04), sy / 2, 0.08,
                "lilac-marble", scale_xy=(sx / sy, 1.0))
            cyl(item, "pedestal", (cx, cy, (sz - 0.08) / 2), sy * 0.20,
                sz - 0.08, "stone", scale_xy=(1.25, 1.0))
        else:
            raise ValueError(f"unsupported fixture kind: {kind}")

        for obj in objects[before:]:
            obj["fixture_id"] = item["id"]
            obj["fixture_kind"] = kind
            obj["space_id"] = item["space_id"]
            obj["evidence"] = item.get("evidence", "inferred")
    return objects


def add_wall(wall, height, collection, mat):
    a = Vector((mm(wall["a"][0]), mm(wall["a"][1])))
    b = Vector((mm(wall["b"][0]), mm(wall["b"][1])))
    delta = b - a
    length = delta.length
    angle = math.atan2(delta.y, delta.x)
    center = (a + b) / 2
    return add_box(
        f"wall/{wall['id']}",
        (center.x, center.y, height / 2),
        (length, mm(wall["thickness"]), height),
        angle,
        collection,
        mat,
    )


def cut_opening(wall_obj, wall, opening, collection):
    a = Vector((mm(wall["a"][0]), mm(wall["a"][1])))
    b = Vector((mm(wall["b"][0]), mm(wall["b"][1])))
    direction = (b - a).normalized()
    start = a + direction * mm(opening["offset"])
    end = start + direction * mm(opening["width"])
    center = (start + end) / 2
    z0 = mm(opening.get("sill", 0)) if opening["kind"] == "window" else 0.0
    z1 = mm(opening["head"])
    cutter = add_box(
        f"opening-cutter/{opening['id']}",
        (center.x, center.y, (z0 + z1) / 2),
        ((end - start).length + 0.02, mm(wall["thickness"]) + 0.08, z1 - z0),
        math.atan2(direction.y, direction.x),
        collection,
        # The cutter material becomes visible on window sills when viewed from
        # above. Keep it white so the orthographic cut mask treats the opening
        # as void instead of wall geometry.
        material("validation/opening", (1.0, 1.0, 1.0, 1.0)),
    )
    modifier = wall_obj.modifiers.new(f"cut/{opening['id']}", "BOOLEAN")
    modifier.operation = "DIFFERENCE"
    modifier.solver = "EXACT"
    modifier.object = cutter
    bpy.context.view_layer.objects.active = wall_obj
    wall_obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    wall_obj.select_set(False)
    bpy.data.objects.remove(cutter, do_unlink=True)


def add_door_swing_marker(opening, start, end, collection, mat, leaf_mat=None):
    """Add a review-only leaf and swing arc from explicit semantic orientation."""
    hinge_name = opening.get("hinge")
    swing_side = opening.get("swing_side")
    if hinge_name not in {"a", "b"} or swing_side not in {"left", "right"}:
        return []
    wall_direction = (end - start).normalized()
    hinge = start if hinge_name == "a" else end
    closed_direction = wall_direction if hinge_name == "a" else -wall_direction
    left_normal = Vector((-wall_direction.y, wall_direction.x))
    open_direction = left_normal if swing_side == "left" else -left_normal
    width = (end - start).length
    head = mm(opening["head"])
    leaf_center = hinge + open_direction * width / 2
    leaf = add_box(
        f"opening/{opening['id']}/leaf",
        (leaf_center.x, leaf_center.y, head / 2),
        (width, 0.035, head),
        math.atan2(open_direction.y, open_direction.x), collection, leaf_mat or mat)

    curve = bpy.data.curves.new(f"opening/{opening['id']}/swing-arc", type="CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = 0.012
    curve.bevel_resolution = 2
    spline = curve.splines.new("POLY")
    steps = 20
    spline.points.add(steps)
    closed_angle = math.atan2(closed_direction.y, closed_direction.x)
    open_angle = math.atan2(open_direction.y, open_direction.x)
    delta = (open_angle - closed_angle + math.pi) % (2 * math.pi) - math.pi
    for index in range(steps + 1):
        angle = closed_angle + delta * index / steps
        point = hinge + Vector((math.cos(angle), math.sin(angle))) * width
        spline.points[index].co = (point.x, point.y, 0.035, 1.0)
    arc = bpy.data.objects.new(f"opening/{opening['id']}/swing-arc", curve)
    curve.materials.append(mat)
    collection.objects.link(arc)
    pieces = [leaf, arc]
    for piece in pieces:
        piece["opening_id"] = opening["id"]
        piece["opening_kind"] = "door"
        piece["swing_status"] = opening.get("swing_status", "needs_review")
        piece["hinge"] = hinge_name
        piece["swing_side"] = swing_side
        piece["opens_to"] = opening.get("opens_to", "")
        piece.hide_render = True
    return pieces


def add_opening_marker(wall, opening, collection, mat,
                       review_mat=None, accepted_mat=None):
    """Add reversible frame and optional semantically explicit door proxies."""
    a = Vector((mm(wall["a"][0]), mm(wall["a"][1])))
    b = Vector((mm(wall["b"][0]), mm(wall["b"][1])))
    direction = (b - a).normalized()
    start = a + direction * mm(opening["offset"])
    end = start + direction * mm(opening["width"])
    center = (start + end) / 2
    angle = math.atan2(direction.y, direction.x)
    sill = mm(opening.get("sill", 0)) if opening["kind"] == "window" else 0.0
    head = mm(opening["head"])
    frame_width = 0.05
    depth = mm(wall["thickness"]) + 0.03
    pieces = []
    for suffix, point in (("jamb-a", start), ("jamb-b", end)):
        pieces.append(add_box(
            f"opening/{opening['id']}/{suffix}",
            (point.x, point.y, (sill + head) / 2),
            (frame_width, depth, head - sill), angle, collection, mat))
    pieces.append(add_box(
        f"opening/{opening['id']}/head",
        (center.x, center.y, head - frame_width / 2),
        ((end - start).length, depth, frame_width), angle, collection, mat))
    if opening["kind"] == "window":
        pieces.append(add_box(
            f"opening/{opening['id']}/sill",
            (center.x, center.y, sill + frame_width / 2),
            ((end - start).length, depth, frame_width), angle, collection, mat))
    elif opening.get("hinge") and opening.get("swing_side"):
        swing_mat = (accepted_mat if opening.get("swing_status") == "confirmed"
                     else review_mat) or mat
        leaf_color = opening.get("leaf_color")
        leaf_mat = None
        if isinstance(leaf_color, list) and len(leaf_color) in {3, 4}:
            rgba = tuple(float(value) for value in leaf_color)
            if len(rgba) == 3:
                rgba += (1.0,)
            leaf_mat = material(
                f"architecture/door-leaf/{opening['id']}", rgba)
        pieces.extend(add_door_swing_marker(
            opening, start, end, collection, swing_mat, leaf_mat=leaf_mat))
    for piece in pieces:
        piece["opening_id"] = opening["id"]
        piece["opening_kind"] = opening["kind"]
        piece["wall_id"] = opening["wall_id"]
        piece.hide_render = True
    return pieces


def add_floor(boundary, collection, mat, thickness=0.05):
    points = [(mm(x), mm(y)) for x, y in boundary]
    bottom = [(x, y, -thickness) for x, y in points]
    top = [(x, y, 0.0) for x, y in points]
    vertices = bottom + top
    count = len(points)
    faces = [tuple(reversed(range(count))), tuple(range(count, count * 2))]
    for index in range(count):
        nxt = (index + 1) % count
        faces.append((index, nxt, count + nxt, count + index))
    mesh = bpy.data.meshes.new("floor/property-boundary-mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new("floor/property-boundary", mesh)
    collection.objects.link(obj)
    obj.data.materials.append(mat)
    return obj


def add_circulation_markers(plan, collection, mat):
    """Build review-only curves through each connection's semantic portal."""
    spaces = {space["id"]: space for space in plan.get("spaces", [])}
    walls = {wall["id"]: wall for wall in plan.get("walls", [])}
    openings = {opening["id"]: opening for opening in plan.get("openings", [])}
    removed = {item["id"]: item for item in plan.get("removed_walls", [])}

    def center(space):
        points = space["polygon"]
        return Vector((sum(mm(p[0]) for p in points) / len(points),
                       sum(mm(p[1]) for p in points) / len(points)))

    def portal(connection):
        if connection["kind"] == "door":
            opening = openings[connection["opening_id"]]
            wall = walls[opening["wall_id"]]
            wall_a = Vector((mm(wall["a"][0]), mm(wall["a"][1])))
            wall_b = Vector((mm(wall["b"][0]), mm(wall["b"][1])))
            direction = (wall_b - wall_a).normalized()
            start = wall_a + direction * mm(opening["offset"])
            end = start + direction * mm(opening["width"])
        elif connection["kind"] == "removed-wall":
            item = removed[connection["removed_wall_id"]]
            start = Vector((mm(item["a"][0]), mm(item["a"][1])))
            end = Vector((mm(item["b"][0]), mm(item["b"][1])))
        else:
            start = Vector((mm(connection["segment"][0][0]),
                            mm(connection["segment"][0][1])))
            end = Vector((mm(connection["segment"][1][0]),
                          mm(connection["segment"][1][1])))
        return (start + end) / 2

    objects = []
    for connection in plan.get("connections", []):
        a_id, b_id = connection["spaces"]
        points = [center(spaces[a_id]), portal(connection), center(spaces[b_id])]
        curve = bpy.data.curves.new(f"circulation/{connection['id']}", type="CURVE")
        curve.dimensions = "3D"
        curve.bevel_depth = 0.025
        curve.bevel_resolution = 2
        spline = curve.splines.new("POLY")
        spline.points.add(len(points) - 1)
        for index, point in enumerate(points):
            spline.points[index].co = (point.x, point.y, 0.075, 1.0)
        obj = bpy.data.objects.new(f"circulation/{connection['id']}", curve)
        curve.materials.append(mat)
        collection.objects.link(obj)
        obj["connection_id"] = connection["id"]
        obj["connection_kind"] = connection["kind"]
        obj["space_a"] = a_id
        obj["space_b"] = b_id
        obj.hide_render = True
        obj.hide_set(True)
        objects.append(obj)
    return objects


def configure_top_camera(plan, image_size, collection, cut_height_mm):
    model = plan["calibration"]["model_points"]
    image = plan["calibration"]["image_points"]
    import numpy as np

    design = np.column_stack([np.asarray(model, dtype=float), np.ones(len(model))])
    coeff, _, _, _ = np.linalg.lstsq(design, np.asarray(image, dtype=float), rcond=None)
    linear = coeff[:2, :].T
    offset = coeff[2, :]
    inverse = np.linalg.inv(linear)
    width, height = image_size
    center_mm = inverse @ (np.asarray([width / 2, height / 2]) - offset)
    x_scale = abs(linear[0, 0])
    # Blender's orthographic camera scale is the horizontal view width for this
    # render setup; derive it from the calibrated image X scale.
    ortho_width_m = width / x_scale / 1000.0
    bpy.ops.object.camera_add(location=(mm(center_mm[0]), mm(center_mm[1]), 30.0))
    camera = bpy.context.object
    camera.name = "validation/camera-top"
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = ortho_width_m
    camera.data.clip_start = 0.1
    camera.data.clip_end = camera.location.z + 1.0
    camera.rotation_euler = (0.0, 0.0, 0.0)
    move_to_collection(camera, collection)
    camera.hide_set(True)
    return camera


def attach_reference_background(camera, reference_path):
    image = bpy.data.images.load(str(reference_path), check_existing=True)
    camera.data.show_background_images = True
    camera.data.background_images.clear()
    background = camera.data.background_images.new()
    background.image = image
    background.alpha = 0.72
    background.display_depth = "BACK"
    background.frame_method = "FIT"
    return image


def build(plan_path, output_blend, render_path=None, wall_height_mm=2700,
          image_size=(1600, 1280), validation_cut_height_mm=1200,
          reset_current_scene=True, report_path=None):
    plan_path = Path(plan_path).resolve()
    plan_bytes = plan_path.read_bytes()
    plan = json.loads(plan_bytes.decode("utf-8"))
    if plan.get("units") != "mm":
        raise ValueError("architecture builder currently requires units=mm")
    reference_path = (plan_path.parent / plan["reference_image"]).resolve()
    if not reference_path.exists():
        raise FileNotFoundError(f"reference image not found: {reference_path}")
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.scene.unit_settings.length_unit = "METERS"
    if reset_current_scene:
        reset_scene()
    collection = ensure_collection(COLLECTION_NAME)
    cut_collection = ensure_collection(CUT_COLLECTION_NAME)
    space_collection = ensure_collection(SPACE_COLLECTION_NAME)
    opening_collection = ensure_collection(OPENING_COLLECTION_NAME)
    circulation_collection = ensure_collection(CIRCULATION_COLLECTION_NAME)
    built_in_collection = ensure_collection(BUILT_IN_COLLECTION_NAME)
    fixture_collection = ensure_collection(FIXTURE_COLLECTION_NAME)
    wall_mat = material("validation/wall", (0.08, 0.08, 0.08, 1.0))
    interior_wall_mat = material(
        "architecture/interior-wall-ivory", (0.96, 0.94, 0.90, 1.0))
    floor_mat = wood_plank_tile_material()
    beam_mat = material("validation/beam", (0.35, 0.12, 0.55, 1.0))
    space_mat = material("validation/space-label", (0.05, 0.25, 0.75, 1.0))
    window_mat = material(
        "architecture/window-frame-black", (0.015, 0.015, 0.015, 1.0))
    door_mat = material("validation/door-frame", (1.0, 0.35, 0.05, 1.0))
    review_mat = material("validation/status-needs-review", (0.9, 0.03, 0.03, 1.0))
    accepted_mat = material("validation/status-accepted", (0.05, 0.65, 0.15, 1.0))
    circulation_mat = material("validation/circulation", (0.0, 0.75, 0.95, 1.0))
    cabinet_mat = material(
        "architecture/built-in-warm-ivory", (0.68, 0.61, 0.52, 1.0))
    cabinet_front_mat = material(
        "architecture/built-in-front-warm-ivory", (0.91, 0.87, 0.79, 1.0))
    countertop_mat = material(
        "architecture/countertop-warm-stone", (0.36, 0.31, 0.26, 1.0))
    fixture_mats = {
        "appliance": material("architecture/appliance-white", (0.80, 0.81, 0.82, 1.0)),
        "appliance-front": material("architecture/appliance-front", (0.92, 0.93, 0.94, 1.0)),
        "cabinet-front": cabinet_front_mat,
        "ceramic": material("architecture/ceramic-white", (0.94, 0.95, 0.96, 1.0)),
        "dark": material("architecture/appliance-black", (0.025, 0.028, 0.032, 1.0)),
        "desk": material("architecture/desk-warm-wood", (0.42, 0.23, 0.11, 1.0)),
        "glass": material("architecture/shower-glass", (0.35, 0.68, 0.78, 0.38)),
        "lilac-marble": pale_lilac_marble_material(),
        "metal": material("architecture/brushed-metal", (0.31, 0.34, 0.37, 1.0)),
        "mirror": material("architecture/mirror-blue-grey", (0.38, 0.54, 0.62, 1.0)),
        "sink-dark": material("architecture/sink-shadow", (0.12, 0.14, 0.15, 1.0)),
        "stone": countertop_mat,
    }
    add_floor(plan["property_boundary"], collection, floor_mat)
    built_in_objects = add_built_ins(
        plan, built_in_collection, cabinet_mat, cabinet_front_mat,
        countertop_mat)
    fixture_objects = add_fixtures(plan, fixture_collection, fixture_mats)
    height = mm(wall_height_mm)
    wall_map = {}
    structural_objects = []
    for wall in plan.get("walls", []):
        display_mat = interior_wall_mat if wall.get("class") == "interior" else wall_mat
        wall_obj = add_wall(wall, height, collection, display_mat)
        wall_map[wall["id"]] = (wall, wall_obj)
        structural_objects.append(wall_obj)
    for opening in plan.get("openings", []):
        wall, wall_obj = wall_map[opening["wall_id"]]
        cut_opening(wall_obj, wall, opening, collection)
        add_opening_marker(
            wall, opening, opening_collection,
            window_mat if opening["kind"] == "window" else door_mat,
            review_mat=review_mat, accepted_mat=accepted_mat)
    for beam in plan.get("beams", []):
        a = Vector((mm(beam["a"][0]), mm(beam["a"][1])))
        b = Vector((mm(beam["b"][0]), mm(beam["b"][1])))
        delta = b - a
        center = (a + b) / 2
        z0, z1 = mm(beam["underside"]), mm(beam["top"])
        beam_obj = add_box(f"beam/{beam['id']}", (center.x, center.y, (z0 + z1) / 2),
                           (delta.length, mm(beam["width"]), z1 - z0),
                           math.atan2(delta.y, delta.x), collection, beam_mat)
        structural_objects.append(beam_obj)
    cut_objects = create_validation_cut(
        structural_objects, plan, validation_cut_height_mm, cut_collection, wall_mat)
    add_space_markers(plan, space_collection, space_mat)
    circulation_objects = add_circulation_markers(
        plan, circulation_collection, circulation_mat)
    add_acceptance_marker(plan, space_collection, review_mat, accepted_mat)
    camera = configure_top_camera(plan, image_size, collection, validation_cut_height_mm)
    attach_reference_background(camera, reference_path)
    scene = bpy.context.scene
    scene["cad_2d_to_3d.plan_path"] = str(plan_path)
    scene["cad_2d_to_3d.plan_sha256"] = hashlib.sha256(plan_bytes).hexdigest()
    scene["cad_2d_to_3d.reference_image"] = str(reference_path)
    scene["cad_2d_to_3d.acceptance_status"] = plan.get(
        "acceptance", {}).get("status", "needs_review")
    acceptance_checks = plan.get("acceptance_checks", [])
    scene["cad_2d_to_3d.acceptance_checks"] = json.dumps(
        acceptance_checks, ensure_ascii=False)
    scene["cad_2d_to_3d.pending_acceptance_checks"] = json.dumps([
        check.get("id") for check in acceptance_checks
        if check.get("status") != "confirmed" and check.get("id")
    ], ensure_ascii=False)
    scene["cad_2d_to_3d.schema_version"] = int(plan.get("schema_version", 1))
    scene["cad_2d_to_3d.validation_cut_height_mm"] = float(validation_cut_height_mm)
    scene["cad_2d_to_3d.connections"] = json.dumps(
        plan.get("connections", []), ensure_ascii=False)
    scene["cad_2d_to_3d.circulation"] = json.dumps(
        plan.get("circulation", {}), ensure_ascii=False)
    scene.camera = camera
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x, scene.render.resolution_y = image_size
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    world = scene.world or bpy.data.worlds.new("World")
    scene.world = world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    if background:
        background.inputs["Color"].default_value = (1.0, 1.0, 1.0, 1.0)
        background.inputs["Strength"].default_value = 1.0
    bpy.context.view_layer.update()
    for window in bpy.context.window_manager.windows:
        for area in window.screen.areas:
            if area.type == "VIEW_3D":
                area.tag_redraw()
    output_blend = str(Path(output_blend).resolve())
    bpy.ops.wm.save_as_mainfile(filepath=output_blend)
    if render_path:
        previous_source_render = {obj: obj.hide_render for obj in collection.objects}
        for obj in collection.objects:
            obj.hide_render = True
        for obj in cut_objects:
            obj.hide_render = False
        scene.render.filepath = str(Path(render_path).resolve())
        bpy.ops.render.render(write_still=True)
        for obj, hidden in previous_source_render.items():
            obj.hide_render = hidden
        for obj in cut_objects:
            obj.hide_render = True
        bpy.ops.wm.save_as_mainfile(filepath=output_blend)
    frame_top_view(plan)
    bpy.context.view_layer.update()
    report = {
        "status": "ok",
        "blend_file": output_blend,
        "render_path": str(Path(render_path).resolve()) if render_path else None,
        "plan_path": str(plan_path),
        "plan_sha256": hashlib.sha256(plan_bytes).hexdigest(),
        "reference_image": str(reference_path),
        "acceptance_status": plan.get("acceptance", {}).get(
            "status", "needs_review"),
        "acceptance_checks": acceptance_checks,
        "pending_acceptance_checks": [
            check.get("id") for check in acceptance_checks
            if check.get("status") != "confirmed" and check.get("id")
        ],
        "wall_height_mm": wall_height_mm,
        "walls": len(plan.get("walls", [])),
        "openings": len(plan.get("openings", [])),
        "beams": len(plan.get("beams", [])),
        "spaces": len(plan.get("spaces", [])),
        "opening_marker_objects": len(opening_collection.objects),
        "connections": len(plan.get("connections", [])),
        "circulation": plan.get("circulation", {}),
        "circulation_marker_objects": len(circulation_objects),
        "built_ins": len(plan.get("built_ins", [])),
        "built_in_objects": len(built_in_objects),
        "fixtures": len(plan.get("fixtures", [])),
        "fixture_objects": len(fixture_objects),
        "window_verticals_mm": {
            opening["id"]: {
                "sill": opening.get("sill", 0),
                "height": opening.get(
                    "height", opening["head"] - opening.get("sill", 0)),
                "head": opening["head"],
            }
            for opening in plan.get("openings", [])
            if opening["kind"] == "window"
        },
        "validation_cut_height_mm": validation_cut_height_mm,
        "collection": COLLECTION_NAME,
        "validation_collection": CUT_COLLECTION_NAME,
        "space_collection": SPACE_COLLECTION_NAME,
        "opening_collection": OPENING_COLLECTION_NAME,
        "circulation_collection": CIRCULATION_COLLECTION_NAME,
        "built_in_collection": BUILT_IN_COLLECTION_NAME,
        "fixture_collection": FIXTURE_COLLECTION_NAME,
    }
    if report_path:
        report_file = Path(report_path).resolve()
        report_file.parent.mkdir(parents=True, exist_ok=True)
        report_file.write_text(json.dumps(report, indent=2), encoding="utf-8")
        report["report_path"] = str(report_file)
    return report
