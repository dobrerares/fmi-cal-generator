#!/usr/bin/env python3
"""Generate a static index.html with a custom calendar builder + quick download tree."""

import html
import re
from datetime import datetime
from pathlib import Path
from urllib.parse import quote


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


def build_download_tree(site_dir: Path) -> str:
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
    """Generate the full HTML page."""
    download_tree, total_files = build_download_tree(site_dir)
    now = datetime.now().strftime("%Y-%m-%d %H:%M")

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>FMI Calendar Generator - UBB Cluj</title>
  <style>
    *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}

    :root {{
      --bg: #f5f5f7;
      --fg: #1d1d1f;
      --muted: #86868b;
      --card: #fff;
      --card-shadow: rgba(0,0,0,0.06);
      --border: #d2d2d7;
      --border-light: #e5e5ea;
      --hover-bg: #f5f5f7;
      --accent: #0071e3;
      --accent-hover: #0077ed;
      --accent-shadow: rgba(0,113,227,0.3);
      --badge-c-bg: #e8f0fe; --badge-c-fg: #1a73e8;
      --badge-s-bg: #fef3e0; --badge-s-fg: #e8710a;
      --badge-l-bg: #e6f4ea; --badge-l-fg: #1e8e3e;
      --disabled-btn: #d2d2d7;
      --info-bg: #e8f0fe;

    }}

    [data-theme="dark"] {{
      --bg: #1c1c1e;
      --fg: #f5f5f7;
      --muted: #98989d;
      --card: #2c2c2e;
      --card-shadow: rgba(0,0,0,0.3);
      --border: #48484a;
      --border-light: #38383a;
      --hover-bg: #3a3a3c;
      --accent: #0a84ff;
      --accent-hover: #409cff;
      --accent-shadow: rgba(10,132,255,0.3);
      --badge-c-bg: #1c3a5f; --badge-c-fg: #64b5f6;
      --badge-s-bg: #3e2a10; --badge-s-fg: #ffb74d;
      --badge-l-bg: #1a3a2a; --badge-l-fg: #81c784;
      --disabled-btn: #48484a;
      --info-bg: #1c3a5f;

    }}

    body {{
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      max-width: 840px;
      margin: 0 auto;
      padding: 2rem 1rem;
      background: var(--bg);
      color: var(--fg);
      line-height: 1.5;
      transition: background 0.2s, color 0.2s;
    }}

    /* Header */
    .header {{
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 1.5rem;
    }}
    h1 {{ font-size: 1.75rem; font-weight: 700; }}
    .subtitle {{ color: var(--muted); margin: 0.25rem 0 0; }}

    .theme-toggle {{
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 0.4rem 0.5rem;
      cursor: pointer;
      font-size: 1.1rem;
      line-height: 1;
      transition: background 0.15s;
      flex-shrink: 0;
      margin-top: 0.25rem;
    }}
    .theme-toggle:hover {{ background: var(--hover-bg); }}

    /* Tabs */
    .tabs {{
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1.25rem;
    }}
    .tab {{
      flex: 1;
      padding: 0.75rem 1rem;
      border: none;
      border-radius: 10px;
      background: var(--card);
      color: var(--muted);
      font-size: 0.95rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      box-shadow: 0 1px 3px var(--card-shadow);
    }}
    .tab:hover {{ color: var(--fg); }}
    .tab.active {{
      background: var(--accent);
      color: #fff;
      box-shadow: 0 2px 8px var(--accent-shadow);
    }}
    .tab-content {{ display: none; }}
    .tab-content.active {{ display: block; }}

    /* Builder */
    .card {{
      background: var(--card);
      border-radius: 12px;
      padding: 1.25rem;
      margin-bottom: 0.75rem;
      box-shadow: 0 1px 3px var(--card-shadow);
    }}
    .card.disabled {{ opacity: 0.4; pointer-events: none; }}
    .card h3 {{
      font-size: 0.8rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      color: var(--muted);
      margin-bottom: 0.6rem;
    }}

    select {{
      width: 100%;
      padding: 0.65rem 2.5rem 0.65rem 0.75rem;
      border: 1.5px solid var(--border);
      border-radius: 8px;
      font-size: 1rem;
      background-color: var(--card);
      color: var(--fg);
      appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%2398989d' stroke-width='1.5' fill='none'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 0.75rem center;
      cursor: pointer;
      transition: border-color 0.15s;
    }}
    select option {{ background: var(--card); color: var(--fg); }}
    select:focus {{ outline: none; border-color: var(--accent); }}

    /* Radio pills */
    .pill-group {{
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }}
    .pill-group label {{
      flex: 1;
      min-width: 0;
    }}
    .pill-group input {{ display: none; }}
    .pill-group span {{
      display: block;
      text-align: center;
      padding: 0.55rem 0.75rem;
      border: 1.5px solid var(--border);
      border-radius: 8px;
      font-size: 0.9rem;
      cursor: pointer;
      transition: all 0.15s;
      white-space: nowrap;
    }}
    .pill-group input:checked + span {{
      background: var(--accent);
      color: #fff;
      border-color: var(--accent);
    }}
    .pill-group span:hover {{
      border-color: var(--accent);
    }}

    /* Checkboxes */
    .check-group {{
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }}
    .check-group label {{
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.4rem 0.5rem;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.95rem;
      transition: background 0.1s;
    }}
    .check-group label:hover {{ background: var(--hover-bg); }}
    .check-group input[type="checkbox"] {{
      width: 18px;
      height: 18px;
      accent-color: var(--accent);
      cursor: pointer;
      flex-shrink: 0;
    }}
    .type-badge {{
      display: inline-block;
      font-size: 0.7rem;
      font-weight: 600;
      padding: 0.1rem 0.4rem;
      border-radius: 4px;
      margin-left: auto;
      flex-shrink: 0;
    }}
    .badge-c {{ background: var(--badge-c-bg); color: var(--badge-c-fg); }}
    .badge-s {{ background: var(--badge-s-bg); color: var(--badge-s-fg); }}
    .badge-l {{ background: var(--badge-l-bg); color: var(--badge-l-fg); }}

    .subject-group {{ margin-bottom: 0.15rem; }}
    .subject-parent {{
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.4rem 0.5rem;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.95rem;
      font-weight: 600;
      transition: background 0.1s;
    }}
    .subject-parent:hover {{ background: var(--hover-bg); }}
    .subject-parent input[type="checkbox"] {{
      width: 18px; height: 18px;
      accent-color: var(--accent);
      cursor: pointer; flex-shrink: 0;
    }}
    .subject-children {{
      padding-left: 1.75rem;
    }}
    .subject-children label {{
      font-size: 0.9rem;
    }}

    .filter-header {{
      display: flex;
      justify-content: space-between;
      align-items: center;
    }}
    .filter-header button {{
      font-size: 0.8rem;
      color: var(--accent);
      background: none;
      border: none;
      cursor: pointer;
      padding: 0.2rem 0.4rem;
      border-radius: 4px;
    }}
    .filter-header button:hover {{ background: var(--info-bg); }}

    #subject-search {{
      width: 100%;
      padding: 0.65rem 0.75rem;
      border: 1.5px solid var(--border);
      border-radius: 8px;
      font-size: 0.95rem;
      background: var(--card);
      color: var(--fg);
      margin-bottom: 0.6rem;
      transition: border-color 0.15s;
    }}
    #subject-search:focus {{
      outline: none;
      border-color: var(--accent);
    }}
    #subject-search::placeholder {{
      color: var(--muted);
    }}

    .combobox {{
      position: relative;
    }}
    .combobox input[type="text"] {{
      width: 100%;
      padding: 0.65rem 0.75rem;
      border: 1.5px solid var(--border);
      border-radius: 8px;
      font-size: 1rem;
      background: var(--card);
      color: var(--fg);
      transition: border-color 0.15s;
    }}
    .combobox input[type="text"]:focus {{
      outline: none;
      border-color: var(--accent);
    }}
    .combobox input[type="text"]::placeholder {{
      color: var(--muted);
    }}
    .combobox-list {{
      display: none;
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      max-height: 240px;
      overflow-y: auto;
      background: var(--card);
      border: 1.5px solid var(--border);
      border-top: none;
      border-radius: 0 0 8px 8px;
      z-index: 10;
      list-style: none;
      margin: 0;
      padding: 0;
    }}
    .combobox-list.open {{
      display: block;
    }}
    .combobox-list li {{
      padding: 0.5rem 0.75rem;
      cursor: pointer;
      font-size: 0.95rem;
      transition: background 0.1s;
    }}
    .combobox-list li:hover,
    .combobox-list li.highlighted {{
      background: var(--hover-bg);
    }}
    .combobox-list li.selected {{
      font-weight: 600;
      color: var(--accent);
    }}

    /* Preview + Download */
    .preview {{
      text-align: center;
      padding: 1.5rem;
    }}
    .event-count {{
      font-size: 2rem;
      font-weight: 700;
      color: var(--fg);
    }}
    .event-label {{ color: var(--muted); font-size: 0.9rem; }}
    .download-btn {{
      display: inline-block;
      margin-top: 1rem;
      padding: 0.75rem 2rem;
      background: var(--accent);
      color: #fff;
      border: none;
      border-radius: 10px;
      font-size: 1rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }}
    .download-btn:hover {{ background: var(--accent-hover); box-shadow: 0 2px 12px var(--accent-shadow); }}
    .download-btn:disabled {{
      background: var(--disabled-btn);
      cursor: not-allowed;
      box-shadow: none;
    }}

    .loading {{
      text-align: center;
      padding: 1rem;
      color: var(--muted);
    }}
    .loading::after {{
      content: "";
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 2px solid var(--border);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
      margin-left: 0.5rem;
      vertical-align: middle;
    }}
    @keyframes spin {{ to {{ transform: rotate(360deg); }} }}

    /* Quick download tree */
    #download-section details {{ margin-bottom: 0.25rem; }}
    #download-section details > summary {{
      cursor: pointer;
      padding: 0.6rem 0.8rem;
      background: var(--card);
      border: 1px solid var(--border-light);
      border-radius: 8px;
      font-weight: 500;
      list-style: none;
      transition: background 0.1s;
    }}
    #download-section details > summary:hover {{ background: var(--hover-bg); }}
    #download-section details > summary::-webkit-details-marker {{ display: none; }}
    #download-section details > summary::before {{ content: "\\25B6\\FE0E  "; font-size: 0.7em; }}
    #download-section details[open] > summary::before {{ content: "\\25BC\\FE0E  "; }}
    #download-section details[open] > summary {{ border-radius: 8px 8px 0 0; }}
    #download-section details > details {{ margin-left: 1.5rem; }}
    #download-section details > details > summary {{ font-weight: 400; }}
    .count {{ color: var(--muted); font-weight: 400; font-size: 0.85em; }}
    #download-section ul {{ list-style: none; padding: 0.5rem 0 0.5rem 2rem; }}
    #download-section li {{ padding: 0.25rem 0; }}
    a {{ color: var(--accent); text-decoration: none; }}
    a:hover {{ text-decoration: underline; }}

    footer {{
      margin-top: 2rem;
      padding-top: 1rem;
      border-top: 1px solid var(--border-light);
      color: var(--muted);
      font-size: 0.8rem;
      text-align: center;
    }}

    /* Mobile tweaks */
    @media (max-width: 500px) {{
      body {{ padding: 1rem 0.75rem; }}
      h1 {{ font-size: 1.4rem; }}
      .pill-group {{ gap: 0.35rem; }}
      .pill-group span {{ padding: 0.5rem; font-size: 0.85rem; }}
    }}
  </style>
