# Schedule Visualizer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a visual weekly schedule grid that replaces the current preview card, with side-by-side layout on desktop and bottom-sheet controls on mobile.

**Architecture:** Pure CSS Grid for the timetable (days as columns, hours 8-20 as rows). Overlap detection assigns sub-columns to conflicting events. Layout uses CSS Grid for the side-by-side panels. Mobile uses a draggable bottom sheet for controls and day tabs for single-day view.

**Tech Stack:** Vanilla JS, CSS Grid, CSS custom properties (existing token system). No external libraries.

---

### Task 1: Add event type color tokens to CSS

**Files:**
- Modify: `templates/style.css` (add tokens inside `:root` and `[data-theme="amoled"]` blocks)

**Step 1: Add color tokens for schedule event types**

In `templates/style.css`, add these tokens after the existing badge color tokens in both theme blocks.

In the `:root, [data-theme="light"]` block (after `--badge-l-fg: #16a34a;` ~line 30), add:

```css
  /* Schedule event colors */
  --event-course-bg: #dbeafe;
  --event-course-fg: #1e40af;
  --event-course-border: #93c5fd;
  --event-seminar-bg: #fef3c7;
  --event-seminar-fg: #92400e;
  --event-seminar-border: #fcd34d;
  --event-lab-bg: #dcfce7;
  --event-lab-fg: #166534;
  --event-lab-border: #86efac;
```

In the `[data-theme="amoled"]` block (after `--badge-l-fg: #86efac;` ~line 55), add:

```css
  /* Schedule event colors */
  --event-course-bg: #1e3a5f;
  --event-course-fg: #93c5fd;
  --event-course-border: #2563eb;
  --event-seminar-bg: #451a03;
  --event-seminar-fg: #fcd34d;
  --event-seminar-border: #d97706;
  --event-lab-bg: #052e16;
  --event-lab-fg: #86efac;
  --event-lab-border: #16a34a;
```

**Step 2: Commit**

```bash
git add templates/style.css
git commit -m "Add schedule event color tokens for both themes"
```

---

### Task 2: Restructure HTML to side-by-side layout

**Files:**
- Modify: `templates/index.html.j2` (restructure builder-section)

**Step 1: Replace the builder-section content**

Replace the entire `builder-section` div (lines 27-87) with a two-panel layout. The controls go in a `.controls-panel`, and a new `.schedule-panel` holds the grid + actions.

