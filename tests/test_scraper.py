from pathlib import Path
from unittest.mock import patch, MagicMock

from fmi_cal.scraper import fetch_specializations, fetch_group_schedules
from fmi_cal.models import EventType, Frequency

FIXTURES = Path(__file__).parent / "fixtures"


def _mock_fetch_html(fixture_name):
    """Create a mock that returns BeautifulSoup from a fixture file."""
    from bs4 import BeautifulSoup

    content = (FIXTURES / fixture_name).read_bytes()
    return BeautifulSoup(content, "html.parser", from_encoding="iso-8859-2")


class TestFetchSpecializations:
    def test_parses_all_specializations(self):
        with patch("fmi_cal.scraper._fetch_html", return_value=_mock_fetch_html("index.html")):
            specs = fetch_specializations("https://fake")

        assert len(specs) > 50
        names = {s.name for s in specs}
        assert "Informatica - in limba engleza" in names

    def test_ie2_exists(self):
        with patch("fmi_cal.scraper._fetch_html", return_value=_mock_fetch_html("index.html")):
            specs = fetch_specializations("https://fake")

        ie2 = [s for s in specs if s.code == "IE2"]
        assert len(ie2) == 1
        assert ie2[0].year == 2
        assert ie2[0].name == "Informatica - in limba engleza"


class TestFetchGroupSchedules:
    def test_parses_all_groups(self):
        with patch("fmi_cal.scraper._fetch_html", return_value=_mock_fetch_html("IE2.html")):
            schedules = fetch_group_schedules("https://fake", "IE2")

        assert len(schedules) == 7
        group_names = [s.group for s in schedules]
        assert "921" in group_names
        assert "923" in group_names

    def test_group_923_entry_count(self):
        with patch("fmi_cal.scraper._fetch_html", return_value=_mock_fetch_html("IE2.html")):
            schedules = fetch_group_schedules("https://fake", "IE2")

        g923 = next(s for s in schedules if s.group == "923")
        assert len(g923.entries) == 20

    def test_entry_fields(self):
        with patch("fmi_cal.scraper._fetch_html", return_value=_mock_fetch_html("IE2.html")):
            schedules = fetch_group_schedules("https://fake", "IE2")

        g923 = next(s for s in schedules if s.group == "923")

        # Find a known entry: IE2 Curs Programare Web Luni 16-18
        pw_course = [
            e for e in g923.entries
            if e.subject == "Programare Web" and e.event_type == EventType.CURS
        ]
        assert len(pw_course) == 1
        entry = pw_course[0]
        assert entry.day == "Luni"
        assert entry.start_hour == 16
        assert entry.end_hour == 18
        assert entry.frequency == Frequency.EVERY_WEEK
        assert entry.formation == "IE2"
        assert "STERCA" in entry.professor

    def test_frequency_parsing(self):
        with patch("fmi_cal.scraper._fetch_html", return_value=_mock_fetch_html("IE2.html")):
            schedules = fetch_group_schedules("https://fake", "IE2")

        g923 = next(s for s in schedules if s.group == "923")

        week1_entries = [e for e in g923.entries if e.frequency == Frequency.WEEK_1]
        week2_entries = [e for e in g923.entries if e.frequency == Frequency.WEEK_2]
        every_week = [e for e in g923.entries if e.frequency == Frequency.EVERY_WEEK]

        assert len(week1_entries) > 0
        assert len(week2_entries) > 0
        assert len(every_week) > 0
