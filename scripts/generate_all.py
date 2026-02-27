#!/usr/bin/env python3
"""Generate .ics files and JSON data for every specialization/group/subgroup."""

import json
import sys
import time
from collections import OrderedDict
from pathlib import Path

# Add src to path so we can import fmi_cal
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from fmi_cal.academic import fetch_academic_calendar, get_dates_for_entry, get_study_line
from fmi_cal.calendar_gen import filter_entries_for_student, generate_ics
from fmi_cal.models import AcademicCalendar, GroupSchedule
from fmi_cal.scraper import fetch_group_schedules, fetch_room_legend, fetch_specializations, get_schedule_base_url


def sanitize_dirname(name: str) -> str:
    """Make a string safe for use as a directory name."""
    return name.replace("/", "-").replace("\\", "-")


def entry_to_json(entry, acad_cal: AcademicCalendar) -> dict:
    """Convert a ScheduleEntry to a JSON-serializable dict with pre-computed dates."""
    dates = get_dates_for_entry(entry, acad_cal)
    return {
        "day": entry.day,
        "startHour": entry.start_hour,
        "endHour": entry.end_hour,
        "frequency": entry.frequency.value,
        "room": entry.room,
        "formation": entry.formation,
        "type": entry.event_type.value,
        "subject": entry.subject,
        "professor": entry.professor,
        "dates": [d.isoformat() for d in dates],
    }


def build_spec_json(
    schedules: list[GroupSchedule], acad_cal: AcademicCalendar
) -> list[dict]:
    """Build JSON group data for a specialization."""
    groups = []
    for gs in schedules:
        has_subgroups = "/" not in gs.group
        entries_json = [entry_to_json(e, acad_cal) for e in gs.entries]
        groups.append({
            "name": gs.group,
            "hasSubgroups": has_subgroups,
            "entries": entries_json,
        })
    return groups


def main() -> None:
    output_dir = Path("site")
    output_dir.mkdir(exist_ok=True)
    data_dir = output_dir / "data"
    data_dir.mkdir(exist_ok=True)

    # CNAME for GitHub Pages custom domain
    (output_dir / "CNAME").write_text("orar-fmi.rdobre.ro\n")

    # Determine base URL
    semester_arg = sys.argv[1] if len(sys.argv) > 1 else None
    if semester_arg:
        year, sem = semester_arg.split("-")
        base_url = get_schedule_base_url(int(year), int(sem))
    else:
        base_url = get_schedule_base_url()

    semester_num = int(base_url.rstrip("/").split("/")[-2].split("-")[1])
    print(f"Base URL: {base_url}")
    print(f"Semester: {semester_num}")

    # Fetch room legend (shared across all specs)
    try:
        room_legend = fetch_room_legend(base_url)
        print(f"Room legend: {len(room_legend)} rooms")
        rooms_path = data_dir / "rooms.json"
        rooms_path.write_text(json.dumps(room_legend, ensure_ascii=False), encoding="utf-8")
        print(f"Wrote {rooms_path}")
    except Exception as e:
        print(f"WARNING: Could not fetch room legend: {e}")
        room_legend = {}

    # Fetch all specializations
    specs = fetch_specializations(base_url)
    print(f"Found {len(specs)} specialization entries")

    seen_codes: set[str] = set()
    total_files = 0
    errors: list[str] = []

    # Cache academic calendars per study line
    acad_cache: dict[str, AcademicCalendar] = {}

    # Build index: group specs by name -> list of {year, code}
    # Use OrderedDict to preserve insertion order
    spec_index: OrderedDict[str, list[dict]] = OrderedDict()

    for spec in specs:
        # Always add to index (even if code was seen — same name, different year)
        spec_index.setdefault(spec.name, []).append({
            "year": spec.year,
            "code": spec.code,
        })

        if spec.code in seen_codes:
            continue
        seen_codes.add(spec.code)

        spec_dir = output_dir / sanitize_dirname(spec.name) / f"Year {spec.year}"
        spec_dir.mkdir(parents=True, exist_ok=True)

        print(f"\n[{spec.code}] {spec.name} Year {spec.year}")

        try:
            schedules = fetch_group_schedules(base_url, spec.code)
        except Exception as e:
            msg = f"  ERROR fetching {spec.code}: {e}"
            print(msg)
            errors.append(msg)
            continue

        # Get academic calendar for this study line
        study_line = get_study_line(spec.code, spec.name)
        cache_key = f"{study_line}-{semester_num}"
        if cache_key not in acad_cache:
            try:
                acad_cache[cache_key] = fetch_academic_calendar(study_line, semester_num)
            except Exception as e:
                msg = f"  ERROR fetching academic calendar for {study_line}: {e}"
                print(msg)
                errors.append(msg)
                continue
        acad_cal = acad_cache[cache_key]

        # --- Generate .ics files (existing logic) ---
        for group_sched in schedules:
            group = group_sched.group
            safe_group = group.replace("/", "-")
            has_subgroups = "/" not in group

            if has_subgroups:
                entries_1 = filter_entries_for_student(group_sched, group, "1")
                if entries_1:
                    ics = generate_ics(entries_1, acad_cal, room_legend)
                    (spec_dir / f"{safe_group}-1.ics").write_bytes(ics)
                    total_files += 1

                entries_2 = filter_entries_for_student(group_sched, group, "2")
                if entries_2:
                    ics = generate_ics(entries_2, acad_cal, room_legend)
                    (spec_dir / f"{safe_group}-2.ics").write_bytes(ics)
                    total_files += 1

                entries_all = filter_entries_for_student(group_sched, group, None)
                if entries_all:
                    ics = generate_ics(entries_all, acad_cal, room_legend)
                    (spec_dir / f"{safe_group}-all.ics").write_bytes(ics)
                    total_files += 1

                print(f"  Group {group}: {len(entries_1)}+{len(entries_2)} entries")
            else:
                entries = filter_entries_for_student(group_sched, group, None)
                if entries:
                    ics = generate_ics(entries, acad_cal, room_legend)
                    (spec_dir / f"{safe_group}.ics").write_bytes(ics)
                    total_files += 1
                print(f"  Group {group}: {len(entries)} entries")

        # --- Generate JSON data ---
        spec_json = {
            "code": spec.code,
            "name": spec.name,
            "year": spec.year,
            "groups": build_spec_json(schedules, acad_cal),
        }
        json_path = data_dir / f"{spec.code}.json"
        json_path.write_text(json.dumps(spec_json, ensure_ascii=False), encoding="utf-8")
        print(f"  Wrote {json_path}")

        time.sleep(0.5)

    # Write index.json
    index_data = {
        "specs": [
            {"name": name, "years": sorted(years, key=lambda y: y["year"])}
            for name, years in spec_index.items()
        ]
    }
    index_path = data_dir / "index.json"
    index_path.write_text(json.dumps(index_data, ensure_ascii=False), encoding="utf-8")
    print(f"\nWrote {index_path}")

    print(f"Done. Generated {total_files} .ics files + JSON data.")
    if errors:
        print(f"\n{len(errors)} errors:")
        for e in errors:
            print(e)
        sys.exit(1)


if __name__ == "__main__":
    main()
