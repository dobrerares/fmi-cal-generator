import re
from datetime import date, timedelta

import requests
from bs4 import BeautifulSoup

from .models import AcademicCalendar, ScheduleEntry, TeachingPeriod, Frequency

ACADEMIC_CALENDAR_URL = (
    "https://www.ubbcluj.ro/ro/studenti/invatamant/structura_anului_universitar"
)

DAY_MAP = {
    "Luni": 0,
    "Marti": 1,
    "Miercuri": 2,
    "Joi": 3,
    "Vineri": 4,
    "Sambata": 5,
    "Duminica": 6,
}


def get_study_line(spec_code: str, spec_name: str = "") -> str:
    """Detect study line from the specialization code and/or name.

    The name is more reliable since it contains "maghiara" or "germana"
    keywords. The code prefix is used as fallback.
    """
    name_lower = spec_name.lower()
    if "maghiar" in name_lower:
        return "hungarian"
    if "german" in name_lower:
        return "german"

    # Fallback: detect from code prefix
    prefix = re.sub(r"\d+$", "", spec_code).upper()
    hungarian_prefixes = {"IM", "MM", "MIM", "IIM", "MIMDS"}
    if prefix in hungarian_prefixes:
        return "hungarian"
    if prefix == "IG":
        return "german"

    return "romanian"


def fetch_academic_calendar(
    study_line: str = "romanian", semester: int = 2
) -> AcademicCalendar:
    """Scrape and parse the academic calendar from the university website."""
    resp = requests.get(ACADEMIC_CALENDAR_URL, timeout=15)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.content, "html.parser")

    # Track semantic headings rather than global table positions: final-year
    # variants can add tables between the study lines.
    line_keyword = {
        "romanian": "română",
        "hungarian": "maghiară",
        "german": "germană",
    }.get(study_line)
    if line_keyword is not None and semester in (1, 2):
        in_study_line = False
        in_semester = False
        for node in soup.find_all(["h2", "p", "table"]):
            if node.find_parent("table") is not None:
                continue
            text = " ".join(node.get_text(" ", strip=True).split()).lower()
            if node.name == "h2":
                in_study_line = line_keyword in text
                in_semester = False
            elif node.name == "p" and text.startswith("semestrul"):
                expected = "semestrul " + ("i" if semester == 1 else "ii")
                in_semester = text == expected
            elif node.name == "table" and in_study_line and in_semester:
                return _parse_calendar_table(node)

    raise ValueError(
        f"Cannot find academic calendar table for {study_line} semester {semester}"
    )


def _parse_date(date_str: str) -> date:
    """Parse 'DD.MM.YYYY' -> date."""
    parts = date_str.strip().split(".")
    return date(int(parts[2]), int(parts[1]), int(parts[0]))


def _extract_holiday_dates(notes: str) -> list[date]:
    """Extract individual holiday dates from parenthetical notes.

    Examples:
      "(vineri, 10.04.2026, Vinerea Mare - zi liberă)"
      "(vineri, 01.05.2026, Ziua Muncii și luni, 01.06.2026, ... - zile libere)"
    """
    holidays: list[date] = []
    # Find all dates in the notes
    for match in re.finditer(r"(\d{2}\.\d{2}\.\d{4})", notes):
        holidays.append(_parse_date(match.group(1)))
    return holidays


def _parse_calendar_table(table) -> AcademicCalendar:
    teaching_periods: list[TeachingPeriod] = []
    holidays: list[date] = []
    semester_start: date | None = None

    for row in table.find_all("tr"):
        cells = row.find_all("td")
        if len(cells) < 2:
            continue

        date_range_text = cells[0].get_text(strip=True)
        activity = " ".join(cells[1].get_text(" ", strip=True).split()).lower()
        notes = cells[2].get_text(strip=True) if len(cells) > 2 else ""

        # Parse date range
        date_match = re.search(
            r"(\d{2}\.\d{2}\.\d{4})\s*-\s*(\d{2}\.\d{2}\.\d{4})", date_range_text
        )
        if not date_match:
            continue

        start = _parse_date(date_match.group(1))
        end = _parse_date(date_match.group(2))

        if "activitate didactic" in activity:
            teaching_periods.append(TeachingPeriod(start=start, end=end))
            if semester_start is None:
                semester_start = start
            # Extract holidays from notes
            if notes:
                holidays.extend(_extract_holiday_dates(notes))

    if semester_start is None:
        raise ValueError("No teaching periods found in calendar table")

    return AcademicCalendar(
        teaching_periods=teaching_periods,
        holidays=holidays,
        semester_start=semester_start,
    )


def compute_teaching_weeks(
    calendar: AcademicCalendar,
) -> list[tuple[date, int]]:
    """Return (monday_of_week, week_number) for all teaching weeks.

    Week numbering is sequential across teaching periods — does NOT reset
    after vacation. Week 1 = first teaching week of the semester.
    """
    weeks: list[tuple[date, int]] = []
    week_num = 1

    for period in calendar.teaching_periods:
        # Find the Monday of the first week
        monday = period.start - timedelta(days=period.start.weekday())
        while monday <= period.end:
            # Only count this week if at least part of it falls in the period
            friday = monday + timedelta(days=4)
            if friday >= period.start and monday <= period.end:
                weeks.append((monday, week_num))
                week_num += 1
            monday += timedelta(weeks=1)

    return weeks


def get_dates_for_entry(
    entry: ScheduleEntry, calendar: AcademicCalendar
) -> list[date]:
    """Return all concrete dates a schedule entry occurs on."""
    day_offset = DAY_MAP.get(entry.day)
    if day_offset is None:
        return []

    weeks = compute_teaching_weeks(calendar)
    holidays_set = set(calendar.holidays)
    dates: list[date] = []

    for monday, week_num in weeks:
        # Check frequency
        if entry.frequency == Frequency.WEEK_1 and week_num % 2 == 0:
            continue
        if entry.frequency == Frequency.WEEK_2 and week_num % 2 == 1:
            continue

        event_date = monday + timedelta(days=day_offset)

        # Verify the date falls within a teaching period
        in_period = any(
            p.start <= event_date <= p.end for p in calendar.teaching_periods
        )
        if not in_period:
            continue

        if event_date in holidays_set:
            continue

        dates.append(event_date)

    return sorted(dates)
