#!/usr/bin/env python3
"""Generate a static index.html from the site/ directory structure."""

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
    # "921-1.ics" -> (921, "1"), "921-all.ics" -> (921, "all")
    base = name.replace(".ics", "")
    parts = base.rsplit("-", 1)
    try:
        group_num = int(parts[0])
    except ValueError:
        group_num = 0
    suffix = parts[1] if len(parts) > 1 else ""
    # Sort: 1, 2, all
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


def generate_index(site_dir: Path) -> str:
    """Generate HTML for the index page."""
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

    now = datetime.now().strftime("%Y-%m-%d %H:%M")

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
                links.append(f'            <li><a href="{href}" download>{html.escape(label)}</a></li>')

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

    return f"""<!DOCTYPE html>
<html lang="ro">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>FMI Calendar Generator - UBB Cluj</title>
  <style>
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 2rem 1rem;
      background: #fafafa;
      color: #1a1a1a;
    }}
    h1 {{ margin-bottom: 0.5rem; }}
    .subtitle {{ color: #666; margin-bottom: 1.5rem; }}
    .info {{ background: #e8f4fd; padding: 1rem; border-radius: 8px; margin-bottom: 1.5rem; font-size: 0.9rem; }}
    .info ol {{ margin-left: 1.5rem; }}
    details {{ margin-bottom: 0.25rem; }}
    details > summary {{
      cursor: pointer;
      padding: 0.6rem 0.8rem;
      background: #fff;
      border: 1px solid #ddd;
      border-radius: 6px;
      font-weight: 500;
      list-style: none;
    }}
    details > summary::-webkit-details-marker {{ display: none; }}
    details > summary::before {{ content: "\\25B6\\FE0E  "; font-size: 0.7em; }}
    details[open] > summary::before {{ content: "\\25BC\\FE0E  "; }}
    details[open] > summary {{ border-radius: 6px 6px 0 0; }}
    details > details {{ margin-left: 1.5rem; }}
    details > details > summary {{ background: #f8f8f8; font-weight: 400; }}
    .count {{ color: #888; font-weight: 400; font-size: 0.85em; }}
    ul {{ list-style: none; padding: 0.5rem 0 0.5rem 2rem; }}
    li {{ padding: 0.25rem 0; }}
    a {{ color: #0366d6; text-decoration: none; }}
    a:hover {{ text-decoration: underline; }}
    footer {{ margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #eee; color: #888; font-size: 0.8rem; }}
  </style>
</head>
<body>
  <h1>FMI Calendar Generator</h1>
  <p class="subtitle">UBB Cluj CS Schedule &rarr; Google Calendar</p>

  <div class="info">
    <strong>How to use:</strong>
    <ol>
      <li>Find your specialization and group below</li>
      <li>Download the <code>.ics</code> file</li>
      <li>Open <a href="https://calendar.google.com/calendar/r/settings/export">Google Calendar Import</a></li>
      <li>Select the downloaded file and click Import</li>
    </ol>
  </div>

{chr(10).join(parts_html)}

  <footer>
    <p>Generated on {now} &middot; {total_files} calendar files &middot;
    <a href="https://github.com">Source on GitHub</a></p>
  </footer>
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
