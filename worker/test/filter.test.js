// worker/test/filter.test.js
import { describe, it, expect } from 'vitest';
import { filterGroupEntries, deduplicateEntries, filterByFrequency } from '../src/filter.js';

const ENTRIES = [
  { day: 'Luni', startHour: 8, endHour: 10, frequency: 'every', type: 'Curs', formation: 'M1', subject: 'Algebra', room: 'C510', professor: 'Prof A', dates: ['2026-02-23'] },
  { day: 'Luni', startHour: 10, endHour: 12, frequency: 'sapt. 1', type: 'Seminar', formation: '111', subject: 'Algebra', room: 'L001', professor: 'Prof B', dates: ['2026-02-23'] },
  { day: 'Marti', startHour: 8, endHour: 10, frequency: 'every', type: 'Laborator', formation: '111/1', subject: 'BPOO', room: 'L001', professor: 'Prof C', dates: ['2026-02-24'] },
  { day: 'Marti', startHour: 8, endHour: 10, frequency: 'every', type: 'Laborator', formation: '111/2', subject: 'BPOO', room: 'L002', professor: 'Prof D', dates: ['2026-02-24'] },
  { day: 'Miercuri', startHour: 14, endHour: 16, frequency: 'sapt. 2', type: 'Laborator', formation: '222/1', subject: 'Other', room: 'L003', professor: 'Prof E', dates: ['2026-02-25'] },
];

describe('filterGroupEntries', () => {
  it('includes courses (non-numeric formation) for any group', () => {
    const result = filterGroupEntries(ENTRIES, '111', {
      subgroup: 'all', uncheckedTypes: [], excluded: [], labOverrides: {},
    });
    expect(result.some(e => e.subject === 'Algebra' && e.type === 'Curs')).toBe(true);
  });

  it('includes matching group entries', () => {
    const result = filterGroupEntries(ENTRIES, '111', {
      subgroup: 'all', uncheckedTypes: [], excluded: [], labOverrides: {},
    });
    expect(result.some(e => e.subject === 'Algebra' && e.type === 'Seminar')).toBe(true);
  });

  it('excludes other group subgroup entries', () => {
    const result = filterGroupEntries(ENTRIES, '111', {
      subgroup: 'all', uncheckedTypes: [], excluded: [], labOverrides: {},
    });
    expect(result.some(e => e.subject === 'Other')).toBe(false);
  });

  it('filters by subgroup', () => {
    const result = filterGroupEntries(ENTRIES, '111', {
      subgroup: '1', uncheckedTypes: [], excluded: [], labOverrides: {},
    });
    expect(result.some(e => e.formation === '111/1')).toBe(true);
    expect(result.some(e => e.formation === '111/2')).toBe(false);
  });

  it('respects lab subgroup overrides', () => {
    const result = filterGroupEntries(ENTRIES, '111', {
      subgroup: 'all', uncheckedTypes: [], excluded: [], labOverrides: { BPOO: '2' },
    });
    expect(result.some(e => e.formation === '111/1')).toBe(false);
    expect(result.some(e => e.formation === '111/2')).toBe(true);
  });

  it('filters out unchecked types', () => {
    const result = filterGroupEntries(ENTRIES, '111', {
      subgroup: 'all', uncheckedTypes: ['Laborator'], excluded: [], labOverrides: {},
    });
    expect(result.some(e => e.type === 'Laborator')).toBe(false);
    expect(result.some(e => e.type === 'Curs')).toBe(true);
  });

  it('filters out excluded subject+type combos', () => {
    const result = filterGroupEntries(ENTRIES, '111', {
      subgroup: 'all', uncheckedTypes: [], excluded: ['Algebra|||Seminar'], labOverrides: {},
    });
    expect(result.some(e => e.subject === 'Algebra' && e.type === 'Seminar')).toBe(false);
    expect(result.some(e => e.subject === 'Algebra' && e.type === 'Curs')).toBe(true);
  });
});

describe('deduplicateEntries', () => {
  it('removes duplicate entries with same key', () => {
    const dupes = [
      { day: 'Luni', startHour: 8, endHour: 10, subject: 'X', type: 'Curs', formation: 'M1', room: 'C1' },
      { day: 'Luni', startHour: 8, endHour: 10, subject: 'X', type: 'Curs', formation: 'M1', room: 'C1' },
    ];
    expect(deduplicateEntries(dupes)).toHaveLength(1);
  });

  it('keeps entries with different keys', () => {
    const entries = [
      { day: 'Luni', startHour: 8, endHour: 10, subject: 'X', type: 'Curs', formation: 'M1', room: 'C1' },
      { day: 'Luni', startHour: 10, endHour: 12, subject: 'Y', type: 'Seminar', formation: '111', room: 'C2' },
    ];
    expect(deduplicateEntries(entries)).toHaveLength(2);
  });
});

describe('filterByFrequency', () => {
  it('returns all entries when freq is all', () => {
    expect(filterByFrequency(ENTRIES, 'all')).toHaveLength(ENTRIES.length);
  });

  it('keeps "every" entries plus matching frequency', () => {
    const result = filterByFrequency(ENTRIES, 'sapt. 1');
    expect(result.every(e => e.frequency === 'every' || e.frequency === 'sapt. 1')).toBe(true);
    expect(result.some(e => e.frequency === 'sapt. 2')).toBe(false);
  });
});
