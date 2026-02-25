# FMI Calendar Generator Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate from f-string template to Jinja2 with separate CSS/JS files, and redesign the UI with a shadcn-inspired aesthetic supporting Light/Dark/AMOLED themes.

**Architecture:** Extract the 1,325-line f-string in `scripts/generate_index.py` into three template files (`index.html.j2`, `style.css`, `app.js`). Rewrite `generate_index.py` as a thin Jinja2 renderer that reads these files, injects data, and writes `site/index.html`. Restyle all components using shadcn/zinc design tokens with three-theme CSS variables.

**Tech Stack:** Python 3.11+, Jinja2, vanilla CSS/JS (no build tools)

**Design doc:** `docs/plans/2026-02-25-redesign-design.md`

---

### Task 1: Add Jinja2 dependency

**Files:**
- Modify: `pyproject.toml:6-12`

**Step 1: Add jinja2 to dependencies**

In `pyproject.toml`, add `"jinja2>=3.1"` to the `dependencies` list:

```toml
dependencies = [
    "requests>=2.31",
    "beautifulsoup4>=4.12",
    "icalendar>=5.0",
    "InquirerPy>=0.3.4",
    "pyyaml>=6.0",
    "jinja2>=3.1",
]
```

**Step 2: Install the updated dependencies**

Run: `cd /home/rdobre/random-projects/fmi-cal-generator && source .venv/bin/activate && pip install -e . 2>&1 | tail -5`
Expected: jinja2 installed successfully

**Step 3: Verify import works**

Run: `source .venv/bin/activate && python -c "import jinja2; print(jinja2.__version__)"`
Expected: prints version >= 3.1

**Step 4: Commit**

```bash
git add pyproject.toml
git commit -m "Add jinja2 dependency for template migration"
```

---

### Task 2: Create the Jinja2 HTML template

**Files:**
- Create: `templates/index.html.j2`

This is the HTML skeleton that references Jinja2 variables for dynamic content. The CSS and JS are injected as raw strings.

**Step 1: Create `templates/index.html.j2`**

```html
<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>FMI Calendar Generator - UBB Cluj</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>{{ css }}</style>
</head>
<body>
  <div class="header">
    <div>
      <h1>FMI Calendar Generator</h1>
      <p class="subtitle">UBB Cluj CS Schedule &rarr; Google Calendar</p>
    </div>
    <button class="theme-toggle" id="theme-toggle" title="Toggle theme" aria-label="Toggle theme"></button>
  </div>

  <div class="tabs">
    <button class="tab active" data-tab="builder">Custom Calendar</button>
    <button class="tab" data-tab="download">Quick Download</button>
  </div>

  <!-- ===== CUSTOM CALENDAR BUILDER ===== -->
  <div id="builder-section" class="tab-content active">

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
      <select id="year-select"><option value="">Pick a specialization first</option></select>
    </div>

    <div class="card disabled" id="group-card">
      <h3>Group</h3>
      <select id="group-select"><option value="">Pick a year first</option></select>
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

    <div class="card disabled" id="preview-card">
      <div class="preview">
        <div class="event-count" id="event-count">0</div>
        <div class="event-label">calendar events</div>
        <button class="download-btn" id="download-btn" disabled>Download .ics</button>
      </div>
    </div>

  </div>

  <!-- ===== QUICK DOWNLOAD ===== -->
  <div id="download-section" class="tab-content">
    <div class="card" style="padding:1rem 1.5rem; margin-bottom:1rem;">
      <strong>How to use:</strong>
      <ol style="margin:0.5rem 0 0 1.5rem; font-size:0.9rem;">
        <li>Find your specialization and group below</li>
        <li>Download the <code>.ics</code> file</li>
        <li>Open <a href="https://calendar.google.com/calendar/r/settings/export">Google Calendar Import</a></li>
        <li>Select the downloaded file and click Import</li>
      </ol>
    </div>

{{ file_tree_html }}
  </div>

  <footer>
    Generated on {{ generated_date }} &middot; {{ total_files }} pre-built calendars &middot;
    <a href="https://github.com/dobrerares/fmi-cal-generator">Source on GitHub</a>
  </footer>

  <script type="application/json" id="app-data">{{ data_json }}</script>
  <script>{{ js }}</script>
</body>
</html>
```

