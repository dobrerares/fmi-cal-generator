import json
from datetime import date
from unittest.mock import patch

from scripts.generate_index import generate_index
from fmi_cal.models import AcademicCalendar, TeachingPeriod


def test_page_uses_generated_schedule_semester(tmp_path):
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    (data_dir / "index.json").write_text(json.dumps({"semester": 1, "specs": []}))
    calendar = AcademicCalendar(
        teaching_periods=[TeachingPeriod(date(2026, 9, 28), date(2026, 12, 20))],
        holidays=[date(2026, 11, 30)],
        semester_start=date(2026, 9, 28),
    )
    with patch("scripts.generate_index.fetch_academic_calendar", return_value=calendar) as fetch:
        html = generate_index(tmp_path)
    fetch.assert_called_once_with(semester=1)
    assert '"monday": "2026-09-28"' in html
    assert 'window.__holidays=["2026-11-30"]' in html
