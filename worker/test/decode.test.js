// worker/test/decode.test.js
import { describe, it, expect } from 'vitest';
import { decodeCalParams } from '../src/decode.js';

describe('decodeCalParams', () => {
  function encode(obj) {
    return btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
  }

  it('decodes single calendar payload', () => {
    const input = { s: 'M1', g: 0, sg: '1', f: 'all' };
    const result = decodeCalParams(encode(input));
    expect(result).toEqual({
      calendars: [{ yearCode: 'M1', groupIndex: 0, subgroup: '1', uncheckedTypes: [], excluded: [], labOverrides: {} }],
      freq: 'all',
    });
  });

  it('decodes multi-calendar payload', () => {
    const input = {
      cals: [
        { s: 'M1', g: 0, sg: '1' },
        { s: 'IE2', g: 1, sg: 'all', ut: ['Curs'], ex: ['Algebra|||Seminar'], lo: { BPOO: '2' } },
      ],
      f: 'sapt. 1',
    };
    const result = decodeCalParams(encode(input));
    expect(result.calendars).toHaveLength(2);
    expect(result.calendars[1]).toEqual({
      yearCode: 'IE2', groupIndex: 1, subgroup: 'all',
      uncheckedTypes: ['Curs'], excluded: ['Algebra|||Seminar'],
      labOverrides: { BPOO: '2' },
    });
    expect(result.freq).toBe('sapt. 1');
  });

  it('defaults missing optional fields', () => {
    const input = { s: 'M1', g: 0 };
    const result = decodeCalParams(encode(input));
    expect(result.calendars[0].subgroup).toBe('all');
    expect(result.calendars[0].uncheckedTypes).toEqual([]);
    expect(result.calendars[0].excluded).toEqual([]);
    expect(result.calendars[0].labOverrides).toEqual({});
    expect(result.freq).toBe('all');
  });

  it('throws on invalid base64', () => {
    expect(() => decodeCalParams('not-valid-!!!')).toThrow();
  });

  it('throws on missing spec code', () => {
    const input = { g: 0 };
    expect(() => decodeCalParams(encode(input))).toThrow();
  });
});
