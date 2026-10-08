# CAD Source and Tool Routing

Choose tools by the uncertainty being resolved. Do not require one vendor stack.

## Source Routing

| Source | First path | Fallback | Main risk |
|---|---|---|---|
| DWG | CAD SDK or installed CAD converter | Convert once to DXF/SVG/PDF | Proprietary entities, proxy objects |
| DXF | Lightweight structured reader | CAD kernel import | Version/entity coverage |
| Vector PDF | Extract vector paths and text | Render selected pages | Lost layers and CAD semantics |
| Raster drawing | OCR plus calibrated line/arc extraction | Manual control points | Scale, skew, occlusion |
| Photograph | Camera calibration and multiple views | Concept-only modeling | Perspective and hidden geometry |

Preserve the original file and conversion report. Never overwrite the sole
source while normalizing formats.

## Representation Routing

- Use ordinary structured reading for layers, entities, blocks, dimensions,
  metadata, and text.
- Use a B-rep kernel for revolutions, lofts, sweeps, Booleans, validity checks,
  and STEP export.
- Use mesh tools only for preview, scan fitting, or downstream mesh tasks; a
  repaired STL is not an editable reconstruction.
- Use a target CAD application when native save, feature editing, or import
  compatibility is part of acceptance.
- Use image understanding to classify views and interpret ambiguous drafting
  conventions after preserving vector geometry.

## Conversion Checks

After conversion, compare:

- entity and block counts
- units and extents
- circles/arcs/splines versus tessellated replacements
- dimension text and measured values
- layer visibility and line types
- model space versus paper space

If a converter flattens dimensions or splines, keep the result as a visual
reference and retain the pre-conversion source as authority.
