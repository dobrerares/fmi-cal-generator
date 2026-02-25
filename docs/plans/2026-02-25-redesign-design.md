# FMI Calendar Generator — Redesign Design Doc

**Date:** 2026-02-25
**Status:** Approved
**Scope:** Visual redesign (shadcn-inspired, three themes) + template architecture migration (f-string → Jinja2)

---

## 1. Goals

1. Replace the f-string template pattern with Jinja2 + separate CSS/JS files inlined at build time
2. Redesign the UI with a shadcn-inspired aesthetic (borders + subtle shadows, zinc palette, Inter font)
3. Add three-theme support: Light, Dark, and AMOLED Black
4. Preserve all existing functionality — no features added or removed

## 2. Template Architecture

### Current

`scripts/generate_index.py` contains a 1,325-line Python f-string with all HTML/CSS/JS inline. Every `{` in CSS/JS must be doubled to `{{` for Python's f-string formatting. This is error-prone and prevents editor syntax highlighting.

### New

```
templates/
  index.html.j2    # HTML skeleton with Jinja2 placeholders
  style.css        # All CSS (normal braces, full editor support)
  app.js           # All JS (normal braces, full editor support)
scripts/
  generate_index.py # Thin: loads data, reads CSS/JS, renders template
```

**Data flow:**
1. `generate_index.py` collects data (file tree, timestamps, file counts)
2. Reads `templates/style.css` and `templates/app.js` as raw strings
3. Renders `templates/index.html.j2` with Jinja2, passing:
   - `css`: raw CSS string
   - `js`: raw JS string
   - `file_tree_html`: pre-rendered HTML for Quick Download section
   - `generated_date`: ISO timestamp
   - `total_files`: integer count
   - `data_json`: JSON blob for the Custom Builder (specs, years, groups)
4. Writes rendered output to `site/index.html`

**Template structure (`index.html.j2`):**

```html
<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>FMI Calendar Generator</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <style>{{ css }}</style>
</head>
<body>
  <!-- Header, tabs, cards — static HTML -->
  <!-- Dynamic sections use Jinja2 variables: -->
  <div id="file-tree">{{ file_tree_html }}</div>
  <footer>Generated {{ generated_date }} | {{ total_files }} files</footer>

  <script type="application/json" id="app-data">{{ data_json }}</script>
  <script>{{ js }}</script>
</body>
</html>
```

**Key decisions:**
- CSS and JS are separate files during development (full syntax highlighting, linting)
- They get inlined at build time (single-file output for GitHub Pages)
- Python→JS data passes through one explicit JSON `<script>` blob
- No brace escaping anywhere — Jinja2's `{{ }}` is only used in the `.j2` file
- Jinja2 added as a dependency in `pyproject.toml`

## 3. Visual Design

### Design Language

shadcn/ui-inspired: clean geometric cards with both borders and subtle shadows, muted zinc color palette, consistent spacing, pill-shaped badges, smooth micro-interactions.

### Color System

Three themes controlled via `data-theme` attribute on `<html>`:

| Token | Light | Dark | AMOLED |
|-------|-------|------|--------|
| `--background` | `#ffffff` | `#09090b` | `#000000` |
| `--foreground` | `#09090b` | `#fafafa` | `#fafafa` |
| `--card` | `#ffffff` | `#09090b` | `#000000` |
| `--card-foreground` | `#09090b` | `#fafafa` | `#fafafa` |
| `--border` | `#e4e4e7` | `#27272a` | `#18181b` |
| `--muted` | `#f4f4f5` | `#27272a` | `#0a0a0a` |
| `--muted-foreground` | `#71717a` | `#a1a1aa` | `#a1a1aa` |
| `--accent` | `#f4f4f5` | `#27272a` | `#18181b` |
| `--primary` | `#18181b` | `#fafafa` | `#fafafa` |
| `--primary-foreground` | `#fafafa` | `#18181b` | `#000000` |
| `--ring` | `#a1a1aa` | `#d4d4d8` | `#52525b` |

Badge accent colors (consistent across themes, with dark/light variants):

| Badge | Light BG / Text | Dark+AMOLED BG / Text |
|-------|----------------|----------------------|
| Course `[C]` | `#dbeafe` / `#1d4ed8` | `#1e3a5f` / `#93c5fd` |
| Seminar `[S]` | `#fef3c7` / `#d97706` | `#451a03` / `#fcd34d` |
| Lab `[L]` | `#dcfce7` / `#16a34a` | `#052e16` / `#86efac` |

