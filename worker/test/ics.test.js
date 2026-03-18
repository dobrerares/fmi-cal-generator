// worker/test/ics.test.js
import { describe, it, expect } from 'vitest';
import { generateICS } from '../src/ics.js';

describe('generateICS', () => {
  it('returns valid calendar with events', () => {
    const entries = [
      {
        type: 'Curs', subject: 'Algebra', startHour: 8, endHour: 10,
        room: 'C510', professor: 'Prof A',
        dates: ['2026-02-23', '2026-03-02'],
      },
    ];
    const ics = generateICS(entries, {});
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('END:VCALENDAR');
    expect(ics).toContain('CALSCALE:GREGORIAN');
    expect(ics).toContain('SUMMARY:[C] Algebra');
    expect(ics).toContain('UID:20260223T08-Algebra-Curs@fmi-cal');
    expect(ics).toContain('DTSTART;TZID=Europe/Bucharest:20260223T080000');
    expect(ics).toContain('DTEND;TZID=Europe/Bucharest:20260223T100000');
    expect(ics).toContain('LOCATION:C510');
    expect(ics).toContain('DESCRIPTION:Prof A');
    expect(ics).toContain('SEQUENCE:0');
    // Two dates = two VEVENTs
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
  });

  it('includes VTIMEZONE for Europe/Bucharest', () => {
    const ics = generateICS([], {});
    expect(ics).toContain('BEGIN:VTIMEZONE');
    expect(ics).toContain('TZID:Europe/Bucharest');
    expect(ics).toContain('TZOFFSETFROM:+0300');
    expect(ics).toContain('TZOFFSETTO:+0200');
    expect(ics).toContain('TZNAME:EET');
    expect(ics).toContain('TZNAME:EEST');
    expect(ics).toContain('RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=10');
    expect(ics).toContain('RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=3');
    expect(ics).toContain('END:VTIMEZONE');
  });

  it('enriches room with legend', () => {
    const entries = [
      { type: 'Seminar', subject: 'X', startHour: 10, endHour: 12, room: 'C510', professor: '', dates: ['2026-02-23'] },
    ];
    const rooms = { C510: 'FSEGA, etaj 5' };
    const ics = generateICS(entries, rooms);
    expect(ics).toContain('LOCATION:C510\\, FSEGA\\, etaj 5');
  });

  it('returns valid empty calendar when no entries', () => {
    const ics = generateICS([], {});
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('END:VCALENDAR');
    expect(ics).toContain('BEGIN:VTIMEZONE');
    expect(ics).not.toContain('BEGIN:VEVENT');
  });

  it('escapes special characters in summary', () => {
    const entries = [
      { type: 'Curs', subject: 'A; B, C', startHour: 8, endHour: 10, room: '', professor: '', dates: ['2026-02-23'] },
    ];
    const ics = generateICS(entries, {});
    expect(ics).toContain('SUMMARY:[C] A\\; B\\, C');
  });

  it('ends with trailing CRLF', () => {
    const ics = generateICS([], {});
    expect(ics).toMatch(/END:VCALENDAR\r\n$/);
  });

  it('folds long lines at UTF-8 byte boundaries', () => {
    // Romanian chars (ș, ț, ă) are 2 bytes each in UTF-8
    const longSubject = 'Programare în limbajul șșșșșșșșșșșșșșșșșșșșșșșșșșșșșșșșșșș';
    const entries = [
      { type: 'Curs', subject: longSubject, startHour: 8, endHour: 10, room: '', professor: '', dates: ['2026-02-23'] },
    ];
    const ics = generateICS(entries, {});
    // Each content line (excluding CRLF) must be <= 75 bytes
    const lines = ics.split('\r\n');
    const encoder = new TextEncoder();
    for (const line of lines) {
      expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
    }
  });
});
