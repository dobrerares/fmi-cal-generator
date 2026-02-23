import argparse
import sys
from pathlib import Path

from InquirerPy import inquirer
from InquirerPy.base.control import Choice

from .academic import fetch_academic_calendar, get_study_line
from .calendar_gen import apply_user_filters, filter_entries_for_student, generate_ics
from .config import load_config, save_config
from .models import EventType, UserPreferences
from .scraper import fetch_group_schedules, fetch_specializations, get_schedule_base_url


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="fmi-cal",
        description="Generate Google Calendar .ics files from UBB Cluj CS schedules",
    )
    parser.add_argument("--spec", help="Specialization code (e.g. IE2)")
    parser.add_argument("--group", help="Group number (e.g. 923)")
    parser.add_argument("--subgroup", help="Subgroup number (1 or 2)")
    parser.add_argument(
        "--no-filter",
        action="store_true",
        help="Include all events without filtering",
    )
    parser.add_argument("--output", "-o", help="Output .ics file path")
    parser.add_argument(
        "--semester",
        help="Semester override (e.g. 2025-2)",
    )
    return parser.parse_args()


def _parse_semester_arg(semester_str: str) -> tuple[int, int]:
    """Parse '2025-2' into (2025, 2)."""
    parts = semester_str.split("-")
    return int(parts[0]), int(parts[1])


def main() -> None:
    args = parse_args()
    saved = load_config()

    # 1. Determine semester / base URL
    year, sem = None, None
    if args.semester:
        year, sem = _parse_semester_arg(args.semester)

    print("Detecting schedule URL...", flush=True)
    base_url = get_schedule_base_url(year, sem)
    print(f"Using: {base_url}")

    # Derive semester number from base URL for academic calendar
    semester_num = int(base_url.rstrip("/").split("/")[-2].split("-")[1])

    # 2. Pick specialization
    spec_code = args.spec
    spec_name = ""

    if not spec_code:
        if saved:
            use_saved = inquirer.confirm(
                message=f"Use saved config? (spec={saved.spec_code}, group={saved.group}, subgroup={saved.subgroup})",
                default=True,
            ).execute()
            if use_saved:
                spec_code = saved.spec_code

        if not spec_code:
            spec_code, spec_name = _interactive_pick_specialization(base_url)
    else:
        # If spec_code was provided via CLI, try to find the name
        specs = fetch_specializations(base_url)
        for s in specs:
            if s.code == spec_code:
                spec_name = s.name
                break

    # 3. Fetch schedule
    print(f"Fetching schedule for {spec_code}...", flush=True)
    schedules = fetch_group_schedules(base_url, spec_code)
    available_groups = [s.group for s in schedules]

    if not available_groups:
        print(f"No groups found for {spec_code}")
        sys.exit(1)

    # 4. Pick group
    group = args.group
    if not group:
        if saved and saved.spec_code == spec_code and saved.group in available_groups:
            group = saved.group
        else:
            group = inquirer.select(
                message="Select your group:",
                choices=available_groups,
            ).execute()

    # 5. Pick subgroup
    subgroup = args.subgroup
    if subgroup is None and not args.no_filter:
        if saved and saved.spec_code == spec_code and saved.group == group:
            subgroup = saved.subgroup
        else:
            sub_choice = inquirer.select(
                message="Select your subgroup:",
                choices=[
                    Choice("1", name="Subgroup 1"),
                    Choice("2", name="Subgroup 2"),
                    Choice(None, name="Both (no subgroup filter)"),
                ],
            ).execute()
            subgroup = sub_choice

    # 6. Filter entries for student
    group_schedule = next(
        (s for s in schedules if s.group == group), None
    )
    if group_schedule is None:
        print(f"Group {group} not found in {spec_code}")
        sys.exit(1)

    entries = filter_entries_for_student(group_schedule, group, subgroup)
    print(f"Found {len(entries)} schedule entries for {group}/{subgroup or 'all'}")

    # 7. Event filtering (unless --no-filter)
    include_types_str = ["Curs", "Seminar", "Laborator"]
    excluded_subjects: list[str] = []

    if not args.no_filter:
        # Use saved filters if same spec/group
        use_saved_filters = False
        if saved and saved.spec_code == spec_code and saved.group == group:
            use_saved_filters = inquirer.confirm(
                message="Use saved event filters?",
                default=True,
            ).execute()

        if use_saved_filters and saved:
            include_types_str = saved.include_types
            excluded_subjects = saved.excluded_subjects
        else:
            # Pass 1: pick event types
            include_types_str = inquirer.checkbox(
                message="Include which event types? (space to toggle, enter to confirm)",
                choices=[
                    Choice("Curs", name="[C] Courses", enabled=True),
                    Choice("Seminar", name="[S] Seminars", enabled=True),
                    Choice("Laborator", name="[L] Labs", enabled=True),
                ],
                validate=lambda result: len(result) > 0,
                invalid_message="Select at least one type",
            ).execute()

            # Filter by types first
            include_types = [EventType(t) for t in include_types_str]
            typed_entries = [e for e in entries if e.event_type in include_types]

            # Pass 2: toggle individual subjects
            unique_subjects = sorted(set(e.subject for e in typed_entries))
            if unique_subjects:
                included_subjects = inquirer.checkbox(
                    message="Toggle individual subjects (space to toggle, enter to confirm):",
                    choices=[
                        Choice(s, enabled=True) for s in unique_subjects
                    ],
                    validate=lambda result: len(result) > 0,
                    invalid_message="Select at least one subject",
                ).execute()
                excluded_subjects = [
                    s for s in unique_subjects if s not in included_subjects
                ]

    # Apply filters
    include_types = [EventType(t) for t in include_types_str]
    entries = apply_user_filters(entries, include_types, excluded_subjects)
    print(f"After filtering: {len(entries)} entries")

    # 8. Generate .ics
    study_line = get_study_line(spec_code, spec_name)
    print(f"Study line: {study_line} (semester {semester_num})")
    print("Fetching academic calendar...", flush=True)
    acad_cal = fetch_academic_calendar(study_line, semester_num)

    print("Generating calendar...", flush=True)
    ics_bytes = generate_ics(entries, acad_cal)

    # 9. Write output
    output_path = args.output or f"{spec_code}_{group}.ics"
    Path(output_path).write_bytes(ics_bytes)
    print(f"Calendar saved to {output_path}")

    # 10. Save preferences
    save_config(
        UserPreferences(
            spec_code=spec_code,
            group=group,
            subgroup=subgroup,
            include_types=include_types_str,
            excluded_subjects=excluded_subjects,
        )
    )
    print("Preferences saved.")


def _interactive_pick_specialization(base_url: str) -> tuple[str, str]:
    """Interactive specialization picker. Returns (code, name)."""
    print("Fetching specializations...", flush=True)
    specs = fetch_specializations(base_url)

    # Group by name
    by_name: dict[str, list] = {}
    for s in specs:
        by_name.setdefault(s.name, []).append(s)

    # Pick specialization name
    name = inquirer.select(
        message="Select specialization:",
        choices=list(by_name.keys()),
    ).execute()

    year_choices = by_name[name]
    if len(year_choices) == 1:
        return year_choices[0].code, name

    # Pick year
    chosen = inquirer.select(
        message="Select year:",
        choices=[Choice(s.code, name=f"Year {s.year}") for s in year_choices],
    ).execute()

    return chosen, name


if __name__ == "__main__":
    main()
