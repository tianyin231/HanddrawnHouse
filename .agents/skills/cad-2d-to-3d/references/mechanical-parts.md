# Mechanical-part profile

Use this profile for discrete manufactured parts and assemblies whose geometry
is defined by orthographic views, sections, dimensions, datums, and feature
relationships. Do not use it for architectural plans.

## Authority and evidence

Prefer native CAD or STEP over 2D drawings. When reconstructing from drawings,
separate:

- exact dimensions and tolerances
- correspondence between front, side, top, detail, and section views
- feature semantics such as holes, pockets, ribs, bosses, threads, and patterns
- inferred depths, hidden surfaces, blends, draft, and manufacturing process

Record each item as `known`, `derived`, `inferred`, `missing`, or
`conflicting`. A visually convincing solid is not manufacturing evidence.

## Stable build order

1. Establish units, datums, axes, and reference planes.
2. Create the primary revolved, extruded, or swept volume.
3. Add authoritative cuts, bores, pockets, and mounting interfaces.
4. Build one repeated feature and pattern it from the documented pitch.
5. Add ribs, freeform transitions, and secondary sections.
6. Add fillets, chamfers, draft, threads, and cosmetic detail last.

Keep inferred parameters named and editable. Prefer a regenerating feature
history or script over an opaque mesh.

## Mechanical acceptance gate

Validate at least:

- overall bounds and mass-driving dimensions
- hole count, centre positions, diameters, and coaxial relationships
- section profiles and wall thicknesses
- symmetry, repeated-feature phase, and pattern pitch
- solid count, manifold or B-rep validity, and unintended intersections
- STEP round-trip when the target workflow depends on neutral CAD exchange

Manufacturing-ready status additionally requires sufficient datums,
tolerances, material, fits, surface requirements, and process definition plus
human engineering acceptance. Otherwise label the result as a concept or
editable reconstruction candidate.