### Typography

- Font: `Inter, -apple-system, system-ui, sans-serif` (Inter loaded from Google Fonts CDN)
- Base: 16px, line-height 1.5
- Headings: weight 600, letter-spacing -0.025em
- Body: weight 400
- Muted text: `var(--muted-foreground)`

### Components

**Cards:**
- Border: `1px solid var(--border)`
- Shadow: `0 1px 3px 0 rgba(0,0,0,0.1), 0 1px 2px -1px rgba(0,0,0,0.1)` (light/dark)
- AMOLED shadow: `0 1px 2px 0 rgba(0,0,0,0.3)` (reduced)
- Border-radius: `0.5rem` (8px)
- Padding: `1.5rem`

**Buttons:**
- Primary: `bg: var(--primary)`, `color: var(--primary-foreground)`, radius `0.375rem`
- Outline: `border: 1px solid var(--border)`, transparent bg
- Disabled: `opacity: 0.5; pointer-events: none`
- Hover: subtle background shift

**Inputs/Selects:**
- Border: `1px solid var(--border)`, radius `0.375rem`
- Focus: `box-shadow: 0 0 0 2px var(--ring)` with offset
- Background: transparent
- Height: `2.5rem` (40px)

**Tabs:**
- Underline style: active tab has `border-bottom: 2px solid var(--foreground)`
- Inactive: `color: var(--muted-foreground)`
- No background on tab bar

**Badges:**
- Pill shape: `border-radius: 9999px`
- Padding: `0.125rem 0.5rem`
- Font-size: `0.75rem`, weight 500

**Checkboxes:**
- `accent-color: var(--primary)`
- Size: `1rem`

### Layout

- Container max-width: `48rem` (768px), centered
- Section gaps: `1.5rem`
- Card internal padding: `1.5rem`
- Spacing grid: multiples of `0.25rem` (4px)
- Responsive breakpoint: `500px` (preserved from current)

### Theme Switcher

- Three-state cycle button in header: Light → Dark → AMOLED → Light
- Icons: sun (light), moon (dark), filled circle (AMOLED)
- Stored in localStorage as `"light"` / `"dark"` / `"amoled"`
- Respects system preference on first visit (`prefers-color-scheme: dark` → starts in Dark)

## 4. Behavior Changes

### Changed
- Theme toggle: two-state → three-state cycle
- Tab styling: pill/button → underline
- Badge styling: square brackets `[C]` → colored pill badges
- Focus states: all interactive elements get a visible focus ring (accessibility)
- Transitions: `background-color 0.2s, color 0.2s, border-color 0.2s` on themed elements

### Unchanged
- Two-tab layout (Custom Builder + Quick Download)
- Cascading selection flow (Spec → Year → Group → Subgroup → Subjects)
- Fuzzy search with edit distance
- localStorage persistence for all selections
- .ics generation and download
- Quick Download file tree structure
- All JS logic and state management
- Responsive breakpoint

## 5. Dependencies

**Added:**
- `jinja2` (Python package, added to `pyproject.toml`)

**Removed:**
- None

## 6. Testing

- Existing Python tests (`pytest`) must continue to pass
- Manual verification: generate site, verify no `{{` in output
- Visual verification: check all three themes
- Functional verification: full selection flow + download works
- Verify localStorage migration (old keys still work or gracefully ignored)

## 7. Migration

The theme localStorage key changes from a boolean (`dark`/`light`) to a string (`light`/`dark`/`amoled`). JS will detect old format and migrate gracefully:
- Old `"dark"` → new `"dark"`
- Old `"light"` or absent → new `"light"`

## 8. Files Changed

| File | Change |
|------|--------|
| `templates/index.html.j2` | **New** — HTML skeleton |
| `templates/style.css` | **New** — all CSS |
| `templates/app.js` | **New** — all JS |
| `scripts/generate_index.py` | **Rewrite** — thin Jinja2 renderer |
| `pyproject.toml` | **Edit** — add jinja2 dependency |
| `CLAUDE.md` | **Edit** — update architecture docs |
| `tests/` | **Edit** — update if tests reference f-string pattern |
