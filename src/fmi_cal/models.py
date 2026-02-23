from dataclasses import dataclass, field
from datetime import date
from enum import Enum


class EventType(Enum):
    CURS = "Curs"
    SEMINAR = "Seminar"
    LABORATOR = "Laborator"


class Frequency(Enum):
    EVERY_WEEK = "every"
    WEEK_1 = "sapt. 1"
    WEEK_2 = "sapt. 2"


@dataclass
class Specialization:
    name: str   # "Informatica - in limba engleza"
    code: str   # "IE2" (includes year)
    year: int   # 2
    href: str   # "IE2.html"


@dataclass
class ScheduleEntry:
    day: str               # "Luni", "Marti", etc.
    start_hour: int        # 12
    end_hour: int          # 14
    frequency: Frequency
    room: str              # "L338", "2/I", "neprecizat"
    formation: str         # "IE2", "921", "921/1"
    event_type: EventType
    subject: str           # "Programare Web"
    professor: str         # "Conf. STERCA Adrian"


@dataclass
class GroupSchedule:
    group: str                       # "921"
    entries: list[ScheduleEntry]


@dataclass
class TeachingPeriod:
    start: date
    end: date


@dataclass
class AcademicCalendar:
    teaching_periods: list[TeachingPeriod]
    holidays: list[date]
    semester_start: date


@dataclass
class UserPreferences:
    spec_code: str                              # "IE2"
    group: str                                  # "921"
    subgroup: str | None                        # "1" or None
    include_types: list[str] = field(default_factory=lambda: ["Curs", "Seminar", "Laborator"])
    excluded_subjects: list[str] = field(default_factory=list)