```html
  <div id="builder-section" class="tab-content active">
    <div class="app-layout">

      <!-- Left: Controls Panel -->
      <div class="controls-panel" id="controls-panel">
        <div class="card" id="spec-card">
          <h3>Specialization</h3>
          <div class="combobox" id="spec-combobox">
            <input type="text" id="spec-input" placeholder="Loading&hellip;" autocomplete="off" />
            <ul class="combobox-list" id="spec-list"></ul>
            <input type="hidden" id="spec-select" value="" />
          </div>
        </div>

        <div class="card disabled" id="year-card">
          <h3>Year</h3>
          <div class="custom-select" id="year-dropdown">
            <button class="custom-select-trigger" id="year-trigger" type="button">Pick a specialization first</button>
            <ul class="custom-select-list" id="year-list"></ul>
            <input type="hidden" id="year-select" value="" />
          </div>
        </div>

        <div class="card disabled" id="group-card">
          <h3>Group</h3>
          <div class="custom-select" id="group-dropdown">
            <button class="custom-select-trigger" id="group-trigger" type="button">Pick a year first</button>
            <ul class="custom-select-list" id="group-list"></ul>
            <input type="hidden" id="group-select" value="" />
          </div>
        </div>

        <div class="card disabled" id="subgroup-card">
          <h3>Subgroup</h3>
          <div class="pill-group" id="subgroup-pills"></div>
        </div>

        <div class="card disabled" id="types-card">
          <h3>Event Types</h3>
          <div class="pill-group">
            <label><input type="checkbox" data-type="Curs" checked><span>Courses</span></label>
            <label><input type="checkbox" data-type="Seminar" checked><span>Seminars</span></label>
            <label><input type="checkbox" data-type="Laborator" checked><span>Labs</span></label>
          </div>
        </div>

        <div class="card disabled" id="subjects-card">
          <div class="filter-header">
            <h3>Subjects</h3>
            <button id="toggle-subjects-btn">Deselect all</button>
          </div>
          <input type="text" id="subject-search" placeholder="Filter subjects&hellip;" autocomplete="off" aria-label="Filter subjects" />
          <div class="check-group" id="subject-list"></div>
        </div>
      </div>

      <!-- Right: Schedule Panel -->
      <div class="schedule-panel" id="schedule-panel">
        <div class="schedule-toolbar">
          <div class="schedule-info">
            <span class="event-count-inline" id="event-count">0</span>
            <span class="event-label-inline">events</span>
          </div>
          <div class="freq-toggle pill-group" id="freq-toggle">
            <label><input type="radio" name="freq" value="all" checked><span>All</span></label>
            <label><input type="radio" name="freq" value="sapt. 1"><span>Week 1</span></label>
            <label><input type="radio" name="freq" value="sapt. 2"><span>Week 2</span></label>
          </div>
        </div>

        <!-- Day tabs for mobile single-day view -->
        <div class="day-tabs" id="day-tabs">
          <button class="day-tab active" data-day="Luni">Mon</button>
          <button class="day-tab" data-day="Marti">Tue</button>
          <button class="day-tab" data-day="Miercuri">Wed</button>
          <button class="day-tab" data-day="Joi">Thu</button>
          <button class="day-tab" data-day="Vineri">Fri</button>
        </div>

        <div class="schedule-grid-wrapper" id="schedule-grid-wrapper">
          <div class="schedule-empty" id="schedule-empty">
            <p>Select a specialization, year, and group to see your schedule</p>
          </div>
          <div class="schedule-grid" id="schedule-grid" style="display:none;"></div>
        </div>

        <div class="schedule-actions">
          <button class="download-btn" id="download-btn" disabled>Download .ics</button>
          <button class="share-btn" id="share-btn" disabled>Copy link</button>
        </div>
      </div>

    </div>
  </div>
```

**Step 2: Remove the old preview-card references**

The old `preview-card` div is gone. In `app.js`, the `resetFrom` function references `'preview-card'` in its order array. We'll fix this in Task 5 (JS changes).

**Step 3: Commit**

```bash
git add templates/index.html.j2
git commit -m "Restructure builder to side-by-side layout with schedule panel"
```

---

### Task 3: Add CSS for side-by-side layout and schedule grid

**Files:**
- Modify: `templates/style.css` (add new sections at the end, before the mobile media query)

**Step 1: Add layout CSS**

Insert before the `/* --- Mobile --- */` media query (~line 731). All new CSS goes in one block:

