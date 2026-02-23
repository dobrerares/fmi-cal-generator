import re
from datetime import date

import requests
from bs4 import BeautifulSoup

from .models import (
    EventType,
    Frequency,
    GroupSchedule,
    ScheduleEntry,
    Specialization,
)

SCHEDULE_ROOT = "https://www.cs.ubbcluj.ro/files/orar"

EVENT_TYPE_MAP = {
    "Curs": EventType.CURS,
    "Seminar": EventType.SEMINAR,
    "Laborator": EventType.LABORATOR,
}


def get_schedule_base_url(year: int | None = None, semester: int | None = None) -> str:
    """Auto-detect or accept overrides for the schedule URL.

    URL pattern: https://www.cs.ubbcluj.ro/files/orar/{YEAR}-{SEM}/tabelar
    YEAR = academic year start (e.g. 2025 for 2025-2026)
    SEM = 1 or 2
    """
    if year is None or semester is None:
        today = date.today()
        if semester is None:
            # Sep-Jan = semester 1, Feb-Aug = semester 2
            semester = 1 if today.month >= 9 or today.month == 1 else 2
        if year is None:
            # Academic year starts in September
            if today.month >= 9:
                year = today.year
            else:
                year = today.year - 1

    base = f"{SCHEDULE_ROOT}/{year}-{semester}/tabelar"

    # Validate the URL exists
    try:
        resp = requests.head(f"{base}/index.html", timeout=10, allow_redirects=True)
        if resp.status_code == 200:
            return base
    except requests.RequestException:
        pass

    # Fall back to the redirect target at /files/orar/
    try:
        resp = requests.get(f"{SCHEDULE_ROOT}/", timeout=10, allow_redirects=False)
        if resp.status_code == 200:
            # Page contains a meta refresh or link like "2025-1"
            soup = BeautifulSoup(resp.content, "html.parser")
            text = soup.get_text()
            match = re.search(r"(\d{4}-[12])", text)
            if match:
                return f"{SCHEDULE_ROOT}/{match.group(1)}/tabelar"
    except requests.RequestException:
        pass

    return base


def _fetch_html(url: str) -> BeautifulSoup:
    resp = requests.get(url, timeout=15)
    return BeautifulSoup(resp.content, "html.parser", from_encoding="iso-8859-2")


def fetch_specializations(base_url: str) -> list[Specialization]:
    """Parse the index.html page to get all available specializations."""
    soup = _fetch_html(f"{base_url}/index.html")
    specs: list[Specialization] = []

    for table in soup.find_all("table"):
        rows = table.find_all("tr")
        for row in rows:
            cells = row.find_all("td")
            if not cells:
                continue
            name = cells[0].get_text(strip=True)
            for cell in cells[1:]:
                link = cell.find("a")
                if not link:
                    continue
                href = link.get("href", "")
                link_text = link.get_text(strip=True)  # "Anul 1", "Anul 2", etc.
                # Extract year from link text
                year_match = re.search(r"(\d+)", link_text)
                if not year_match:
                    continue
                year = int(year_match.group(1))
                code = href.replace(".html", "")
                specs.append(Specialization(
                    name=name,
                    code=code,
                    year=year,
                    href=href,
                ))
    return specs


def fetch_group_schedules(base_url: str, spec_code: str) -> list[GroupSchedule]:
    """Parse a schedule page (e.g. IE2.html) and return one GroupSchedule per group."""
    soup = _fetch_html(f"{base_url}/{spec_code}.html")

    # Find all <h1> tags matching "Grupa NNN"
    group_headers = []
    for h1 in soup.find_all("h1"):
        text = h1.get_text(strip=True)
        match = re.search(r"Grupa\s+(\S+)", text)
        if match:
            group_headers.append((match.group(1), h1))

    schedules: list[GroupSchedule] = []

    for group_name, h1_tag in group_headers:
        # The table follows the h1 tag
        table = h1_tag.find_next("table")
        if not table:
            continue
        entries = _parse_schedule_table(table)
        schedules.append(GroupSchedule(group=group_name, entries=entries))

    return schedules


def _parse_schedule_table(table) -> list[ScheduleEntry]:
    entries: list[ScheduleEntry] = []
    rows = table.find_all("tr")

    for row in rows:
        cells = row.find_all("td")
        if len(cells) < 8:
            continue

        day = cells[0].get_text(strip=True)
        hours_text = cells[1].get_text(strip=True)
        freq_text = cells[2].get_text(strip=True)
        room = cells[3].get_text(strip=True)
        formation = cells[4].get_text(strip=True)
        type_text = cells[5].get_text(strip=True)
        subject = cells[6].get_text(strip=True)
        professor = cells[7].get_text(strip=True)

        # Parse hours: "12-14" -> (12, 14)
        hour_match = re.match(r"(\d+)-(\d+)", hours_text)
        if not hour_match:
            continue
        start_hour = int(hour_match.group(1))
        end_hour = int(hour_match.group(2))

        # Parse frequency
        if "sapt. 1" in freq_text:
            frequency = Frequency.WEEK_1
        elif "sapt. 2" in freq_text:
            frequency = Frequency.WEEK_2
        else:
            frequency = Frequency.EVERY_WEEK

        # Parse event type
        event_type = EVENT_TYPE_MAP.get(type_text)
        if event_type is None:
            continue

        entries.append(ScheduleEntry(
            day=day,
            start_hour=start_hour,
            end_hour=end_hour,
            frequency=frequency,
            room=room,
            formation=formation,
            event_type=event_type,
            subject=subject,
            professor=professor,
        ))

    return entries
