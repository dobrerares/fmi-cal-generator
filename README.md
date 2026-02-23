# FMI Calendar Generator

Generate Google Calendar `.ics` files from [UBB Cluj CS](https://www.cs.ubbcluj.ro/) schedule pages.

Pick your specialization, year, group, and subgroup — get a calendar file that respects vacations, holidays, and even/odd week alternation (sapt. 1 / sapt. 2).

## Features

- **Auto-detects** the current semester and constructs the correct schedule URL
- **Scrapes the academic calendar** from the [university website](https://www.ubbcluj.ro/ro/studenti/invatamant/structura_anului_universitar) — no hardcoded dates
- **Handles week parity** — `sapt. 1` (odd weeks) and `sapt. 2` (even weeks) are correctly mapped across the semester
- **Skips vacations and holidays** — Easter break, Good Friday, May 1, Jun 1, etc.
- **Interactive TUI** — arrow-key menus for selecting specialization, year, group, subgroup, and filtering events
- **CLI mode** — pass flags for scripted/automated use
- **Event filtering** — choose which event types (courses, seminars, labs) and individual subjects to include
- **Saves preferences** — re-run without re-entering your selection

## Just want to download your calendar?

If this repo has GitHub Pages enabled, pre-built `.ics` files for every specialization/group/subgroup are available at:

**[https://orar-fmi.rdobre.ro/](https://orar-fmi.rdobre.ro/)**

Find your specialization, expand your year, download your `.ics` file, and import it into Google Calendar. No installation needed.

Calendars are regenerated weekly (every Sunday evening) to catch schedule changes.

## Quick start (CLI)

### With pip

```bash
git clone <repo-url>
cd fmi-cal-generator
pip install -e .
fmi-cal
```

### With Nix

```bash
nix develop
pip install --user InquirerPy
pip install -e .
fmi-cal
```

## Usage

### Interactive mode

Just run `fmi-cal` and follow the arrow-key menus:

1. Select specialization (e.g. "Informatica - in limba engleza")
2. Select year
3. Select group (e.g. 923)
4. Select subgroup (e.g. 1)
5. Toggle event types (courses / seminars / labs)
6. Toggle individual subjects on/off
7. `.ics` file is generated and preferences are saved

### CLI mode

```bash
# Generate without prompts
fmi-cal --spec IE2 --group 923 --subgroup 1 --no-filter

# Specify output file
fmi-cal --spec IE2 --group 923 --subgroup 1 --no-filter -o my_schedule.ics

# Override semester (default: auto-detected from current date)
fmi-cal --semester 2025-2
```

### Importing into Google Calendar

1. Open [Google Calendar](https://calendar.google.com)
2. Settings (gear icon) > Import & export
3. Select the generated `.ics` file
4. Choose which calendar to import into
5. Click Import

## How it works

```
index.html ──► fetch specializations ──► user picks spec/year
                                              │
schedule HTML ◄─────────────────────────── fetch schedule
     │
     ▼
parse tables ──► filter by group/subgroup ──► user filters events
                                                    │
academic calendar ◄──── scrape university website   │
     │                                              │
     ▼                                              ▼
compute teaching weeks ──► generate .ics with individual events
(14 weeks, skip vacations,     │
 handle sapt. 1/2 parity)     ▼
                          output .ics file
```

**Event format:**
- Title: `[C] Subject Name` (course), `[S] Subject Name` (seminar), `[L] Subject Name` (lab)
- Location: room number
- Description: professor name

**Key technical decisions:**
- Individual events per occurrence (not RRULE) — simpler with vacation gaps + week parity
- Week numbering continues across vacations (doesn't reset after Easter)
- Academic calendar parsed from live website, not hardcoded

## Project structure

```
src/fmi_cal/
  models.py         # Dataclasses: ScheduleEntry, AcademicCalendar, etc.
  scraper.py        # Fetch + parse schedule HTML tables (ISO-8859-2)
  academic.py       # Parse academic calendar, compute teaching weeks
  calendar_gen.py   # Filter entries, generate .ics
  config.py         # Save/load preferences (~/.config/fmi-cal/config.yaml)
  cli.py            # Entry point: argparse + InquirerPy menus

scripts/
  generate_all.py   # Batch-generate .ics for all specs/groups/subgroups
  generate_index.py # Generate static HTML landing page from site/ directory

.github/workflows/
  generate.yml      # Weekly cron + manual dispatch: generate + deploy to Pages
```

## Configuration

Preferences are saved to `~/.config/fmi-cal/config.yaml`:

```yaml
spec_code: IE2
group: "923"
subgroup: "1"
include_types:
  - Curs
  - Seminar
  - Laborator
excluded_subjects: []
```

On the next run, you'll be asked if you want to reuse the saved config.

## Supported specializations

All undergraduate and master's programs from the Faculty of Mathematics and Computer Science:

- Informatica (Romanian, English, Hungarian, German)
- Matematica (Romanian, Hungarian)
- Matematica-Informatica (Romanian, English, Hungarian)
- Inteligenta Artificiala (English)
- Ingineria Informatiei (Hungarian, English)
- All master's programs

The tool auto-detects the correct academic calendar (Romanian vs Hungarian/German study line) based on the specialization name.

## Development

```bash
# Install in dev mode
pip install -e .

# Run tests
pytest

# Run tests with verbose output
pytest -v
```

## License

MIT
