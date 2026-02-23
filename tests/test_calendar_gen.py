from datetime import date

from fmi_cal.calendar_gen import filter_entries_for_student, apply_user_filters, generate_ics
from fmi_cal.models import (
    AcademicCalendar,
    EventType,
    Frequency,
    GroupSchedule,
    ScheduleEntry,
    TeachingPeriod,
)


def _make_entry(**kwargs):
    defaults = dict(
        day="Luni", start_hour=14, end_hour=16, frequency=Frequency.EVERY_WEEK,
        room="2/I", formation="IE2", event_type=EventType.CURS,
        subject="Test Subject", professor="Prof. Test",
    )
    defaults.update(kwargs)
    return ScheduleEntry(**defaults)


def _make_group_schedule():
    """Create a realistic group schedule for group 923."""
    return GroupSchedule(group="923", entries=[
        _make_entry(formation="IE2", event_type=EventType.CURS, subject="Course A"),
        _make_entry(formation="923", event_type=EventType.SEMINAR, subject="Seminar A"),
        _make_entry(formation="923/1", event_type=EventType.LABORATOR, subject="Lab A"),
        _make_entry(formation="923/2", event_type=EventType.LABORATOR, subject="Lab B"),
        _make_entry(formation="922", event_type=EventType.SEMINAR, subject="Other Group"),
    ])


def _make_calendar():
    return AcademicCalendar(
        teaching_periods=[
            TeachingPeriod(start=date(2026, 2, 23), end=date(2026, 4, 12)),
            TeachingPeriod(start=date(2026, 4, 20), end=date(2026, 6, 7)),
        ],
        holidays=[date(2026, 4, 10), date(2026, 5, 1), date(2026, 6, 1)],
        semester_start=date(2026, 2, 23),
    )


class TestFilterEntriesForStudent:
    def test_includes_year_wide(self):
        gs = _make_group_schedule()
        entries = filter_entries_for_student(gs, "923", "1")
        subjects = [e.subject for e in entries]
        assert "Course A" in subjects  # IE2 entry

    def test_includes_own_group(self):
        gs = _make_group_schedule()
        entries = filter_entries_for_student(gs, "923", "1")
        subjects = [e.subject for e in entries]
        assert "Seminar A" in subjects  # 923 entry

    def test_includes_own_subgroup(self):
        gs = _make_group_schedule()
        entries = filter_entries_for_student(gs, "923", "1")
        subjects = [e.subject for e in entries]
        assert "Lab A" in subjects  # 923/1 entry

    def test_excludes_other_subgroup(self):
        gs = _make_group_schedule()
        entries = filter_entries_for_student(gs, "923", "1")
        subjects = [e.subject for e in entries]
        assert "Lab B" not in subjects  # 923/2 entry

    def test_excludes_other_group(self):
        gs = _make_group_schedule()
        entries = filter_entries_for_student(gs, "923", "1")
        subjects = [e.subject for e in entries]
        assert "Other Group" not in subjects  # 922 entry

    def test_no_subgroup_includes_both(self):
        gs = _make_group_schedule()
        entries = filter_entries_for_student(gs, "923", None)
        subjects = [e.subject for e in entries]
        assert "Lab A" in subjects
        assert "Lab B" in subjects


class TestApplyUserFilters:
    def test_filter_by_type(self):
        entries = [
            _make_entry(event_type=EventType.CURS, subject="A"),
            _make_entry(event_type=EventType.SEMINAR, subject="B"),
            _make_entry(event_type=EventType.LABORATOR, subject="C"),
        ]
        result = apply_user_filters(entries, [EventType.CURS, EventType.LABORATOR], [])
        subjects = [e.subject for e in result]
        assert "A" in subjects
        assert "B" not in subjects
        assert "C" in subjects

    def test_exclude_subjects(self):
        entries = [
            _make_entry(subject="Keep"),
            _make_entry(subject="Remove"),
        ]
        result = apply_user_filters(entries, [EventType.CURS], ["Remove"])
        assert len(result) == 1
        assert result[0].subject == "Keep"


class TestGenerateIcs:
    def test_generates_valid_ics(self):
        entries = [_make_entry(frequency=Frequency.EVERY_WEEK)]
        cal = _make_calendar()
        ics_bytes = generate_ics(entries, cal)

        ics_text = ics_bytes.decode("utf-8")
        assert "BEGIN:VCALENDAR" in ics_text
        assert "BEGIN:VEVENT" in ics_text
        assert "END:VCALENDAR" in ics_text

    def test_event_count_every_week(self):
        entries = [_make_entry(day="Luni", frequency=Frequency.EVERY_WEEK)]
        cal = _make_calendar()
        ics_bytes = generate_ics(entries, cal)

        ics_text = ics_bytes.decode("utf-8")
        # 14 weeks, Jun 1 is holiday (Monday) = 13 events
        assert ics_text.count("BEGIN:VEVENT") == 13

    def test_event_summary_prefix(self):
        entries = [_make_entry(event_type=EventType.CURS, subject="Programare Web")]
        cal = _make_calendar()
        ics_bytes = generate_ics(entries, cal)

        ics_text = ics_bytes.decode("utf-8")
        assert "[C] Programare Web" in ics_text

    def test_event_location_and_description(self):
        entries = [_make_entry(room="L338", professor="Prof. Smith")]
        cal = _make_calendar()
        ics_bytes = generate_ics(entries, cal)

        ics_text = ics_bytes.decode("utf-8")
        assert "LOCATION:L338" in ics_text
        assert "Prof. Smith" in ics_text
