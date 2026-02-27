# Schedule Visualizer Design

## Problem
The app generates `.ics` calendar files but students can't preview what their schedule looks like before downloading. The only feedback is an event count. Students want to **see** their weekly timetable visually.

## Decisions

### View Type
Weekly grid — CSS Grid with days as columns (Mon-Fri) and hours as rows (8:00-20:00). Events placed using grid-row/grid-column positioning. Pure vanilla JS + CSS, no external libraries.

### Layout
**Desktop (>=768px):** Side-by-side — controls panel on the left (~320px fixed), schedule grid on the right (flex-grow). Controls are always visible; no progressive disclosure.

**Mobile (<768px):** Full-screen grid with bottom sheet controls.
- Grid shows single-day view with day tabs (Luni/Marti/Miercuri/Joi/Vineri)
- Controls in a draggable bottom sheet: peek state shows current selection summary, expanded shows all controls
- Download/Share buttons pinned above the bottom sheet

### Frequency Toggle
Three-way toggle above the grid: `[Week 1] [Week 2] [All]`
- "All" shows every event (default)
- "Week 1" / "Week 2" filter by `frequency` field (`sapt. 1`, `sapt. 2`, `every`)
- Events with `frequency: "every"` always show

### Event Blocks
Each event block shows:
- Abbreviated subject name (truncated with ellipsis if needed)
- Type badge: colored `[C]` / `[S]` / `[L]`
- Room code

Color coding by type:
- Course (Curs): primary color
- Seminar: a secondary/accent color
- Lab (Laborator): a third distinct color

All colors use existing CSS token system for theme compatibility.

### Overlap / Conflict Handling
Side-by-side columns within the time slot (Google Calendar style):
1. Group events by day
2. For each day, detect overlapping time ranges
3. Assign sub-columns to overlapping events
4. Each event's width = `100% / numOverlapping`, offset by column index

### Shareable URLs
Encode selections in URL query params:
- `?spec=M1&group=0&sub=1&freq=all`
- On page load, check for URL params and restore state from them (takes priority over localStorage)
- "Share" button copies the URL to clipboard

### Quick Download Section
Remains unchanged below the builder/viewer.

## Architecture

### New Functions (app.js)
- `renderScheduleGrid(entries)` — builds the CSS Grid DOM
- `detectOverlaps(dayEntries)` — returns column assignments for overlapping events
- `updateScheduleGrid()` — called by `updatePreview()`, re-renders grid with current filtered entries
- `initBottomSheet()` — mobile bottom sheet drag behavior
- `initDayTabs()` — mobile single-day view switching
- `encodeStateToURL()` / `decodeStateFromURL()` — shareable URL handling

### CSS Additions (style.css)
- `.app-layout` — the side-by-side flex/grid container
- `.controls-panel` — left sidebar styles
- `.schedule-grid` — the weekly grid container
- `.schedule-event` — individual event block styles (with type-color variants)
- `.frequency-toggle` — week 1/2/all pill group
- `.bottom-sheet` — mobile bottom sheet
- `.day-tabs` — mobile day tab bar
- Event type color tokens: `--color-course`, `--color-seminar`, `--color-lab`

### HTML Changes (index.html.j2)
- Wrap builder in `.app-layout` container
- Move controls into `.controls-panel`
- Add `.schedule-grid` container in main area
- Add frequency toggle and share button
- Add bottom sheet markup for mobile
- Add day tabs markup for mobile

### Data Flow
1. User changes any selection → `updatePreview()` is called (existing)
2. `updatePreview()` calls `updateScheduleGrid()` with filtered entries
3. `updateScheduleGrid()` groups entries by day, detects overlaps, renders grid
4. Frequency toggle filters entries before rendering
5. URL params updated on every state change via `encodeStateToURL()`