</head>
<body data-theme="dark">
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
    <div class="card" style="padding:1rem 1.25rem; margin-bottom:1rem;">
      <strong>How to use:</strong>
      <ol style="margin:0.5rem 0 0 1.5rem; font-size:0.9rem;">
        <li>Find your specialization and group below</li>
        <li>Download the <code>.ics</code> file</li>
        <li>Open <a href="https://calendar.google.com/calendar/r/settings/export">Google Calendar Import</a></li>
        <li>Select the downloaded file and click Import</li>
      </ol>
    </div>

{download_tree}
  </div>

  <footer>
    Generated on {now} &middot; {total_files} pre-built calendars &middot;
    <a href="https://github.com/dobrerares/fmi-cal-generator">Source on GitHub</a>
  </footer>

  <script>
  (function() {{
    'use strict';

    // --- Theme ---
    const themeBtn = document.getElementById('theme-toggle');
    function getPreferredTheme() {{
      const saved = localStorage.getItem('fmi-cal-theme');
      if (saved) return saved;
      return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }}
    function applyTheme(theme) {{
      document.body.setAttribute('data-theme', theme);
      themeBtn.textContent = theme === 'dark' ? '\\u2600\\uFE0F' : '\\uD83C\\uDF19';
      localStorage.setItem('fmi-cal-theme', theme);
    }}
    applyTheme(getPreferredTheme());
    themeBtn.addEventListener('click', () => {{
      const current = document.body.getAttribute('data-theme');
      applyTheme(current === 'dark' ? 'light' : 'dark');
    }});

    // --- State ---
    let indexData = null;   // {{ specs: [{{ name, years: [{{year,code}}] }}] }}
    let specData = null;    // {{ code, name, year, groups: [{{name, hasSubgroups, entries}}] }}
    let selectedGroup = null;
    let selectedSubgroup = 'all';
    let restoring = false;

    const $ = s => document.querySelector(s);
    const $$ = s => document.querySelectorAll(s);
    function editDist(a, b) {{
      if (a.length > b.length) {{ const t = a; a = b; b = t; }}
      let prev = Array.from({{ length: a.length + 1 }}, (_, i) => i);
      for (let j = 1; j <= b.length; j++) {{
        const curr = [j];
        for (let i = 1; i <= a.length; i++) {{
          curr[i] = a[i-1] === b[j-1]
            ? prev[i-1]
            : 1 + Math.min(prev[i-1], prev[i], curr[i-1]);
        }}
        prev = curr;
      }}
      return prev[a.length];
    }}
    function fuzzyMatch(text, query) {{
      const tokens = query.toLowerCase().split(/\\s+/).filter(Boolean);
      if (!tokens.length) return true;
      const words = text.toLowerCase().split(/\\s+/);
      return tokens.every(tok => {{
        const maxDist = tok.length >= 7 ? 2 : tok.length >= 4 ? 1 : 0;
        return words.some(w => w.includes(tok) || editDist(tok, w) <= maxDist)
          || text.toLowerCase().includes(tok);
      }});
    }}

    // --- Tabs ---
    $$('.tab').forEach(btn => {{
      btn.addEventListener('click', () => {{
        $$('.tab').forEach(t => t.classList.remove('active'));
        $$('.tab-content').forEach(t => t.classList.remove('active'));
        btn.classList.add('active');
        $(`#${{btn.dataset.tab === 'builder' ? 'builder-section' : 'download-section'}}`).classList.add('active');
      }});
    }});

    // --- Enable/disable cards ---
    function enableCard(id) {{ $(`#${{id}}`).classList.remove('disabled'); }}
    function disableCard(id) {{ $(`#${{id}}`).classList.add('disabled'); }}

    function resetFrom(step) {{
      const order = ['year-card','group-card','subgroup-card','types-card','subjects-card','preview-card'];
      const idx = order.indexOf(step);
      for (let i = idx; i < order.length; i++) disableCard(order[i]);
      // Only null state that belongs to the reset level or below
      if (idx <= order.indexOf('group-card')) specData = null;
      if (idx <= order.indexOf('subgroup-card')) selectedGroup = null;
    }}

    // --- Spec change ---
    function onSpecChange(specIndex) {{
      resetFrom('year-card');
      if (specIndex === '' || specIndex == null) return;

      const spec = indexData.specs[specIndex];
      if (!spec) return;

      $('#spec-select').value = specIndex;

      const sel = $('#year-select');
      sel.innerHTML = '<option value="">Select year&hellip;</option>';
      spec.years.forEach(y => {{
        const opt = document.createElement('option');
        opt.value = y.code;
        opt.textContent = `Year ${{y.year}}`;
        sel.appendChild(opt);
      }});
      enableCard('year-card');

      if (spec.years.length === 1) {{
        sel.value = spec.years[0].code;
        sel.dispatchEvent(new Event('change'));
      }}
      saveState();
    }}

    // --- Load index + combobox ---
    let comboboxItems = [];
    let highlightedIdx = -1;

    function renderList(filter) {{
      const list = $('#spec-list');
      list.innerHTML = '';
      highlightedIdx = -1;
      comboboxItems.forEach((item, i) => {{
        if (filter && !fuzzyMatch(item.name, filter)) return;
        const li = document.createElement('li');
        li.textContent = item.name;
        li.dataset.index = item.index;
        if (String(item.index) === $('#spec-select').value) li.classList.add('selected');
        li.addEventListener('mousedown', e => {{
          e.preventDefault();
          selectSpec(item.index, item.name);
        }});
        list.appendChild(li);
      }});
    }}

    function openList() {{
      $('#spec-list').classList.add('open');
    }}
    function closeList() {{
      $('#spec-list').classList.remove('open');
      highlightedIdx = -1;
      // Remove highlights
      $$('#spec-list li').forEach(li => li.classList.remove('highlighted'));
    }}

    function selectSpec(index, name) {{
      $('#spec-select').value = index;
      $('#spec-input').value = name;
      closeList();
      onSpecChange(index);
    }}

    fetch('data/index.json')
      .then(r => r.json())
      .then(data => {{
        indexData = data;
        comboboxItems = data.specs.map((s, i) => ({{ name: s.name, index: i }}));
        $('#spec-input').placeholder = 'Select specialization\u2026';
        renderList('');
        restoreState();
      }})
      .catch(() => {{
        $('#spec-input').placeholder = 'Failed to load data';
        $('#spec-input').disabled = true;
      }});

    // --- Combobox events ---
    const specInput = $('#spec-input');

    specInput.addEventListener('focus', () => {{
      if (blurTimeout) clearTimeout(blurTimeout);
      specInput.select();
      renderList(specInput.value);
      openList();
    }});

    specInput.addEventListener('input', () => {{
      renderList(specInput.value);
      openList();
    }});

    let blurTimeout = null;
    specInput.addEventListener('blur', () => {{
      blurTimeout = setTimeout(() => {{
        closeList();
        // Revert text to current selection
        const idx = $('#spec-select').value;
        if (idx !== '' && indexData && indexData.specs[idx]) {{
          specInput.value = indexData.specs[idx].name;
        }} else {{
          specInput.value = '';
        }}
      }}, 150);
    }});

    specInput.addEventListener('keydown', e => {{
      const items = $$('#spec-list li');
      if (!items.length) return;

      if (e.key === 'ArrowDown') {{
        e.preventDefault();
        highlightedIdx = Math.min(highlightedIdx + 1, items.length - 1);
        items.forEach((li, i) => li.classList.toggle('highlighted', i === highlightedIdx));
        items[highlightedIdx].scrollIntoView({{ block: 'nearest' }});
      }} else if (e.key === 'ArrowUp') {{
        e.preventDefault();
        highlightedIdx = Math.max(highlightedIdx - 1, -1);
        items.forEach((li, i) => li.classList.toggle('highlighted', i === highlightedIdx));
        if (highlightedIdx >= 0) items[highlightedIdx].scrollIntoView({{ block: 'nearest' }});
      }} else if (e.key === 'Enter') {{
        e.preventDefault();
        if (highlightedIdx >= 0 && highlightedIdx < items.length) {{
          const li = items[highlightedIdx];
          selectSpec(Number(li.dataset.index), li.textContent);
        }}
      }} else if (e.key === 'Escape') {{
        closeList();
        specInput.blur();
      }}
    }});

    // --- Year change (fetch spec JSON) ---
    $('#year-select').addEventListener('change', function() {{
      resetFrom('group-card');
      if (!this.value) return;

      const code = this.value;
      const groupSel = $('#group-select');
      groupSel.innerHTML = '<option value="">Loading&hellip;</option>';
      enableCard('group-card');

      fetch(`data/${{code}}.json`)
        .then(r => r.json())
        .then(data => {{
          specData = data;
          groupSel.innerHTML = '<option value="">Select group&hellip;</option>';
          data.groups.forEach((g, i) => {{
            const opt = document.createElement('option');
            opt.value = i;
            opt.textContent = `Group ${{g.name}}`;
            groupSel.appendChild(opt);
          }});
          saveState();
        }})
        .catch(() => {{
          groupSel.innerHTML = '<option value="">Failed to load</option>';
        }});
    }});

    // --- Group change ---
    $('#group-select').addEventListener('change', function() {{
      resetFrom('subgroup-card');
      if (!this.value || !specData) return;

      const group = specData.groups[this.value];
      selectedGroup = group;

      // Subgroup pills
      const pills = $('#subgroup-pills');
      pills.innerHTML = '';
      if (group.hasSubgroups) {{
        ['1','2','all'].forEach(v => {{
          const lbl = document.createElement('label');
          const inp = document.createElement('input');
          inp.type = 'radio';
          inp.name = 'subgroup';
          inp.value = v;
          if (v === 'all') inp.checked = true;
          const span = document.createElement('span');
          span.textContent = v === 'all' ? 'Both' : `Subgroup ${{v}}`;
          lbl.appendChild(inp);
          lbl.appendChild(span);
          pills.appendChild(lbl);
          inp.addEventListener('change', () => {{
            selectedSubgroup = v;
            updateSubjects();
            updatePreview();
          }});
        }});
        selectedSubgroup = 'all';
        enableCard('subgroup-card');
      }} else {{
        selectedSubgroup = 'all';
      }}

      enableCard('types-card');
      enableCard('subjects-card');
      enableCard('preview-card');
      updateSubjects();
      updatePreview();
    }});

    // --- Type toggles (batch check/uncheck matching subject entries) ---
    $$('#types-card input[type="checkbox"]').forEach(cb => {{
      cb.addEventListener('change', () => {{
        const t = cb.dataset.type;
        $$('#subject-list input[data-key]').forEach(sc => {{
          if (sc.dataset.key.endsWith('|||' + t)) sc.checked = cb.checked;
        }});
        // Sync all parent checkboxes
        $$('#subject-list .subject-group').forEach(g => {{
          const parentCb = g.querySelector('.subject-parent input');
          const childCbs = [...g.querySelectorAll('.subject-children input[data-key]')];
          if (parentCb && childCbs.length) syncParent(parentCb, childCbs);
        }});
        updateToggleBtn();
        updatePreview();
      }});
    }});

    // --- Subject list ---
    function getActiveTypes() {{
      const types = new Set();
      $$('#types-card input[type="checkbox"]').forEach(cb => {{
        if (cb.checked) types.add(cb.dataset.type);
      }});
      return types;
    }}

    function syncParent(parentCb, childCbs) {{
      const total = childCbs.length;
      const checked = childCbs.filter(c => c.checked).length;
      parentCb.checked = checked === total;
      parentCb.indeterminate = checked > 0 && checked < total;
    }}

    function updateSubjects() {{
      if (!selectedGroup) return;

      const allTypes = new Set(['Curs', 'Seminar', 'Laborator']);
      const filtered = filterEntries(selectedGroup, allTypes, new Set());

      // Build Map<subject, Set<type>>
      const subjTypes = new Map();
      filtered.forEach(e => {{
        if (!subjTypes.has(e.subject)) subjTypes.set(e.subject, new Set());
        subjTypes.get(e.subject).add(e.type);
      }});

      const list = $('#subject-list');
      // Preserve checked state using composite keys
      const prev = {{}};
      list.querySelectorAll('input[data-key]').forEach(cb => {{ prev[cb.dataset.key] = cb.checked; }});

      list.innerHTML = '';
      const BADGE = {{ 'Curs': ['C', 'badge-c'], 'Seminar': ['S', 'badge-s'], 'Laborator': ['L', 'badge-l'] }};
      const sortedSubjects = [...subjTypes.keys()].sort();

      sortedSubjects.forEach(subj => {{
        const typesSet = subjTypes.get(subj);
        const typeArr = [...typesSet].sort();

        if (typeArr.length === 1) {{
          // Single type → flat row
          const t = typeArr[0];
          const key = subj + '|||' + t;
          const badge = BADGE[t] || ['?',''];
          const lbl = document.createElement('label');
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.dataset.key = key;
          cb.checked = prev[key] !== undefined ? prev[key] : true;
          cb.addEventListener('change', () => {{ updateToggleBtn(); updatePreview(); }});
          const nameSpan = document.createElement('span');
          nameSpan.textContent = subj;
          const badgeSpan = document.createElement('span');
          badgeSpan.className = `type-badge ${{badge[1]}}`;
          badgeSpan.textContent = badge[0];
          lbl.appendChild(cb);
          lbl.appendChild(nameSpan);
          lbl.appendChild(badgeSpan);
          list.appendChild(lbl);
        }} else {{
          // Multi-type → grouped with parent
          const group = document.createElement('div');
          group.className = 'subject-group';

          const parentRow = document.createElement('div');
          parentRow.className = 'subject-parent';
          const parentCb = document.createElement('input');
          parentCb.type = 'checkbox';
          const parentName = document.createElement('span');
          parentName.textContent = subj;
          parentRow.appendChild(parentCb);
          parentRow.appendChild(parentName);
          group.appendChild(parentRow);

          const childContainer = document.createElement('div');
          childContainer.className = 'subject-children check-group';
          const childCbs = [];

          typeArr.forEach(t => {{
            const key = subj + '|||' + t;
            const badge = BADGE[t] || ['?',''];
            const lbl = document.createElement('label');
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.dataset.key = key;
            cb.checked = prev[key] !== undefined ? prev[key] : true;
            cb.addEventListener('change', () => {{
              syncParent(parentCb, childCbs);
              updateToggleBtn();
              updatePreview();
            }});
            childCbs.push(cb);
            const nameSpan = document.createElement('span');
            nameSpan.textContent = t === 'Curs' ? 'Course' : t === 'Seminar' ? 'Seminar' : t === 'Laborator' ? 'Lab' : t;
            const badgeSpan = document.createElement('span');
            badgeSpan.className = `type-badge ${{badge[1]}}`;
            badgeSpan.textContent = badge[0];
            lbl.appendChild(cb);
            lbl.appendChild(nameSpan);
            lbl.appendChild(badgeSpan);
            childContainer.appendChild(lbl);
          }});

          group.appendChild(childContainer);
          list.appendChild(group);

          // Parent toggles all children
          parentCb.addEventListener('change', () => {{
            childCbs.forEach(c => {{ c.checked = parentCb.checked; }});
            parentCb.indeterminate = false;
            updateToggleBtn();
            updatePreview();
          }});

          // Initial parent state
          syncParent(parentCb, childCbs);
        }}
      }});

      updateToggleBtn();
      $('#subject-search').value = '';
    }}

    function updateToggleBtn() {{
      const cbs = [...$$('#subject-list input[data-key]')].filter(
        cb => cb.closest('label, .subject-group').style.display !== 'none'
      );
      const allChecked = cbs.length > 0 && cbs.every(cb => cb.checked);
      $('#toggle-subjects-btn').textContent = allChecked ? 'Deselect all' : 'Select all';
    }}

    $('#toggle-subjects-btn').addEventListener('click', () => {{
      const cbs = [...$$('#subject-list input[data-key]')].filter(
        cb => cb.closest('label, .subject-group').style.display !== 'none'
      );
      const allChecked = cbs.length > 0 && cbs.every(cb => cb.checked);
      cbs.forEach(cb => {{ cb.checked = !allChecked; }});
      // Sync all parent checkboxes
      $$('#subject-list .subject-group').forEach(g => {{
        const parentCb = g.querySelector('.subject-parent input');
        const childCbs = [...g.querySelectorAll('.subject-children input[data-key]')];
        if (parentCb && childCbs.length) syncParent(parentCb, childCbs);
      }});
      updateToggleBtn();
      updatePreview();
    }});

    // --- Subject search ---
    $('#subject-search').addEventListener('input', function() {{
      const q = this.value;
      // Filter grouped subjects
      $$('#subject-list .subject-group').forEach(g => {{
        const name = g.querySelector('.subject-parent span').textContent;
        g.style.display = fuzzyMatch(name, q) ? '' : 'none';
      }});
      // Filter flat (single-type) labels
      $$('#subject-list > label').forEach(lbl => {{
        const spans = lbl.querySelectorAll('span');
        const name = spans.length ? spans[0].textContent : '';
        lbl.style.display = fuzzyMatch(name, q) ? '' : 'none';
      }});
      updateToggleBtn();
    }});

    // --- Filtering ---
    function filterEntries(group, types, excludedKeys) {{
      const gName = group.name;
      const sub = selectedSubgroup;
      return group.entries.filter(e => {{
        if (!types.has(e.type)) return false;
        if (excludedKeys.has(e.subject + '|||' + e.type)) return false;
        const f = e.formation;
        if (!/^\\d/.test(f)) return true;
        if (f === gName) return true;
        if (f.includes('/') && !gName.includes('/')) {{
          const parts = f.split('/');
          if (parts[0] !== gName) return false;
          if (sub && sub !== 'all' && parts[1] !== sub) return false;
          return true;
        }}
        return false;
      }});
    }}

    // --- Preview ---
    function getFilteredEntries() {{
      if (!selectedGroup) return [];
      const allTypes = new Set(['Curs', 'Seminar', 'Laborator']);
      const excluded = new Set();
      $$('#subject-list input[data-key]').forEach(cb => {{
        if (!cb.checked) excluded.add(cb.dataset.key);
      }});
      return filterEntries(selectedGroup, allTypes, excluded);
    }}

    function updatePreview() {{
      const entries = getFilteredEntries();
      const count = entries.reduce((sum, e) => sum + e.dates.length, 0);
      $('#event-count').textContent = count;
      $('#download-btn').disabled = count === 0;
      saveState();
    }}

    // --- Persistence ---
    function saveState() {{
      if (restoring) return;
      try {{
        const state = {{}};
        state.specIndex = $('#spec-select').value;
        state.yearCode = $('#year-select').value;
        state.groupIndex = $('#group-select').value;
        state.subgroup = selectedSubgroup;
        state.uncheckedTypes = [];
        $$('#types-card input[type="checkbox"]').forEach(cb => {{
          if (!cb.checked) state.uncheckedTypes.push(cb.dataset.type);
        }});
        state.excludedKeys = [];
        $$('#subject-list input[data-key]').forEach(cb => {{
          if (!cb.checked) state.excludedKeys.push(cb.dataset.key);
        }});
        localStorage.setItem('fmi-cal-state', JSON.stringify(state));
      }} catch (e) {{}}
    }}

    function restoreState() {{
      try {{
        const raw = localStorage.getItem('fmi-cal-state');
        if (!raw) return;
        const state = JSON.parse(raw);
        if (!state || state.specIndex === '' || state.specIndex == null) return;
        if (!indexData.specs[state.specIndex]) return;

        restoring = true;

        const spec = indexData.specs[state.specIndex];
        $('#spec-select').value = state.specIndex;
        $('#spec-input').value = spec.name;

        // Populate year options (same as onSpecChange)
        const yearSel = $('#year-select');
        yearSel.innerHTML = '<option value="">Select year&hellip;</option>';
        spec.years.forEach(y => {{
          const opt = document.createElement('option');
          opt.value = y.code;
          opt.textContent = `Year ${{y.year}}`;
          yearSel.appendChild(opt);
        }});
        enableCard('year-card');

        // Validate yearCode
        if (!state.yearCode || !spec.years.some(y => y.code === state.yearCode)) {{
          restoring = false;
          return;
        }}
        yearSel.value = state.yearCode;

        // Fetch year data
        fetch(`data/${{state.yearCode}}.json`)
          .then(r => r.json())
          .then(data => {{
            specData = data;

            // Populate group options
            const groupSel = $('#group-select');
            groupSel.innerHTML = '<option value="">Select group&hellip;</option>';
            data.groups.forEach((g, i) => {{
              const opt = document.createElement('option');
              opt.value = i;
              opt.textContent = `Group ${{g.name}}`;
              groupSel.appendChild(opt);
            }});
            enableCard('group-card');

            // Validate groupIndex
            const gi = state.groupIndex;
            if (gi === '' || gi === null || gi === undefined || !data.groups[gi]) {{
              restoring = false;
              return;
            }}
            groupSel.value = gi;
            selectedGroup = data.groups[gi];

            // Build subgroup pills (same as group-change handler)
            const group = selectedGroup;
            const pills = $('#subgroup-pills');
            pills.innerHTML = '';
            if (group.hasSubgroups) {{
              const savedSub = (state.subgroup === '1' || state.subgroup === '2') ? state.subgroup : 'all';
              ['1','2','all'].forEach(v => {{
                const lbl = document.createElement('label');
                const inp = document.createElement('input');
                inp.type = 'radio';
                inp.name = 'subgroup';
                inp.value = v;
                if (v === savedSub) inp.checked = true;
                const span = document.createElement('span');
                span.textContent = v === 'all' ? 'Both' : `Subgroup ${{v}}`;
                lbl.appendChild(inp);
                lbl.appendChild(span);
                pills.appendChild(lbl);
                inp.addEventListener('change', () => {{
                  selectedSubgroup = v;
                  updateSubjects();
                  updatePreview();
                }});
              }});
              selectedSubgroup = savedSub;
              enableCard('subgroup-card');
            }} else {{
              selectedSubgroup = 'all';
            }}

            // Restore unchecked types
            if (state.uncheckedTypes && state.uncheckedTypes.length) {{
              $$('#types-card input[type="checkbox"]').forEach(cb => {{
                if (state.uncheckedTypes.includes(cb.dataset.type)) cb.checked = false;
              }});
            }}

            enableCard('types-card');
            enableCard('subjects-card');
            enableCard('preview-card');

            updateSubjects();

            // Apply excludedKeys (uncheck matching inputs)
            if (state.excludedKeys && state.excludedKeys.length) {{
              const excSet = new Set(state.excludedKeys);
              $$('#subject-list input[data-key]').forEach(cb => {{
                if (excSet.has(cb.dataset.key)) cb.checked = false;
              }});
              // Sync all parent checkboxes
              $$('#subject-list .subject-group').forEach(g => {{
                const parentCb = g.querySelector('.subject-parent input');
                const childCbs = [...g.querySelectorAll('.subject-children input[data-key]')];
                if (parentCb && childCbs.length) syncParent(parentCb, childCbs);
              }});
            }}

            updatePreview();
            restoring = false;
          }})
          .catch(() => {{
            restoring = false;
          }});
      }} catch (e) {{
        restoring = false;
      }}
    }}

    // --- ICS generation ---
    function icsEscape(s) {{
      return s.replace(/\\\\/g, '\\\\\\\\').replace(/;/g, '\\\\;').replace(/,/g, '\\\\,').replace(/\\n/g, '\\\\n');
    }}

    function generateICS(entries) {{
      const PREFIX = {{ 'Curs': '[C]', 'Seminar': '[S]', 'Laborator': '[L]' }};
      const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//FMI Cal Generator//UBB Cluj//RO',
        'X-WR-CALNAME:FMI Schedule',
        'X-WR-TIMEZONE:Europe/Bucharest',
      ];

      for (const e of entries) {{
        const pfx = PREFIX[e.type] || '';
        for (const ds of e.dates) {{
          const d = ds.replace(/-/g, '');
          const sh = String(e.startHour).padStart(2, '0');
          const eh = String(e.endHour).padStart(2, '0');
          lines.push('BEGIN:VEVENT');
          lines.push(`DTSTART;TZID=Europe/Bucharest:${{d}}T${{sh}}0000`);
          lines.push(`DTEND;TZID=Europe/Bucharest:${{d}}T${{eh}}0000`);
          lines.push(`SUMMARY:${{icsEscape(pfx + ' ' + e.subject)}}`);
          if (e.room) lines.push(`LOCATION:${{icsEscape(e.room)}}`);
          if (e.professor) lines.push(`DESCRIPTION:${{icsEscape(e.professor)}}`);
          lines.push('END:VEVENT');
        }}
      }}

      lines.push('END:VCALENDAR');
      return lines.join('\\r\\n');
    }}

    $('#download-btn').addEventListener('click', () => {{
      const entries = getFilteredEntries();
      if (!entries.length) return;

      const ics = generateICS(entries);
      const blob = new Blob([ics], {{ type: 'text/calendar;charset=utf-8' }});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;

      // Build filename: spec-group-subgroup.ics
      const code = specData ? specData.code : 'schedule';
      const gName = selectedGroup.name.replace('/', '-');
      const sub = selectedSubgroup === 'all' ? 'all' : selectedSubgroup;
      a.download = `${{code}}-${{gName}}-${{sub}}.ics`;

      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }});

  }})();
  </script>
</body>
</html>"""


def main() -> None:
    site_dir = Path("site")
    if not site_dir.exists():
        print("Error: site/ directory not found. Run generate_all.py first.")
        raise SystemExit(1)

    index_html = generate_index(site_dir)
    (site_dir / "index.html").write_text(index_html, encoding="utf-8")
    print(f"Generated site/index.html")


if __name__ == "__main__":
    main()
