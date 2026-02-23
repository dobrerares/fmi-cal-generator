from datetime import datetime
from zoneinfo import ZoneInfo

from icalendar import Calendar, Event

from .academic import get_dates_for_entry
from .models import (
    AcademicCalendar,
    EventType,
    GroupSchedule,
    ScheduleEntry,
)

TIMEZONE = ZoneInfo("Europe/Bucharest")

TYPE_PREFIX = {
    EventType.CURS: "[C]",
    EventType.SEMINAR: "[S]",
    EventType.LABORATOR: "[L]",
}


def filter_entries_for_student(
    group_schedule: GroupSchedule,
    group: str,
    subgroup: str | None,
) -> list[ScheduleEntry]:
    """Keep only entries relevant to the student's group/subgroup.

    An entry matches if its formation is:
    - A year-wide code (doesn't start with a digit, e.g. "IE2") — always include
    - The group number (e.g. "921") — include
    - The student's subgroup (e.g. "921/1" when subgroup="1") — include

    Excludes the other subgroup (e.g. "921/2" when subgroup="1").
    If subgroup is None, include both subgroups.
    """
    result: list[ScheduleEntry] = []

    for entry in group_schedule.entries:
        formation = entry.formation

        # Year-wide code (doesn't start with digit) — always include
        if not formation[0].isdigit():
            result.append(entry)
            continue

        # Check if it's for this group
        if "/" in formation:
            # Subgroup entry like "921/1"
            entry_group, entry_sub = formation.split("/", 1)
            if entry_group != group:
                continue
            if subgroup is not None and entry_sub != subgroup:
                continue
            result.append(entry)
        else:
            # Whole-group entry like "921"
            if formation == group:
                result.append(entry)

    return result


def apply_user_filters(
    entries: list[ScheduleEntry],
    include_types: list[EventType],
    excluded_subjects: list[str],
) -> list[ScheduleEntry]:
    """Apply the two-pass user filter: types first, then individual subjects."""
    return [
        e
        for e in entries
        if e.event_type in include_types and e.subject not in excluded_subjects
    ]


def generate_ics(
    entries: list[ScheduleEntry],
    calendar: AcademicCalendar,
) -> bytes:
    """Generate an .ics file as bytes.

    Creates individual events for each occurrence (not RRULE),
    since vacation gaps and week parity make individual events simpler.
    """
    cal = Calendar()
    cal.add("prodid", "-//FMI Cal Generator//UBB Cluj//RO")
    cal.add("version", "2.0")
    cal.add("x-wr-calname", "FMI Schedule")
    cal.add("x-wr-timezone", "Europe/Bucharest")

    for entry in entries:
        dates = get_dates_for_entry(entry, calendar)
        prefix = TYPE_PREFIX.get(entry.event_type, "")

        for event_date in dates:
            event = Event()
            event.add("summary", f"{prefix} {entry.subject}")
            event.add(
                "dtstart",
                datetime(
                    event_date.year,
                    event_date.month,
                    event_date.day,
                    entry.start_hour,
                    0,
                    tzinfo=TIMEZONE,
                ),
            )
            event.add(
                "dtend",
                datetime(
                    event_date.year,
                    event_date.month,
                    event_date.day,
                    entry.end_hour,
                    0,
                    tzinfo=TIMEZONE,
                ),
            )
            if entry.room:
                event.add("location", entry.room)
            if entry.professor:
                event.add("description", entry.professor)

            cal.add_component(event)

    return cal.to_ical()
