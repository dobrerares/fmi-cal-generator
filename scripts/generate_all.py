#!/usr/bin/env python3
"""Generate .ics files and JSON data for every specialization/group/subgroup."""

import json
import sys
import time
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path

# Add src to path so we can import fmi_cal
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from fmi_cal.academic import fetch_academic_calendar, get_dates_for_entry, get_study_line
from fmi_cal.calendar_gen import filter_entries_for_student, generate_ics
from fmi_cal.models import AcademicCalendar, GroupSchedule, Specialization
from fmi_cal.scraper import fetch_group_schedules, fetch_room_legend, fetch_specializations, get_schedule_base_url


@dataclass
class SpecFetchResult:
    """Result of fetching data for one specialization."""
    spec: Specialization
    schedules: list[GroupSchedule]
    acad_cal: AcademicCalendar | None
    error: str | None = None


def fetch_spec_data(
    spec: Specialization,
    base_url: str,
    semester_num: int,
    acad_cache: dict[str, AcademicCalendar],
) -> SpecFetchResult:
    """Fetch schedules + academic calendar for one spec. Thread-safe."""
    try:
        schedules = fetch_group_schedules(base_url, spec.code)

        study_line = get_study_line(spec.code, spec.name)
        cache_key = f"{study_line}-{semester_num}"
        if cache_key not in acad_cache:
            acad_cache[cache_key] = fetch_academic_calendar(study_line, semester_num)
        acad_cal = acad_cache[cache_key]

        return SpecFetchResult(spec=spec, schedules=schedules, acad_cal=acad_cal)
    except Exception as e:
        return SpecFetchResult(spec=spec, schedules=[], acad_cal=None, error=str(e))


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
    t_start = time.perf_counter()

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

    total_files = 0
    errors: list[str] = []

    # Build index: group specs by name -> list of {year, code}
    # Use OrderedDict to preserve insertion order
    spec_index: OrderedDict[str, list[dict]] = OrderedDict()
    for spec in specs:
        spec_index.setdefault(spec.name, []).append({
            "year": spec.year,
            "code": spec.code,
        })

    # Deduplicate specs by code (only fetch each code once)
    seen_codes: set[str] = set()
    unique_specs: list[Specialization] = []
    for spec in specs:
        if spec.code not in seen_codes:
            seen_codes.add(spec.code)
            unique_specs.append(spec)

    # --- Phase 1: Parallel fetch all spec data ---
    t_fetch = time.perf_counter()
    acad_cache: dict[str, AcademicCalendar] = {}
    results: list[SpecFetchResult] = []

    print(f"\nFetching {len(unique_specs)} specializations in parallel...")

    with ThreadPoolExecutor() as executor:
        futures = {
            executor.submit(fetch_spec_data, spec, base_url, semester_num, acad_cache): spec
            for spec in unique_specs
        }
        for future in as_completed(futures):
            result = future.result()
            results.append(result)
            if result.error:
                print(f"  ERROR {result.spec.code}: {result.error}")
            else:
                print(f"  Fetched {result.spec.code}")

    t_fetch_done = time.perf_counter()
    print(f"\nPhase 1 (fetch): {t_fetch_done - t_fetch:.1f}s")

    # --- Phase 2: Sequential generation ---
    t_gen = time.perf_counter()

    for result in results:
        if result.error:
            errors.append(f"  ERROR fetching {result.spec.code}: {result.error}")
            continue

        spec = result.spec
        schedules = result.schedules
        acad_cal = result.acad_cal
        assert acad_cal is not None  # guaranteed when error is None

        spec_dir = output_dir / sanitize_dirname(spec.name) / f"Year {spec.year}"
        spec_dir.mkdir(parents=True, exist_ok=True)

        print(f"\n[{spec.code}] {spec.name} Year {spec.year}")

        # --- Generate .ics files ---
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

    t_gen_done = time.perf_counter()
    t_total = t_gen_done - t_start

    print(f"\nPhase 2 (generate): {t_gen_done - t_gen:.1f}s")
    print(f"Total: {t_total:.1f}s")
    print(f"Done. Generated {total_files} .ics files + JSON data.")
    if errors:
        print(f"\n{len(errors)} errors:")
        for e in errors:
            print(e)
        sys.exit(1)


if __name__ == "__main__":
    main()
