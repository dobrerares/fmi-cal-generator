# Per-Subject Subgroup Filtering

## Problem

When "Both" subgroups is selected, the subject list shows one "Lab" checkbox per subject. This single checkbox controls both subgroup 1 and subgroup 2 labs together — there's no way to include one subgroup's lab while excluding the other.

## Solution

Add an inline `[1 | 2 | Both]` mini-pill toggle on each Lab row in the subject list, visible only when the global subgroup selection is "Both".

## Behavior

- **Global subgroup pills** stay as-is and set the default for all labs
- When global is "Subgroup 1" or "Subgroup 2": labs show as a single row with no inline toggle (only one subgroup's entries exist)
- When global is "Both": each Lab row gains an inline `[1 | 2 | Both]` mini-pill toggle, defaulting to "Both"
- Changing the global pill resets all per-subject inline toggles to match

## Data Model

New state:
```
labSubgroupOverrides: Map<subject, '1' | '2' | 'all'>
```

Tracks per-subject subgroup choices. Only meaningful when global subgroup = "Both".

Existing composite key (`subject + '|||' + type`) for excludedKeys stays unchanged.

## Filter Logic (filterEntries)

When encountering a formation like `"211/1"`:
1. Check `labSubgroupOverrides[subject]` for per-subject override
2. Fall back to `selectedSubgroup` (global default)
3. If neither restricts, include the entry

## UI Changes

In `updateSubjects()`, when building a Lab child row and `selectedSubgroup === 'all'` and the group `hasSubgroups`:
- Append a mini pill group (`[1 | 2 | Both]`) to the label
- Styled smaller than the global pills, same visual language
- Default: "Both"
- On toggle: update `labSubgroupOverrides`, refresh preview

## Persistence

Add `labSubgroupOverrides` (serialized as object) to the localStorage state.
Restore on page load alongside other state.

## Unchanged

- Global subgroup card, type toggles, preview, download logic
- Data format (JSON files)
- Subjects without labs