```css
/* ============================================================
   Schedule Visualizer — Layout + Grid
   ============================================================ */

/* --- App Layout (side-by-side) --- */
.app-layout {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 1rem;
  align-items: start;
}

.controls-panel {
  position: sticky;
  top: 1rem;
  max-height: calc(100vh - 2rem);
  overflow-y: auto;
  /* Hide scrollbar but keep scrollable */
  scrollbar-width: thin;
}

.schedule-panel {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-width: 0; /* prevent grid blowout */
}

/* --- Schedule Toolbar --- */
.schedule-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.schedule-info {
  display: flex;
  align-items: baseline;
  gap: 0.375rem;
}

.event-count-inline {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--foreground);
}

.event-label-inline {
  font-size: 0.8125rem;
  color: var(--muted-foreground);
}

.freq-toggle {
  gap: 0.25rem;
}
.freq-toggle label {
  flex: 0;
  min-width: auto;
}
.freq-toggle span {
  padding: 0.3rem 0.625rem;
  font-size: 0.8125rem;
  white-space: nowrap;
}

/* --- Day Tabs (mobile only, hidden on desktop) --- */
.day-tabs {
  display: none;
  gap: 0.25rem;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.day-tab {
  flex: 1;
  min-width: 0;
  padding: 0.4rem 0.5rem;
  border: 1px solid var(--border);
  border-radius: 0.375rem;
  background: transparent;
  color: var(--muted-foreground);
  font-family: inherit;
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s, border-color 0.15s;
}

.day-tab:hover {
  background: var(--accent);
  color: var(--foreground);
}

.day-tab.active {
  background: var(--primary);
  color: var(--primary-foreground);
  border-color: var(--primary);
}

/* --- Schedule Grid --- */
.schedule-grid-wrapper {
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  overflow: hidden;
  background: var(--card);
  min-height: 400px;
}

.schedule-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 400px;
  color: var(--muted-foreground);
  font-size: 0.875rem;
  text-align: center;
  padding: 2rem;
}

.schedule-grid {
  --grid-start-hour: 8;
  --grid-end-hour: 20;
  --grid-rows: 12; /* end - start */
  --hour-height: 3.5rem;

  display: grid;
  grid-template-columns: 3rem repeat(5, 1fr);
  grid-template-rows: auto repeat(calc(var(--grid-rows) * 2), calc(var(--hour-height) / 2));
  /* We use half-hour rows for finer placement; each hour = 2 rows */
}

/* Day headers */
.grid-header {
  padding: 0.5rem 0.25rem;
  text-align: center;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--muted-foreground);
  border-bottom: 1px solid var(--border);
  background: var(--muted);
}

.grid-header-corner {
  border-bottom: 1px solid var(--border);
  background: var(--muted);
}

/* Hour labels */
.grid-hour {
  grid-column: 1;
  padding: 0 0.375rem 0 0;
  text-align: right;
  font-size: 0.6875rem;
  color: var(--muted-foreground);
  position: relative;
  top: -0.4em;
  line-height: 1;
}

/* Hour gridlines */
.grid-line {
  grid-column: 2 / -1;
  border-top: 1px solid var(--border);
}

.grid-line-half {
  grid-column: 2 / -1;
  border-top: 1px dashed color-mix(in srgb, var(--border) 50%, transparent);
}

/* Event blocks */
.schedule-event {
  border-radius: 0.25rem;
  padding: 0.25rem 0.375rem;
  font-size: 0.75rem;
  line-height: 1.3;
  overflow: hidden;
  cursor: default;
  border-left: 3px solid;
  margin: 1px;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  transition: opacity 0.15s;
  position: relative;
  z-index: 1;
}

.schedule-event:hover {
  opacity: 0.85;
  z-index: 2;
}

.schedule-event.type-curs {
  background: var(--event-course-bg);
  color: var(--event-course-fg);
  border-left-color: var(--event-course-border);
}

.schedule-event.type-seminar {
  background: var(--event-seminar-bg);
  color: var(--event-seminar-fg);
  border-left-color: var(--event-seminar-border);
}

.schedule-event.type-laborator {
  background: var(--event-lab-bg);
  color: var(--event-lab-fg);
  border-left-color: var(--event-lab-border);
}

.event-subject {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.event-meta {
  font-size: 0.6875rem;
  opacity: 0.85;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* --- Schedule Actions --- */
.schedule-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.share-btn {
  display: inline-block;
  padding: 0.625rem 1.5rem;
  background: transparent;
  color: var(--foreground);
  border: 1px solid var(--border);
  border-radius: 0.375rem;
  font-family: inherit;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s, border-color 0.2s;
}
.share-btn:hover:not(:disabled) {
  background: var(--accent);
}
.share-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.share-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--ring);
}

/* --- Bottom Sheet (mobile) --- */
.bottom-sheet-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.4);
  z-index: 99;
}

.bottom-sheet-overlay.visible {
  display: block;
}

.bottom-sheet {
  display: none;
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 100;
  background: var(--card);
  border-top: 1px solid var(--border);
  border-radius: 0.75rem 0.75rem 0 0;
  box-shadow: 0 -4px 20px rgba(0,0,0,0.15);
  max-height: 85vh;
  transition: transform 0.3s ease;
  touch-action: none;
}

.bottom-sheet-handle {
  width: 2rem;
  height: 0.25rem;
  background: var(--border);
  border-radius: 9999px;
  margin: 0.5rem auto;
  cursor: grab;
}

.bottom-sheet-peek {
  padding: 0.5rem 1rem 0.75rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
}

.bottom-sheet-peek-text {
  font-size: 0.8125rem;
  color: var(--muted-foreground);
  font-weight: 500;
}

.bottom-sheet-content {
  padding: 0 1rem 1rem;
  overflow-y: auto;
  max-height: calc(85vh - 4rem);
  display: none;
}

.bottom-sheet.expanded .bottom-sheet-content {
  display: block;
}
```

