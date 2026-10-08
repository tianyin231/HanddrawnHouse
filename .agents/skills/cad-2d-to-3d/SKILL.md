---
name: cad-2d-to-3d
description: Reconstruct, assess, and validate candidate 3D geometry from accepted 2D CAD or engineering drawings, with separate architectural-floorplan and mechanical-part workflows. Use for DWG, DXF, semantic floor-plan contracts, vector PDF, scanned drawing, sketch, blueprint, orthographic-view, section-view, or 2D-to-3D requests where an agent must distinguish building topology from part features, build an editable candidate, compare generated projections with the accepted 2D source, use live CAD or official Blender MCP tools, or report missing information without overstating fidelity.
---

# 2D CAD to 3D

## Purpose

Turn 2D engineering evidence into an inspectable 3D candidate and an explicit
uncertainty report. Optimize for engineering traceability, not a visually
plausible render. A matching projection does not prove the hidden 3D surfaces
or manufacturing definition are correct.

Pair this skill with `geometry-preview` for lightweight geometry generation and
with a live CAD skill such as FreeCAD or Autodesk Fusion when B-rep editing,
native export, or desktop validation is required.

## 1. Classify the domain and deliverable

Choose exactly one primary profile before modeling:

- **Architectural floor plan**: property boundary, spaces, adjacency, wall
  thickness, doors, windows, removed walls, retained piers, columns, beams,
  levels, and circulation are authoritative. Read
  [architecture-floorplans.md](references/architecture-floorplans.md).
- **Mechanical part**: orthographic/section correspondence, feature order,
  holes, pockets, repeated features, datums, tolerances, and manufacturing
  completeness are authoritative. Read
  [mechanical-parts.md](references/mechanical-parts.md).

Do not apply mechanical manufacturing gates to a building shell, or treat a
mechanical drawing as a room-adjacency problem.

Classify the request before modeling:

- **Concept candidate**: recognizable topology and major dimensions.
- **Editable reconstruction**: parametric B-rep, named parameters, STEP/native
  CAD, and reproducible source.
- **Manufacturing model**: requires sufficient tolerances, datums, material,
  process, hidden geometry, and human engineering acceptance.

Do not silently promote a concept candidate into a manufacturing model.

## 2. Select the Geometry Authority

Use sources in this order when available:

1. Native 3D CAD or neutral B-rep (`STEP`, `Parasolid`, `ACIS`).
2. Vector 2D CAD (`DWG`, `DXF`) and vector PDF.
3. Dimensioned raster drawing or scan.
4. Undimensioned image, photograph, or sketch.

Parse vector entities directly before using screenshots. Use image
understanding for view semantics, line-role classification, and ambiguity—not
as a substitute for exact coordinates already present in CAD.

Read [source-routing.md](references/source-routing.md) when choosing parsers,
conversion paths, CAD kernels, or raster fallbacks.

## 3. Build a profile-specific evidence map

For architecture, stop here and follow the semantic-plan workflow in
[architecture-floorplans.md](references/architecture-floorplans.md). Require an
accepted 2D plan contract before detailed 3D work. Do not reinterpret property
ownership, room adjacency, or opening types while extruding the shell.

For mechanical parts, follow
[mechanical-parts.md](references/mechanical-parts.md) and build the view and
constraint map below.

Identify for every view:

- view type and direction: front, back, side, auxiliary, detail, or section
- shared origin, axis, units, scale, and projection convention
- section path and whether it is straight, offset, aligned, or partial
- visible, hidden, center, construction, dimension, hatch, and title-block lines
- repeated features, symmetry, pitch angles, and projected correspondences

Keep numeric authority separate from topology authority and visual reference.
Record each extracted fact as `known`, `derived`, `inferred`, `missing`, or
`conflicting`. Use [reconstruction-contract.md](references/reconstruction-contract.md)
for the evidence contract.

## 4. Run the mechanical information-completeness gate

Before building, ask whether the views uniquely constrain:

- outer envelope and wall/section thickness
- holes, pockets, counterbores, and repeated features
- front/back depth, offsets, and mounting faces
- freeform surface depth, twist, and cross-sections
- blends, fillets, chamfers, draft, and backside relief
- datums, fits, tolerances, material, and manufacturing process

If not unique, continue only as one or more labeled candidates. List the
additional views, sections, dimensions, scan data, or original CAD needed to
resolve the ambiguity.

## 5. Reconstruct the mechanical part in stable feature order

Prefer this engineering sequence:

1. Establish axes, units, and reference planes.
2. Build authoritative revolved or extruded primary sections.
3. Add bores, bolt circles, slots, pockets, and repeated features.
4. Reconstruct one periodic sector before circular or linear patterning.
5. Build freeform parts with source-derived boundaries, multiple transverse
   sections, and guide curves.
6. Add blends, draft, and small manufacturing details only after silhouettes
   and sections agree.

Keep inferred parameters exposed. Preserve a regenerating script or feature
history instead of delivering only a mesh.

## 6. Close the projection loop

Generate the same front/back/side/section views from the candidate B-rep.
Calibrate source and candidate to the same physical scale and orientation.

Compare in layers:

1. envelope and axes
2. hole centers and diameters
3. repeated-feature phase and pitch
4. silhouettes and section profiles
5. internal/hidden edges
6. local blends and small features

Use `scripts/compare_projection.py` for same-size binary line-image scoring and
red/blue overlays. Treat the score as a regression signal between candidates,
not a claim of dimensional accuracy. Keep dimensions, annotations, centerlines,
and title blocks out of the scored mask when possible.
Let the script choose per-image thresholds when viewport and source backgrounds
differ. Treat an empty or majority-foreground mask warning as a failed
comparison setup, not as evidence about geometry.

For architecture, project the candidate back to a strict orthographic plan at
the accepted cut plane. Compare boundary, wall centre lines and thickness,
openings, retained structure, and excluded regions separately. Do not score
furniture, dimensions, annotations, lighting, or materials as shell geometry.

## 7. Validate the geometry artifact

Check at least:

- valid B-rep or mesh and expected solid/shell count
- bounds and units against authoritative dimensions
- connected components and unintended intersections
- hole count, pitch, symmetry, and section thickness
- STEP round-trip into the target CAD tool when delivery depends on it
- native save/import errors and body count

For Blender architectural work, prefer the official Blender MCP tools when a
live connected instance already exists:

1. inspect the current scene before mutation
2. execute bounded `bpy` changes in the connected instance
3. update the dependency graph and tag `VIEW_3D` areas for redraw
4. save a checkpoint
5. capture the current Blender window or viewport through MCP
6. generate the orthographic validation projection

Do not use background Blender plus GUI reload when the connected MCP can update
the live scene directly. Fall back to the `blender-sim` live bridge or a
one-shot background build only when MCP is unavailable or isolation is desired.

Use screenshots only as review evidence. Geometry validity, bounds, and CAD
round-tripping are stronger evidence.

## 8. Deliver With an Uncertainty Ledger

Leave a proportional artifact set:

- parametric source or regenerating script
- editable B-rep (`STEP` and native CAD when useful)
- front/back/section projections
- side-by-side and overlay comparisons
- QA report with bounds, units, solid count, checks, and failures
- known/inferred/missing/conflicting inputs
- explicit suitability: concept, editable candidate, or manufacturing-ready

Stop and request engineering input when missing data can materially change
fit, strength, balance, tooling, safety, or manufacturing acceptance.
