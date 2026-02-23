from datetime import date
from pathlib import Path
from unittest.mock import patch, MagicMock

from bs4 import BeautifulSoup

from fmi_cal.academic import (
    fetch_academic_calendar,
    compute_teaching_weeks,
    get_dates_for_entry,
    get_study_line,
)
from fmi_cal.models import AcademicCalendar, Frequency, ScheduleEntry, EventType, TeachingPeriod

FIXTURES = Path(__file__).parent / "fixtures"


def _mock_requests_get(*args, **kwargs):
    """Mock requests.get to return the academic calendar fixture."""
    mock_resp = MagicMock()
    mock_resp.content = (FIXTURES / "academic_calendar.html").read_bytes()
    return mock_resp


class TestGetStudyLine:
    def test_romanian(self):
        assert get_study_line("IE2", "Informatica - in limba engleza") == "romanian"
        assert get_study_line("I1", "Informatica - linia de studiu romana") == "romanian"

    def test_hungarian_by_name(self):
        assert get_study_line("ADM1", "Analiza datelor - in limba maghiara") == "hungarian"

    def test_hungarian_by_prefix(self):
        assert get_study_line("IM1") == "hungarian"
        assert get_study_line("MM2") == "hungarian"

    def test_german(self):
        assert get_study_line("IG2", "Informatica - in limba germana") == "german"
        assert get_study_line("IG1") == "german"


class TestFetchAcademicCalendar:
    def test_romanian_sem2(self):
        with patch("fmi_cal.academic.requests.get", side_effect=_mock_requests_get):
            cal = fetch_academic_calendar("romanian", 2)

        assert cal.semester_start == date(2026, 2, 23)
        assert len(cal.teaching_periods) == 2
        assert cal.teaching_periods[0].start == date(2026, 2, 23)
        assert cal.teaching_periods[0].end == date(2026, 4, 12)
        assert cal.teaching_periods[1].start == date(2026, 4, 20)
        assert cal.teaching_periods[1].end == date(2026, 6, 7)

    def test_romanian_sem2_holidays(self):
        with patch("fmi_cal.academic.requests.get", side_effect=_mock_requests_get):
            cal = fetch_academic_calendar("romanian", 2)

        # Good Friday, May 1, Jun 1
        assert date(2026, 4, 10) in cal.holidays
        assert date(2026, 5, 1) in cal.holidays
        assert date(2026, 6, 1) in cal.holidays

    def test_hungarian_sem2(self):
        with patch("fmi_cal.academic.requests.get", side_effect=_mock_requests_get):
            cal = fetch_academic_calendar("hungarian", 2)

        assert cal.semester_start == date(2026, 2, 23)
        assert len(cal.teaching_periods) == 2
        # Hungarian: 6 weeks + 8 weeks
        assert cal.teaching_periods[0].end == date(2026, 4, 5)
        assert cal.teaching_periods[1].start == date(2026, 4, 13)


class TestComputeTeachingWeeks:
    def test_14_teaching_weeks(self):
        with patch("fmi_cal.academic.requests.get", side_effect=_mock_requests_get):
            cal = fetch_academic_calendar("romanian", 2)

        weeks = compute_teaching_weeks(cal)
        assert len(weeks) == 14

    def test_week_numbering_sequential(self):
        with patch("fmi_cal.academic.requests.get", side_effect=_mock_requests_get):
            cal = fetch_academic_calendar("romanian", 2)

        weeks = compute_teaching_weeks(cal)
        week_nums = [num for _, num in weeks]
        assert week_nums == list(range(1, 15))

    def test_no_week_during_easter(self):
        with patch("fmi_cal.academic.requests.get", side_effect=_mock_requests_get):
            cal = fetch_academic_calendar("romanian", 2)

        weeks = compute_teaching_weeks(cal)
        mondays = [monday for monday, _ in weeks]
        # Apr 13 is Easter Monday — no teaching week should start that day
        assert date(2026, 4, 13) not in mondays


class TestGetDatesForEntry:
    def _make_entry(self, day="Luni", start=14, end=16, freq=Frequency.EVERY_WEEK):
        return ScheduleEntry(
            day=day, start_hour=start, end_hour=end, frequency=freq,
            room="2/I", formation="IE2", event_type=EventType.CURS,
            subject="Test", professor="Prof",
        )

    def _get_cal(self):
        with patch("fmi_cal.academic.requests.get", side_effect=_mock_requests_get):
            return fetch_academic_calendar("romanian", 2)

    def test_every_week_monday(self):
        cal = self._get_cal()
        entry = self._make_entry("Luni", freq=Frequency.EVERY_WEEK)
        dates = get_dates_for_entry(entry, cal)

        # 14 weeks minus Jun 1 (holiday, Monday) = 13
        assert len(dates) == 13
        assert date(2026, 2, 23) in dates
        assert date(2026, 6, 1) not in dates  # Holiday

    def test_week1_only(self):
        cal = self._get_cal()
        entry = self._make_entry("Joi", freq=Frequency.WEEK_1)
        dates = get_dates_for_entry(entry, cal)

        # Odd weeks: 1,3,5,7,9,11,13 = 7 Thursdays
        assert len(dates) == 7

    def test_week2_only(self):
        cal = self._get_cal()
        entry = self._make_entry("Joi", freq=Frequency.WEEK_2)
        dates = get_dates_for_entry(entry, cal)

        # Even weeks: 2,4,6,8,10,12,14 = 7 Thursdays
        assert len(dates) == 7

    def test_no_events_during_easter(self):
        cal = self._get_cal()
        entry = self._make_entry("Luni", freq=Frequency.EVERY_WEEK)
        dates = get_dates_for_entry(entry, cal)

        # No dates between Apr 13 and Apr 19
        easter_dates = [d for d in dates if date(2026, 4, 13) <= d <= date(2026, 4, 19)]
        assert len(easter_dates) == 0

    def test_friday_good_friday_excluded(self):
        cal = self._get_cal()
        entry = self._make_entry("Vineri", freq=Frequency.EVERY_WEEK)
        dates = get_dates_for_entry(entry, cal)

        assert date(2026, 4, 10) not in dates  # Good Friday
        assert date(2026, 5, 1) not in dates   # Labor Day is also Friday
