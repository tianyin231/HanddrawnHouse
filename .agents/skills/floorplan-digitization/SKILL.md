---
name: floorplan-digitization
description: Digitize architectural floor plans from PDF, JPG, PNG, scans, screenshots, or vector drawings into calibrated 2D CAD and a semantic plan contract. Use when Codex must recover walls, excluded neighbouring regions, rooms, doors, windows, beams, columns, removed walls, and dimension anchors; generate DXF/SVG and image overlays; distinguish authoritative dimensions from raster measurements; or validate a floor plan before any 3D reconstruction.
---

# Floorplan Digitization

Build a dimensioned 2D source of truth before making architectural 3D geometry.
Do not present raster tracing as survey-grade or as-built accuracy.

## 1. Classify the source

Prefer evidence in this order:

1. Native DWG/DXF.
2. Vector PDF with recoverable line and text entities.
3. Dimensioned raster PDF/image.
4. Undimensioned scan, screenshot, or sketch.

Extract vector entities before rasterizing a vector PDF. For raster sources,
use image processing to propose line candidates, not to decide wall semantics.

## 2. Establish the plan contract

Read [plan-contract.md](references/plan-contract.md) before creating the JSON.
Record every important fact as `known`, `derived`, `inferred`, `missing`, or
`conflicting`. Keep these distinct:

- numeric authority: printed dimensions and confirmed measurements
- topology authority: room adjacency, ownership boundary, openings, removed walls
- visual reference: apparent line positions in the scan
- calibration anchors: pixel/model point pairs used only to register the image

Explicitly encode excluded neighbour/common areas. A blank or outlined region in
an architectural drawing is not automatically part of the subject property.

## 3. Calibrate before tracing

Use at least three non-collinear anchors spanning both axes. Prefer overall and
independent dimension-chain endpoints over furniture dimensions. Fit the image
registration, inspect residuals, and reject anchors that conflict with the
printed dimension network.

Do not use one global pixels-per-millimetre value when the scan has rotation,
skew, or perspective distortion. Rectify the image or use an affine transform.

## 4. Digitize in architectural order

Work in this order:

1. subject-property boundary and excluded regions
2. exterior and interior wall centre lines plus thickness
3. retained piers, columns, and overhead beams
4. removed walls and open connections
5. doors and swing directions
6. windows and sill/head heights
7. named spaces and fixed equipment
8. loose furniture only after the shell gate passes

Never infer a door or window merely because a raster wall has a light gap.

## 5. Generate review artifacts

Run:

```powershell
python scripts/build_floorplan_artifacts.py plan.json --output-dir artifacts
```

The script generates:

- `floorplan.dxf`: layered 2D CAD candidate
- `floorplan.svg`: portable vector review artifact
- `floorplan_cad.png`: clean candidate rendering
- `floorplan_overlay.png`: candidate over the calibrated source image
- `floorplan_semantic_review.png`: calibrated overlay labeled with space,
  opening, and beam IDs for human correction
- `floorplan_shell_mask.png`: annotation-free full wall-footprint mask
- `floorplan_cut_1200_mask.png`: default 1.2 m plan-cut mask including openings
- `floorplan_validation.json`: calibration and semantic checks

Use these as a review bundle. DXF is not sufficient by itself because it does
not reliably preserve architectural semantics across applications.

Pass the same `--cut-height-mm` to 2D and 3D validation. A wall-top projection
cannot validate door or window openings because lintels obscure them.

## 6. Apply the 2D acceptance gate

Do not hand off to 3D until a human has accepted:

- property/exclusion boundary
- exterior and interior wall topology
- door and window wall assignments
- demolished openings, retained piers, beams, and columns
- calibration residuals and unresolved dimension conflicts

Treat an overlay as visual evidence, not dimensional proof. The printed
dimension network and semantic contract remain authoritative.

## 7. Hand off to 3D

Pass both DXF and the semantic JSON to `cad-2d-to-3d`. The 3D skill must consume
the accepted contract without reinterpreting room ownership or inventing
openings. Preserve the same world origin and units across all generated models.