Note: The `{{ css }}`, `{{ js }}`, `{{ file_tree_html }}`, `{{ generated_date }}`, `{{ total_files }}`, and `{{ data_json }}` are Jinja2 template variables. CSS and JS content is read from separate files and passed in as raw strings.

**Step 2: Verify the template is valid**

Run: `source .venv/bin/activate && python -c "from jinja2 import Environment, FileSystemLoader; env = Environment(loader=FileSystemLoader('templates')); t = env.get_template('index.html.j2'); print('Template parsed OK')"`
Expected: "Template parsed OK"

**Step 3: Commit**

```bash
git add templates/index.html.j2
git commit -m "Add Jinja2 HTML template skeleton"
```

---

### Task 3: Extract CSS with shadcn redesign

**Files:**
- Create: `templates/style.css`

Extract CSS from `scripts/generate_index.py` lines 103-517, un-double all braces, and restyle according to design doc. This is the largest task — it replaces the entire styling.

**Step 1: Create `templates/style.css`**

Write the full CSS file. Key changes from current:
- Replace all `{{` with `{` and `}}` with `}` (un-escape f-string braces)
- Replace Apple color palette with shadcn/zinc tokens from design doc
- Add three theme definitions: `:root` (light), `[data-theme="dark"]`, `[data-theme="amoled"]`
- Replace system fonts with Inter
- Update card styling: add borders, update shadows
- Update tabs: underline style instead of pill
- Update badges: pill shape with `border-radius: 9999px`
- Add focus ring styles
- Add theme transitions

Use the complete color token table from design doc section 3.

The CSS file should be approximately 400-500 lines. **Use the frontend-design skill** (invoked in the executing session) for the actual CSS implementation to achieve high design quality.

**Step 2: Verify CSS is valid (no doubled braces)**

Run: `grep -c '{{' templates/style.css`
Expected: 0 (no doubled braces — this is plain CSS now)

**Step 3: Commit**

```bash
git add templates/style.css
git commit -m "Add shadcn-inspired CSS with Light/Dark/AMOLED themes"
```

---

### Task 4: Extract JavaScript

**Files:**
- Create: `templates/app.js`

Extract JS from `scripts/generate_index.py` lines 610-1322, un-double all braces, and update the theme switcher to support three states.

**Step 1: Create `templates/app.js`**

Take the JS from the f-string (lines 610-1322 of `generate_index.py`) and:
1. Replace all `{{` with `{` and `}}` with `}` (un-escape f-string braces)
2. Fix escaped backslashes: `\\\\` → `\\`, `\\s` → `\s`, etc. (f-string double escapes)
3. Update the theme logic to support three states:

The theme section should change from:

```javascript
// Old (two-state)
function getPreferredTheme() {
  const saved = localStorage.getItem('fmi-cal-theme');
  if (saved) return saved;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}
function applyTheme(theme) {
  document.body.setAttribute('data-theme', theme);
  themeBtn.textContent = theme === 'dark' ? '\u2600\uFE0F' : '\uD83C\uDF19';
  localStorage.setItem('fmi-cal-theme', theme);
}
themeBtn.addEventListener('click', () => {
  const current = document.body.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
});
```

To:

```javascript
// New (three-state: light → dark → amoled → light)
const THEMES = ['light', 'dark', 'amoled'];
const THEME_ICONS = { light: '\u2600\uFE0F', dark: '\uD83C\uDF19', amoled: '\u26AB' };

function getPreferredTheme() {
  const saved = localStorage.getItem('fmi-cal-theme');
  if (saved && THEMES.includes(saved)) return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  themeBtn.textContent = THEME_ICONS[theme] || THEME_ICONS.light;
  localStorage.setItem('fmi-cal-theme', theme);
}

applyTheme(getPreferredTheme());

themeBtn.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  const idx = THEMES.indexOf(current);
  applyTheme(THEMES[(idx + 1) % THEMES.length]);
});
```

Also update `data-theme` from `document.body` to `document.documentElement` (`<html>` element) everywhere in JS — this aligns with shadcn's convention and ensures CSS `:root` / `[data-theme]` selectors work correctly.

**Step 2: Verify JS is valid (no doubled braces, no f-string artifacts)**

