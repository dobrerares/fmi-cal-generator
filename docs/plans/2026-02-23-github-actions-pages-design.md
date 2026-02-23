# GitHub Actions + Pages: Pre-built Calendars

## Problem

Students currently need to install Python and run the CLI to generate their calendar.
Most students won't do this. A zero-install solution — just download a file from a URL —
would make the tool actually useful at scale.

## Solution

A GitHub Action that generates .ics files for every specialization/group/subgroup
combination and publishes them to GitHub Pages with a browsable landing page.

## Components

### `scripts/generate_all.py`

Orchestration script that:
1. Fetches the index page to discover all specializations
2. For each specialization, fetches the schedule and parses all groups
3. For each group, generates 3 .ics files:
   - `{group}-1.ics` (subgroup 1)
   - `{group}-2.ics` (subgroup 2)
   - `{group}-all.ics` (both subgroups combined)
4. Writes files into `site/{spec_name}/Year {N}/`
5. No event filtering — all courses, seminars, and labs included

### `scripts/generate_index.py`

Generates `site/index.html` from the directory structure:
- HTML5 `<details>/<summary>` for collapsible specialization sections
- Year sub-sections within each specialization
- Direct download links for each .ics file
- No JavaScript framework — pure HTML + minimal CSS

### `.github/workflows/generate.yml`

- **Triggers:** weekly cron (Monday 6:00 UTC) + manual workflow_dispatch
- **Steps:** checkout, install deps, run generate_all.py, run generate_index.py, deploy to GitHub Pages
- **Deploy:** uses `peaceiris/actions-gh-pages` or `actions/deploy-pages`

## Output structure

```
site/
  index.html
  Informatica - in limba engleza/
    Year 1/
      911-1.ics
      911-2.ics
      911-all.ics
      ...
    Year 2/
      921-1.ics
      921-2.ics
      921-all.ics
      ...
  Informatica - linia de studiu romana/
    ...
```

## Decisions

- All combinations generated (no configurable subset) — keeps it simple
- No filtering — full schedule per subgroup, students can filter in Google Calendar
- `<details>` tags for collapsible UI — no JS dependency, works everywhere
- Weekly + manual trigger — catches mid-semester schedule changes
