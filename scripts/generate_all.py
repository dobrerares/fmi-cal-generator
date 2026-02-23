#!/usr/bin/env python3
"""Generate .ics files for every specialization/group/subgroup combination."""

import sys
import time
from pathlib import Path

# Add src to path so we can import fmi_cal
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from fmi_cal.academic import fetch_academic_calendar, get_study_line
from fmi_cal.calendar_gen import filter_entries_for_student, generate_ics
from fmi_cal.scraper import fetch_group_schedules, fetch_specializations, get_schedule_base_url


def sanitize_dirname(name: str) -> str:
    """Make a string safe for use as a directory name."""
    # Replace characters that are problematic in URLs/filesystems
    return name.replace("/", "-").replace("\\", "-")


def main() -> None:
    output_dir = Path("site")
    output_dir.mkdir(exist_ok=True)

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

    # Fetch all specializations
    specs = fetch_specializations(base_url)
    print(f"Found {len(specs)} specialization entries")

    # Group specs by code to avoid duplicate fetches
    # (same code = same page, e.g. IE2.html)
    seen_codes: set[str] = set()
    total_files = 0
    errors: list[str] = []

    # Cache academic calendars per study line
    acad_cache: dict[str, object] = {}

    for spec in specs:
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

        for group_sched in schedules:
            group = group_sched.group
            safe_group = group.replace("/", "-")

            # Master's groups already have "/" in the name (e.g. "243/1").
            # These don't have further subgroup splits.
            has_subgroups = "/" not in group

            if has_subgroups:
                # Generate subgroup 1
                entries_1 = filter_entries_for_student(group_sched, group, "1")
                if entries_1:
                    ics = generate_ics(entries_1, acad_cal)
                    (spec_dir / f"{safe_group}-1.ics").write_bytes(ics)
                    total_files += 1

                # Generate subgroup 2
                entries_2 = filter_entries_for_student(group_sched, group, "2")
                if entries_2:
                    ics = generate_ics(entries_2, acad_cal)
                    (spec_dir / f"{safe_group}-2.ics").write_bytes(ics)
                    total_files += 1

                # Generate combined (both subgroups)
                entries_all = filter_entries_for_student(group_sched, group, None)
                if entries_all:
                    ics = generate_ics(entries_all, acad_cal)
                    (spec_dir / f"{safe_group}-all.ics").write_bytes(ics)
                    total_files += 1

                print(f"  Group {group}: {len(entries_1)}+{len(entries_2)} entries")
            else:
                # Master's group — no subgroup split, generate one file
                entries = filter_entries_for_student(group_sched, group, None)
                if entries:
                    ics = generate_ics(entries, acad_cal)
                    (spec_dir / f"{safe_group}.ics").write_bytes(ics)
                    total_files += 1
                print(f"  Group {group}: {len(entries)} entries")

        # Be polite to the server
        time.sleep(0.5)

    print(f"\nDone. Generated {total_files} .ics files.")
    if errors:
        print(f"\n{len(errors)} errors:")
        for e in errors:
            print(e)
        sys.exit(1)


if __name__ == "__main__":
    main()
