# Architectural plan contract

Use one JSON document as the semantic source of truth. DXF and SVG are derived
review artifacts.

## Minimal shape

```json
{
  "schema_version": 1,
  "name": "example-plan",
  "units": "mm",
  "reference_image": "floorplan.png",
  "acceptance": {"status": "needs_review", "note": "awaiting human review"},
  "acceptance_checks": [],
  "calibration": {
    "model_points": [[0, 0], [10000, 0], [0, 8000]],
    "image_points": [[120, 900], [1420, 900], [120, 120]]
  },
  "property_boundary": [[0, 0], [10000, 0], [10000, 8000], [0, 8000]],
  "excluded_regions": [],
  "walls": [],
  "openings": [],
  "beams": [],
  "columns": [],
  "removed_walls": [],
  "spaces": [],
  "connections": [],
  "circulation": {"entry_space": null, "required_reachable_spaces": []},
  "evidence": []
}
```

## Acceptance state

Use `acceptance.status` with either `needs_review` or `accepted`. New and
revised contracts start as `needs_review`. Set `accepted` only after a human has
confirmed the property/exclusion boundary, wall topology, opening assignments,
removed walls, retained structure, and unresolved dimension conflicts. Preserve
a short acceptance note; do not infer acceptance from a high projection score.

Track review decisions as `acceptance_checks` when several local topology
questions are involved. Each check has a stable `id`, a concise `question`, a
`status` of `confirmed` or `needs_review`, and optional `evidence_refs` pointing
to evidence-ledger IDs. Give every check a `review_region` as
`[min_x, min_y, max_x, max_y]` in plan units so the artifact builder can create
a focused registered comparison. A confirmed local check prevents later iterations from
silently reinterpreting that decision, but it does not make the whole plan
accepted. Keep the top-level status at `needs_review` until every required check
is confirmed and the human accepts the complete registered overlay.

## Walls

Represent straight walls by centre line and thickness:

```json
{
  "id": "wall-east",
  "a": [10000, 0],
  "b": [10000, 8000],
  "thickness": 280,
  "class": "exterior",
  "evidence": "known"
}
```

Split curved, stepped, or thickness-changing walls into stable segments.

## Openings

Assign every opening to one wall by ID. `offset` is measured from wall endpoint
`a` along its centre line.

```json
{
  "id": "window-east-bedroom",
  "kind": "window",
  "wall_id": "wall-east",
  "offset": 4200,
  "width": 1800,
  "sill": 650,
  "head": 1830,
  "evidence": "known"
}
```

Doors may add `swing`, `hinge`, `swing_side`, `opens_to`, and `swing_status`.
Use `hinge: "a"` or `"b"` for the corresponding end of the opening segment.
Use `swing_side: "left"` or `"right"` relative to the host wall direction from
`a` to `b`; use a space ID or `outside` for `opens_to`. Keep an inferred leaf at
`swing_status: "needs_review"` so the 3D stage can display it as provisional.
Never encode an opening without a host wall.

Verify the drawing's abbreviation convention before mapping vertical values.
On many Chinese architectural/interior drawings, `CH` means window height
(窗高) and `DH` means sill height (窗台高), so `head = DH + CH`; `CH` is not the
absolute head elevation. Preserve the source height and the derived head when
this convention is used, and validate that `head - sill == height`.

## Beams and removed walls

Represent a retained overhead beam independently from wall geometry. Give it a
plan segment, width, underside elevation, and top elevation. Record removed wall
segments separately so the 3D stage can preserve the historical/topological
meaning without generating a full-height wall.

## Spaces and exclusion

Spaces use closed polygons and stable names. `excluded_regions` must include
neighbour, common, void, or out-of-scope areas that might otherwise be mistaken
for the subject property.

## Connections and circulation

Represent architectural adjacency independently from visual proximity:

```json
{
  "id": "entry-to-bathroom",
  "spaces": ["entry-foyer", "bathroom"],
  "kind": "door",
  "opening_id": "bath-door",
  "evidence": "known"
}
```

Use `door`, `open`, or `removed-wall` as the connection kind. Door connections
reference a door opening; removed-wall connections reference a removed-wall ID;
open connections include a two-point `segment`. Set `circulation.entry_space`
and list every space that must be reachable from it. A geometrically aligned
plan fails architectural validation when the connection graph is wrong or a
required room is unreachable.

## Evidence ledger

Use `known`, `derived`, `inferred`, `missing`, or `conflicting`. Each global
evidence entry should identify the source label or user confirmation. Do not
turn an inferred raster location into `known` merely because it looks aligned.