**Step 2: Update the mobile media query**

Replace the existing `@media (max-width: 500px)` block (~line 731) with a responsive breakpoint at 768px:

```css
/* --- Mobile --- */
@media (max-width: 768px) {
  body {
    padding: 1rem 0.75rem;
    padding-bottom: 5rem; /* Space for bottom sheet peek */
  }
  h1 { font-size: 1.4rem; }
  .pill-group { gap: 0.35rem; }
  .pill-group span { padding: 0.5rem; font-size: 0.8125rem; }
  .tabs { gap: 1rem; }
  .card { padding: 1rem; }

  /* Stack layout on mobile */
  .app-layout {
    grid-template-columns: 1fr;
  }

  /* Hide controls panel (moved to bottom sheet) */
  .controls-panel {
    display: none;
  }

  /* Show day tabs on mobile */
  .day-tabs {
    display: flex;
  }

  /* Show bottom sheet on mobile */
  .bottom-sheet {
    display: block;
  }

  /* Schedule grid: show single day */
  .schedule-grid {
    grid-template-columns: 3rem 1fr;
  }

  .schedule-grid .grid-header:not(.grid-header-corner) {
    display: none;
  }

  .schedule-grid .grid-header-active {
    display: block;
  }

  /* Schedule event adjustments */
  .schedule-event {
    font-size: 0.8125rem;
  }

  .schedule-grid-wrapper {
    min-height: 300px;
  }
}
```

**Step 3: Also update body max-width for the wider layout**

Change the body `max-width` from `48rem` to accommodate the side-by-side layout. In the body rule (~line 102-112):

Change `max-width: 48rem;` to `max-width: 72rem;`.

**Step 4: Commit**

```bash
git add templates/style.css
git commit -m "Add CSS for schedule grid, side-by-side layout, and mobile bottom sheet"
```

---

### Task 4: Add bottom sheet HTML to template

**Files:**
- Modify: `templates/index.html.j2`

**Step 1: Add bottom sheet markup**

Add before the `<footer>` tag (before line 104 in the new template):

```html
  <!-- Bottom sheet for mobile controls -->
  <div class="bottom-sheet-overlay" id="bottom-sheet-overlay"></div>
  <div class="bottom-sheet" id="bottom-sheet">
    <div class="bottom-sheet-handle"></div>
    <div class="bottom-sheet-peek" id="bottom-sheet-peek">
      <span class="bottom-sheet-peek-text" id="bottom-sheet-peek-text">Select options...</span>
      <span style="font-size:0.75rem; color:var(--muted-foreground);">Tap to expand</span>
    </div>
    <div class="bottom-sheet-content" id="bottom-sheet-content">
      <!-- Controls get cloned here by JS on mobile -->
    </div>
  </div>
```

**Step 2: Commit**

```bash
git add templates/index.html.j2
git commit -m "Add bottom sheet markup for mobile controls"
```

---

### Task 5: Implement schedule grid rendering in JS

This is the core task. Add the grid rendering logic to `app.js`.

**Files:**
- Modify: `templates/app.js`

**Step 1: Add the schedule grid rendering functions**

