# Reconstruction Evidence Contract

Use this contract to keep 2D evidence, 3D inference, and validation claims
separate.

## Evidence Classes

| Class | Meaning | Example |
|---|---|---|
| `known` | Explicit in an authoritative source | Dimension, coordinate, material note |
| `derived` | Deterministically computed from known facts | Radius from diameter, array phase from symmetry |
| `inferred` | One reasonable modeling choice among alternatives | Spoke depth between two views |
| `missing` | Required for the requested acceptance level | Backside relief, tolerance, draft |
| `conflicting` | Sources disagree or cannot share one scale/frame | Mismatched dimension and measured curve |

Do not convert `inferred` into `known` because the model imports successfully.

## Minimum Reconstruction Record

Record:

- source files and formats
- units, scale, coordinate frames, and view directions
- deliverable class: concept, editable reconstruction, or manufacturing model
- extracted dimensions and topology invariants with evidence class
- parameter names and values used by the model
- views/sections regenerated from the model
- geometric checks: bounds, validity, solid count, connectivity
- CAD round-trip checks and errors
- unresolved inputs and decisions that depend on them

## Acceptance Levels

### Concept candidate

- major topology and envelope agree
- dimensions used are traceable
- inferred surfaces are labeled

### Editable reconstruction

- valid B-rep and reproducible construction
- major views and sections compared at common scale
- parameters and remaining ambiguity documented
- neutral or native CAD round-trip succeeds

### Manufacturing model

- all fit/function-critical geometry is authoritative
- datums, fits, tolerances, material, process, draft, and surface requirements
  are present or approved
- structural, balance, clearance, and process checks required by the part are
  complete
- responsible human engineering acceptance is recorded

Projection similarity alone can satisfy none of the manufacturing conditions.