Run: `grep -c '{{' templates/app.js`
Expected: 0

Run: `grep -c '}}' templates/app.js`
Expected: 0

Run: `node --check templates/app.js`
Expected: no syntax errors (exit 0)

**Step 3: Commit**

```bash
git add templates/app.js
git commit -m "Extract JS to standalone file with three-state theme switcher"
```

---

### Task 5: Rewrite generate_index.py

**Files:**
- Modify: `scripts/generate_index.py`

Replace the entire `generate_index()` function (the massive f-string) with a thin Jinja2 renderer. Keep the helper functions (`natural_sort_key`, `ics_sort_key`, `format_ics_label`, `build_download_tree`) unchanged.

**Step 1: Rewrite `generate_index.py`**

The new file should be approximately 60-70 lines:

```python
#!/usr/bin/env python3
"""Generate a static index.html with a custom calendar builder + quick download tree."""

import html
import json
import re
from datetime import datetime
from pathlib import Path
from urllib.parse import quote

from jinja2 import Environment, FileSystemLoader


def natural_sort_key(s: str):
    """Sort strings with embedded numbers naturally (Year 1, Year 2, Year 10)."""
    return [int(c) if c.isdigit() else c.lower() for c in re.split(r"(\d+)", s)]


def ics_sort_key(name: str):
    """Sort .ics files: group number first, then subgroup/all."""
    base = name.replace(".ics", "")
    parts = base.rsplit("-", 1)
    try:
        group_num = int(parts[0])
    except ValueError:
        group_num = 0
    suffix = parts[1] if len(parts) > 1 else ""
    suffix_order = {"1": 0, "2": 1, "all": 2}.get(suffix, 3)
    return (group_num, suffix_order)


def format_ics_label(filename: str) -> str:
    """'921-1.ics' -> 'Group 921 / Subgroup 1'."""
    base = filename.replace(".ics", "")
    parts = base.rsplit("-", 1)
    group = parts[0]
    if len(parts) == 1:
        return f"Group {group}"
    suffix = parts[1]
    if suffix == "all":
        return f"Group {group} (all subgroups)"
    return f"Group {group} / Subgroup {suffix}"


def build_download_tree(site_dir: Path) -> tuple[str, int]:
    """Build the collapsible download tree HTML."""
    specs: dict[str, dict[str, list[str]]] = {}

    for ics_file in sorted(site_dir.rglob("*.ics")):
        rel = ics_file.relative_to(site_dir)
        parts = rel.parts
        if len(parts) == 3:
            spec_name, year, filename = parts
        elif len(parts) == 2:
            spec_name, filename = parts
            year = ""
        else:
            continue
        specs.setdefault(spec_name, {}).setdefault(year, []).append(filename)

    parts_html = []
    for spec_name in sorted(specs.keys(), key=natural_sort_key):
        years = specs[spec_name]
        years_html = []
        for year in sorted(years.keys(), key=natural_sort_key):
            files = sorted(years[year], key=ics_sort_key)
            links = []
            for f in files:
                label = format_ics_label(f)
                href = quote(f"{spec_name}/{year}/{f}" if year else f"{spec_name}/{f}")
                links.append(
                    f'            <li><a href="{href}" download>{html.escape(label)}</a></li>'
                )

            year_title = html.escape(year) if year else "Files"
            years_html.append(f"""        <details>
          <summary>{year_title} <span class="count">({len(files)} files)</span></summary>
          <ul>
{chr(10).join(links)}
          </ul>
        </details>""")

        parts_html.append(f"""    <details>
      <summary>{html.escape(spec_name)}</summary>
{chr(10).join(years_html)}
    </details>""")

    total_files = sum(
        len(files) for years in specs.values() for files in years.values()
    )
    return chr(10).join(parts_html), total_files


def generate_index(site_dir: Path) -> str:
    """Generate the full HTML page using Jinja2 templates."""
    download_tree, total_files = build_download_tree(site_dir)
    now = datetime.now().strftime("%Y-%m-%d %H:%M")

    templates_dir = Path(__file__).resolve().parent.parent / "templates"
    env = Environment(loader=FileSystemLoader(templates_dir))
    template = env.get_template("index.html.j2")

    return template.render(
        css=templates_dir.joinpath("style.css").read_text(encoding="utf-8"),
        js=templates_dir.joinpath("app.js").read_text(encoding="utf-8"),
        file_tree_html=download_tree,
        generated_date=now,
        total_files=total_files,
    )


def main() -> None:
    site_dir = Path("site")
    if not site_dir.exists():
        print("Error: site/ directory not found. Run generate_all.py first.")
        raise SystemExit(1)

    index_html = generate_index(site_dir)
    (site_dir / "index.html").write_text(index_html, encoding="utf-8")
    print("Generated site/index.html")


if __name__ == "__main__":
    main()
```