Add these functions after the `updateToggleBtn` function (after ~line 570), before the subject search handler:

```javascript
  // --- Schedule Grid ---
  const DAYS = ['Luni', 'Marti', 'Miercuri', 'Joi', 'Vineri'];
  const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const GRID_START = 8;
  const GRID_END = 20;
  let selectedFreq = 'all';
  let selectedMobileDay = 'Luni';

  function filterByFrequency(entries, freq) {
    if (freq === 'all') return entries;
    return entries.filter(e => e.frequency === 'every' || e.frequency === freq);
  }

  function detectOverlaps(events) {
    // Sort by start time
    const sorted = events.slice().sort((a, b) => a.startHour - b.startHour || a.endHour - b.endHour);
    const columns = []; // Array of arrays; each sub-array is a column

    sorted.forEach(ev => {
      let placed = false;
      for (let c = 0; c < columns.length; c++) {
        const lastInCol = columns[c][columns[c].length - 1];
        if (lastInCol.endHour <= ev.startHour) {
          columns[c].push(ev);
          ev._col = c;
          placed = true;
          break;
        }
      }
      if (!placed) {
        ev._col = columns.length;
        columns.push([ev]);
      }
    });

    // Determine total columns for each event's overlap group
    // We need to find connected overlap groups
    sorted.forEach(ev => {
      ev._totalCols = columns.length;
    });

    // Refine: find actual max overlapping at each event's time
    sorted.forEach(ev => {
      let maxCols = 0;
      sorted.forEach(other => {
        if (other.startHour < ev.endHour && other.endHour > ev.startHour) {
          maxCols = Math.max(maxCols, other._col + 1);
        }
      });
      ev._totalCols = maxCols;
    });

    return sorted;
  }

  function renderScheduleGrid() {
    const entries = getFilteredEntries();
    const count = entries.reduce((sum, e) => sum + e.dates.length, 0);
    $('#event-count').textContent = count;
    $('#download-btn').disabled = count === 0;
    $('#share-btn').disabled = count === 0;

    const filtered = filterByFrequency(entries, selectedFreq);

    const grid = $('#schedule-grid');
    const empty = $('#schedule-empty');

    if (!selectedGroup || filtered.length === 0) {
      grid.style.display = 'none';
      empty.style.display = 'flex';
      if (!selectedGroup) {
        empty.querySelector('p').textContent = 'Select a specialization, year, and group to see your schedule';
      } else {
        empty.querySelector('p').textContent = 'No events match your current filters';
      }
      return;
    }

    empty.style.display = 'none';
    grid.style.display = 'grid';
    grid.innerHTML = '';

    const isMobile = window.innerWidth <= 768;
    const daysToShow = isMobile ? [selectedMobileDay] : DAYS;
    const numDays = daysToShow.length;

    // Update grid columns
    grid.style.gridTemplateColumns = `3rem repeat(${numDays}, 1fr)`;

    // Row 1: headers
    const corner = document.createElement('div');
    corner.className = 'grid-header grid-header-corner';
    grid.appendChild(corner);

    daysToShow.forEach((day, i) => {
      const hdr = document.createElement('div');
      hdr.className = 'grid-header';
      hdr.textContent = DAY_LABELS[DAYS.indexOf(day)];
      hdr.style.gridColumn = String(i + 2);
      grid.appendChild(hdr);
    });

    // Hour rows: each hour = 2 grid rows (for half-hour granularity)
    for (let h = GRID_START; h < GRID_END; h++) {
      const rowIdx = (h - GRID_START) * 2 + 2; // +2 because row 1 is header

      // Hour label
      const label = document.createElement('div');
      label.className = 'grid-hour';
      label.textContent = `${h}:00`;
      label.style.gridRow = String(rowIdx);
      label.style.gridColumn = '1';
      grid.appendChild(label);

      // Full hour gridline
      const line = document.createElement('div');
      line.className = 'grid-line';
      line.style.gridRow = String(rowIdx);
      line.style.gridColumn = `2 / ${numDays + 2}`;
      grid.appendChild(line);

      // Half hour gridline
      const halfLine = document.createElement('div');
      halfLine.className = 'grid-line-half';
      halfLine.style.gridRow = String(rowIdx + 1);
      halfLine.style.gridColumn = `2 / ${numDays + 2}`;
      grid.appendChild(halfLine);
    }

    // Group entries by day
    const byDay = {};
    DAYS.forEach(d => { byDay[d] = []; });
    filtered.forEach(e => {
      if (byDay[e.day]) byDay[e.day].push(e);
    });

    // Render events
    daysToShow.forEach((day, dayIdx) => {
      const dayEvents = byDay[day];
      if (!dayEvents.length) return;

      const processed = detectOverlaps(dayEvents);

      processed.forEach(ev => {
        const startRow = (ev.startHour - GRID_START) * 2 + 2;
        const endRow = (ev.endHour - GRID_START) * 2 + 2;

        const el = document.createElement('div');
        const typeClass = ev.type === 'Curs' ? 'type-curs'
          : ev.type === 'Seminar' ? 'type-seminar' : 'type-laborator';
        el.className = `schedule-event ${typeClass}`;

        el.style.gridRow = `${startRow} / ${endRow}`;
        el.style.gridColumn = String(dayIdx + 2);

        // Handle overlap positioning with sub-columns
        if (ev._totalCols > 1) {
          const pct = 100 / ev._totalCols;
          el.style.width = `${pct}%`;
          el.style.marginLeft = `${ev._col * pct}%`;
        }

        const BADGE = { 'Curs': '[C]', 'Seminar': '[S]', 'Laborator': '[L]' };

        const subjEl = document.createElement('div');
        subjEl.className = 'event-subject';
        subjEl.textContent = ev.subject;
        el.appendChild(subjEl);

        const metaEl = document.createElement('div');
        metaEl.className = 'event-meta';
        metaEl.textContent = `${BADGE[ev.type] || ''} ${ev.room || ''}`;
        el.appendChild(metaEl);

        el.title = `${ev.subject}\n${BADGE[ev.type] || ev.type} | ${ev.room || 'No room'}\n${ev.professor || ''}\n${ev.startHour}:00 - ${ev.endHour}:00`;

        grid.appendChild(el);
      });
    });

    saveState();
  }
```

