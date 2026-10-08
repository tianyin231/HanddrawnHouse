# Architectural floor-plan profile

Use this profile only after the 2D plan has passed its own calibration and
semantic acceptance gate. Consume both the CAD artifact and semantic contract;
do not reinterpret ownership, demolition, or room labels from linework alone.

If a provisional build is needed before acceptance, label it visibly as
`needs_review`, store the status in the Blender scene and QA report, and keep
fixed fit-out and furniture out of scope. A good projection score cannot change
the acceptance state.

## Architectural authority

Prioritize:

1. subject-property and excluded-region boundaries
2. level datum and world origin
3. exterior/interior wall centre lines and thickness
4. room adjacency and circulation
5. doors, windows, sill/head heights, and swing direction
6. removed walls, retained piers, columns, and overhead beams
7. fixed fit-out
8. loose furniture and visual finishes

A region adjacent to the entrance may be a neighbour/common area. Never include
it merely because it is visible in the source drawing.

## Stable build order

1. Create one collection for reference/validation objects.
2. Create floor slabs from accepted subject-property spaces only.
3. Generate walls from semantic centre lines and thickness.
4. Cut doors and windows by their host-wall ID and measured offset.
5. Generate beams, piers, and columns as independent named objects.
6. Preserve removed-wall semantics without generating full-height geometry.
7. Add fixed fit-out only after the shell projection passes.
8. Link furniture/material/lighting collections only after shell acceptance.

Use stable names such as `wall/<id>`, `opening/<id>`, `beam/<id>`, and
`space/<id>` so validation can map 3D objects back to the 2D contract.

## Assembly strategy

Keep early iterations in one generated shell file with separate collections.
Split only stable responsibilities:

- `shell`: slab, walls, openings, beams, columns
- `opening-markers`: reversible door/window frame proxies driven only by the
  accepted host, offset, width, sill, and head data
- `fixed-fitout`: kitchen, bath, built-in cabinetry
- `furniture`: movable objects
- `master`: linked collections, materials, lights, cameras

All files must share origin, units, axes, and level datum. Do not compensate for
misalignment with per-file placement transforms.

Use frame proxies to make opening topology visible during review. Keep them in
their own collection and exclude them from cut-mask rendering. Do not invent a
door leaf, hinge side, swing arc, glazing subdivision, or construction detail
that is absent from the plan contract.

Create a door leaf and swing arc only when the semantic opening explicitly has
`hinge`, `swing_side`, `opens_to`, and `swing_status`. Color a `needs_review`
orientation as provisional and keep it out of shell projection scoring. Do not
derive a leaf direction merely from room adjacency or from an unaccepted arc in
the raster plan.

## Architectural validation

Validate in layers:

- property boundary and excluded areas
- wall centre lines and thickness
- space adjacency and accessible openings
- explicit space connections and reachability from the main entry
- door/window count, host wall, offset, width, sill, and head
- removed-wall gaps plus retained piers/beam
- overall bounds, floor elevation, wall height, and beam clearance

Generate an orthographic horizontal section at the same accepted cut height as
the 2D mask (1.2 m by default), with flat unlit colors and no furniture.
Register it to the accepted 2D plan and produce an overlay/difference artifact.
Also validate window host, sill, and head data independently: one cut height
cannot prove the full opening height. A wall-top or perspective render is review
evidence only and cannot pass the shell gate.

Register the original plan image as the validation camera background when a
live Blender review is required. Match the camera aspect ratio and calibration,
then switch shell objects to wire display for the review screenshot. Keep this
as a viewport comparison mode; do not embed the raster as geometry or treat its
pixels as more authoritative than printed dimensions and the semantic contract.

In addition to the whole-plan view, capture focused comparisons for every
topology hotspot: the main entrance and adjacent service rooms, every removed
wall with retained piers/beam, corner glazing, and any opening whose host wall
or swing was previously disputed. A whole-plan screenshot can hide a one-wall
or one-opening error. Record each hotspot as a stable acceptance check so an
already confirmed decision is not reinterpreted during later 3D iterations.

When using `scripts/build_architecture_blender.py`, call
`set_reference_review_mode()` to display the true cut collection over the
calibrated background. Do not use the full wall-top wireframe because lintels
and overhead beams conceal openings. Call `set_model_top_view(plan)` to restore
the solid shell and semantic space labels. Call
`set_model_review_region(plan, check_id)` to focus the live top view on the same
stable region used by a local acceptance-check artifact.
Call `set_circulation_review_mode(plan)` to show the semantic connection graph
as a review-only overlay. Keep that collection hidden from shell renders and
ordinary modeling views.

## Live Blender MCP loop

When official Blender MCP is connected, keep the user's current instance as the
collaboration surface. Inspect before editing, mutate in bounded steps, call
`bpy.context.view_layer.update()`, tag each `VIEW_3D` area for redraw, save, and
capture a viewport screenshot after every meaningful step. Use background
Blender only for deterministic isolation or CI.
