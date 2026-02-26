#!/usr/bin/env python3
"""Generate a static index.html with a custom calendar builder + quick download tree."""

import html
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