**Step 2: Add frequency toggle handler**

Add after the schedule grid functions:

```javascript
  // --- Frequency toggle ---
  $$('#freq-toggle input[type="radio"]').forEach(radio => {
    radio.addEventListener('change', () => {
      selectedFreq = radio.value;
      renderScheduleGrid();
    });
  });
```

**Step 3: Add day tab handlers (mobile)**

```javascript
  // --- Day tabs (mobile) ---
  $$('.day-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.day-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedMobileDay = btn.dataset.day;
      renderScheduleGrid();
    });
  });

  // Re-render on resize (switch between mobile/desktop column count)
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(renderScheduleGrid, 150);
  });
```

**Step 4: Replace updatePreview to call renderScheduleGrid**

Find the existing `updatePreview` function (~line 640-646) and replace it:

```javascript
  function updatePreview() {
    renderScheduleGrid();
  }
```

**Step 5: Update resetFrom to remove preview-card reference**

Replace the `resetFrom` function. Change the order array from:
```javascript
const order = ['year-card','group-card','subgroup-card','types-card','subjects-card','preview-card'];
```
to:
```javascript
const order = ['year-card','group-card','subgroup-card','types-card','subjects-card'];
```

And remove `enableCard('preview-card');` from the group select handler and restoreState — the schedule panel is always visible, it just shows the empty state.

**Step 6: Remove enableCard('preview-card') calls**

Search for all `enableCard('preview-card')` calls in the file (in group select handler ~line 367 and restoreState ~line 757) and remove those lines.

**Step 7: Commit**

```bash
git add templates/app.js
git commit -m "Implement schedule grid rendering with overlap detection"
```