Note: The `data_json` variable from the design doc is NOT needed — the custom builder fetches `data/index.json` at runtime via JS `fetch()`. The only Python→HTML data is the file tree and metadata.

**Step 2: Verify existing tests still pass**

Run: `source .venv/bin/activate && python -m pytest tests/ -v`
Expected: all tests pass (none reference generate_index.py)

**Step 3: Generate the site and verify output**

Run: `source .venv/bin/activate && python scripts/generate_index.py`
Expected: "Generated site/index.html"

Run: `grep -c '{{' site/index.html`
Expected: 0 (no Jinja2 template artifacts in output)

Run: `grep -c '}}' site/index.html`
Expected: 0

**Step 4: Commit**

```bash
git add scripts/generate_index.py
git commit -m "Rewrite generate_index.py as thin Jinja2 renderer"
```

---

### Task 6: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Update architecture and development docs**

Replace the current CLAUDE.md with:

```markdown
# FMI Calendar Generator

## Architecture
- Template-based UI: HTML skeleton in `templates/index.html.j2`, CSS in `templates/style.css`, JS in `templates/app.js`
- `scripts/generate_index.py` renders the Jinja2 template with CSS/JS inlined and dynamic data (file tree, timestamps)
- Generated output: `site/index.html` (single file for GitHub Pages)

## Development
- Activate venv: `source .venv/bin/activate`
- Generate site: `python scripts/generate_index.py`
- Run tests: `python -m pytest tests/`
- Local preview: `cd site && python -m http.server 8123`

## Git
- Solo project — commit and push directly to main
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "Update CLAUDE.md for Jinja2 template architecture"
```

---

### Task 7: Visual verification and polish

**Files:**
- Possibly modify: `templates/style.css`, `templates/app.js`

**Step 1: Generate the site**

Run: `source .venv/bin/activate && python scripts/generate_index.py`

**Step 2: Manual visual verification checklist**

Open `site/index.html` in a browser and verify:
- [ ] Light theme renders correctly (white background, zinc text)
- [ ] Dark theme renders correctly (zinc-950 background)
- [ ] AMOLED theme renders correctly (pure black `#000000` background)
- [ ] Theme switcher cycles through all three states
- [ ] Theme preference persists across page reload
- [ ] Inter font loads and displays
- [ ] Cards have both borders and subtle shadows
- [ ] Tabs use underline style
- [ ] Badges are pill-shaped with correct colors
- [ ] Focus rings appear on interactive elements
- [ ] Combobox search works (fuzzy matching)
- [ ] Year/Group/Subgroup cascading works
- [ ] Subject checkboxes and type toggles work
- [ ] Event count updates correctly
- [ ] Download .ics button works
- [ ] Quick Download tab shows file tree
- [ ] Mobile layout works at <500px width

**Step 3: Fix any visual issues found**

Apply targeted fixes to `style.css` or `app.js` as needed.

**Step 4: Final commit**

```bash
git add templates/style.css templates/app.js
git commit -m "Polish visual design after manual verification"
```

---

### Task 8: Run full test suite and verify

**Step 1: Run pytest**

Run: `source .venv/bin/activate && python -m pytest tests/ -v`
Expected: all tests pass

**Step 2: Regenerate and verify output**

Run: `python scripts/generate_index.py && grep -c '{{' site/index.html && grep -c '}}' site/index.html`
Expected: "Generated site/index.html", 0, 0

**Step 3: Verify file structure**

Run: `ls templates/`
Expected: `app.js  index.html.j2  style.css`

**Step 4: Final summary commit (if any remaining changes)**

```bash
git add -A
git commit -m "Complete UI redesign: shadcn theme + Jinja2 migration"
```
