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
    expect(ics).toContain('SUMMARY:[C] Algebra');
    expect(ics).toContain('DTSTART;TZID=Europe/Bucharest:20260223T080000');
    expect(ics).toContain('DTEND;TZID=Europe/Bucharest:20260223T100000');
    expect(ics).toContain('LOCATION:C510');
    expect(ics).toContain('DESCRIPTION:Prof A');
    // Two dates = two VEVENTs
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
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
    expect(ics).not.toContain('BEGIN:VEVENT');
  });

  it('escapes special characters in summary', () => {
    const entries = [
      { type: 'Curs', subject: 'A; B, C', startHour: 8, endHour: 10, room: '', professor: '', dates: ['2026-02-23'] },
    ];
    const ics = generateICS(entries, {});
    expect(ics).toContain('SUMMARY:[C] A\\; B\\, C');
  });
});