---

### Task 6: Implement bottom sheet for mobile

**Files:**
- Modify: `templates/app.js`

**Step 1: Add bottom sheet logic**

Add after the day tab handlers:

```javascript
  // --- Bottom Sheet (mobile) ---
  function initBottomSheet() {
    const sheet = $('#bottom-sheet');
    const overlay = $('#bottom-sheet-overlay');
    const peek = $('#bottom-sheet-peek');
    const peekText = $('#bottom-sheet-peek-text');
    const content = $('#bottom-sheet-content');

    if (!sheet) return;

    function updatePeekText() {
      const parts = [];
      const specIdx = $('#spec-select').value;
      if (specIdx !== '' && indexData && indexData.specs[specIdx]) {
        const specName = indexData.specs[specIdx].name;
        // Abbreviate: take first word or first 15 chars
        parts.push(specName.length > 20 ? specName.substring(0, 20) + '...' : specName);
      }
      const yearCode = $('#year-select').value;
      if (yearCode) parts.push(yearCode);
      if (selectedGroup) parts.push('G' + selectedGroup.name);
      if (selectedSubgroup !== 'all') parts.push('/' + selectedSubgroup);

      peekText.textContent = parts.length ? parts.join(' > ') : 'Select options...';
    }

    function expand() {
      sheet.classList.add('expanded');
      overlay.classList.add('visible');
      // Move controls into bottom sheet
      const panel = $('#controls-panel');
      if (panel && content.children.length === 0) {
        // Clone cards into bottom sheet content
        Array.from(panel.children).forEach(card => {
          content.appendChild(card);
        });
      }
    }

    function collapse() {
      sheet.classList.remove('expanded');
      overlay.classList.remove('visible');
      // Move controls back
      const panel = $('#controls-panel');
      if (panel && content.children.length > 0) {
        Array.from(content.children).forEach(card => {
          panel.appendChild(card);
        });
      }
      updatePeekText();
    }

    peek.addEventListener('click', () => {
      if (sheet.classList.contains('expanded')) {
        collapse();
      } else {
        expand();
      }
    });

    overlay.addEventListener('click', collapse);

    // Touch drag to dismiss
    let startY = 0;
    const handle = sheet.querySelector('.bottom-sheet-handle');
    if (handle) {
      handle.addEventListener('touchstart', e => {
        startY = e.touches[0].clientY;
      }, { passive: true });

      handle.addEventListener('touchmove', e => {
        const dy = e.touches[0].clientY - startY;
        if (dy > 80) collapse();
      }, { passive: true });
    }

    // Expose update function
    window._updateBottomSheetPeek = updatePeekText;
  }

  initBottomSheet();
```

**Step 2: Call peek text update in saveState**

In the `saveState` function, add at the end (before the catch):

```javascript
      if (window._updateBottomSheetPeek) window._updateBottomSheetPeek();
```

**Step 3: Commit**

```bash
git add templates/app.js
git commit -m "Add mobile bottom sheet for controls"
```

---

### Task 7: Implement shareable URLs

**Files:**
- Modify: `templates/app.js`

**Step 1: Add URL encoding/decoding functions**

Add after the bottom sheet code:

```javascript
  // --- Shareable URLs ---
  function encodeStateToURL() {
    const params = new URLSearchParams();
    const specIdx = $('#spec-select').value;
    if (specIdx === '' || specIdx == null) return;

    const yearCode = $('#year-select').value;
    if (!yearCode) return;

    params.set('spec', yearCode); // yearCode like "M1" is more meaningful than index
    const groupIdx = $('#group-select').value;
    if (groupIdx !== '' && groupIdx != null) {
      params.set('group', groupIdx);
      if (selectedSubgroup !== 'all') params.set('sub', selectedSubgroup);
    }
    if (selectedFreq !== 'all') params.set('freq', selectedFreq);

    // Encode excluded subjects compactly
    const excluded = [];
    $$('#subject-list input[data-key]').forEach(cb => {
      if (!cb.checked) excluded.push(cb.dataset.key);
    });
    if (excluded.length) params.set('excl', excluded.join(','));

    const url = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    return url;
  }

  function decodeStateFromURL() {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('spec')) return null;

    return {
      yearCode: params.get('spec'),
      groupIndex: params.get('group'),
      subgroup: params.get('sub') || 'all',
      freq: params.get('freq') || 'all',
      excluded: params.get('excl') ? params.get('excl').split(',') : [],
    };
  }

  // Share button
  $('#share-btn').addEventListener('click', () => {
    const url = encodeStateToURL();
    if (!url) return;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => {
        const btn = $('#share-btn');
        const orig = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = orig; }, 2000);
      });
    }
  });

  // On load: check URL params (takes priority over localStorage)
  function restoreFromURL() {
    const state = decodeStateFromURL();
    if (!state || !indexData) return false;

    // Find spec index by yearCode
    let specIndex = null;
    for (let i = 0; i < indexData.specs.length; i++) {
      if (indexData.specs[i].years.some(y => y.code === state.yearCode)) {
        specIndex = i;
        break;
      }
    }
    if (specIndex === null) return false;

    // Store URL state for use after data loads
    window._urlState = state;

    // Trigger spec selection which will cascade
    selectSpec(specIndex, indexData.specs[specIndex].name);

    return true;
  }
```

**Step 2: Integrate URL restore into the load flow**

In the `fetch('data/index.json')` `.then()` handler (~line 237-245), modify to try URL restore first:

Change:
```javascript
      renderList('');
      restoreState();
```
To:
```javascript
      renderList('');
      if (!restoreFromURL()) {
        restoreState();
      }
```

**Step 3: Apply URL state after year data loads**

In the year select `onChange` handler (where `specData = data` is set after fetch), add URL state application. After `groupSelect.setItems(...)` and before `saveState()`, add:

```javascript
        // Apply URL state if present
        if (window._urlState) {
          const us = window._urlState;
          if (us.groupIndex !== null) {
            groupSelect.selectItem(Number(us.groupIndex),
              `Group ${data.groups[us.groupIndex]?.name || us.groupIndex}`);
          }
          if (us.freq && us.freq !== 'all') {
            selectedFreq = us.freq;
            const freqRadio = $(`#freq-toggle input[value="${us.freq}"]`);
            if (freqRadio) freqRadio.checked = true;
          }
          // Clean up URL state after applying
          delete window._urlState;
        }
```

And similarly handle subgroup + excluded keys in the group select handler cascade.

**Step 4: Commit**

```bash
git add templates/app.js
git commit -m "Add shareable URL encoding/decoding and share button"
```

---

### Task 8: Generate site and verify

**Files:**
- Run: `python scripts/generate_index.py`
- Verify: Open in browser

**Step 1: Generate the site**

```bash
cd /home/rdobre/random-projects/fmi-cal-generator
python scripts/generate_index.py
```

**Step 2: Verify manually**

Start local server and check:
```bash
cd site && python -m http.server 8123
```

Verify:
1. Side-by-side layout renders correctly on desktop
2. Schedule grid populates when selections are made
3. Events display with correct colors per type
4. Frequency toggle filters correctly
5. Overlapping events display side-by-side
6. Share button generates valid URL
7. Mobile breakpoint shows day tabs and bottom sheet

**Step 3: Final commit**

```bash
git add site/index.html
git commit -m "Generate site with schedule visualizer"
```

---

### Task 9: Polish and edge cases

**Files:**
- Modify: `templates/app.js`, `templates/style.css`

**Step 1: Handle edge cases**

- Ensure grid re-renders when type checkboxes change
- Ensure grid clears when spec/year/group changes
- Ensure the empty state shows correctly when all subjects are deselected
- Verify `saveState`/`restoreState` still work with the new layout

**Step 2: Final commit and push**

```bash
git add -A
git commit -m "Polish schedule visualizer edge cases"
git push origin main
```
