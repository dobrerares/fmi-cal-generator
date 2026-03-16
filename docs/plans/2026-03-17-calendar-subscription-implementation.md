# Calendar Subscription Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** A Cloudflare Worker at `cal.rdobre.ro` that serves dynamic `.ics` files from the same `?c=` base64 params the frontend generates, plus a "Subscribe" button in the UI.

**Architecture:** The Worker decodes the `?c=` param, fetches schedule JSON from `orar-fmi.rdobre.ro/data/`, applies the same filtering logic as the client-side JS, and returns `text/calendar`. The frontend adds a subscribe button that builds a `webcal://` URL using the existing state encoding.

**Tech Stack:** Cloudflare Workers (JS), Wrangler CLI, existing Jinja2 templates

---

### Task 1: Scaffold the Cloudflare Worker project

**Files:**
- Create: `worker/wrangler.toml`
- Create: `worker/src/index.js`
- Create: `worker/package.json`

**Step 1: Create worker directory and package.json**

```bash
mkdir -p worker/src
```

```json
// worker/package.json
{
  "name": "fmi-cal-worker",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy"
  },
  "devDependencies": {
    "wrangler": "^4"
  }
}
```

**Step 2: Create wrangler.toml**

```toml
# worker/wrangler.toml
name = "fmi-cal-worker"
main = "src/index.js"
compatibility_date = "2024-12-01"
```

**Step 3: Create minimal index.js that returns hello world**

```js
// worker/src/index.js
export default {
  async fetch(request) {
    return new Response('fmi-cal-worker is running', {
      headers: { 'Content-Type': 'text/plain' },
    });
  },
};
```

**Step 4: Install dependencies and verify**

```bash
cd worker && npm install && npx wrangler dev --local
# In another terminal: curl http://localhost:8787
# Expected: "fmi-cal-worker is running"
```

**Step 5: Commit**

```bash
git add worker/
git commit -m "feat(worker): scaffold Cloudflare Worker project"
```

---

### Task 2: Implement base64 param decoding

**Files:**
- Modify: `worker/src/index.js`
- Create: `worker/src/decode.js`
- Create: `worker/test/decode.test.js`

**Step 1: Write the failing test**

```js
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
```

**Step 2: Add vitest to dev dependencies and run test to verify it fails**

Add to `worker/package.json` devDependencies: `"vitest": "^3"`

```bash
cd worker && npm install && npx vitest run test/decode.test.js
```

Expected: FAIL — module `../src/decode.js` not found

**Step 3: Write minimal implementation**

```js
// worker/src/decode.js

/**
 * Decode a base64-encoded ?c= param into structured calendar params.
 * Mirrors the frontend's decodeCalState / decodeStateFromURL logic.
 */
export function decodeCalParams(b64) {
  const json = decodeURIComponent(escape(atob(b64)));
  const payload = JSON.parse(json);

  let rawCals;
  let freq = 'all';

  if (payload.cals) {
    // Multi-calendar format: { cals: [...], f?: string }
    rawCals = payload.cals;
    if (payload.f) freq = payload.f;
  } else {
    // Single calendar format (flat object, optionally with f)
    if (payload.f) freq = payload.f;
    rawCals = [payload];
  }

  const calendars = rawCals.map((c) => {
    if (!c.s) throw new Error('Missing spec code (s)');
    return {
      yearCode: c.s,
      groupIndex: c.g !== undefined ? Number(c.g) : 0,
      subgroup: c.sg || 'all',
      uncheckedTypes: c.ut || [],
      excluded: c.ex || [],
      labOverrides: c.lo || {},
    };
  });

  return { calendars, freq };
}
```

**Step 4: Run test to verify it passes**

```bash
cd worker && npx vitest run test/decode.test.js
```

Expected: all 5 tests PASS

**Step 5: Commit**

```bash
git add worker/src/decode.js worker/test/decode.test.js worker/package.json
git commit -m "feat(worker): add base64 param decoder with tests"
```

---

### Task 3: Implement filtering logic

**Files:**
- Create: `worker/src/filter.js`
- Create: `worker/test/filter.test.js`

**Step 1: Write the failing test**

```js
// worker/test/filter.test.js
import { describe, it, expect } from 'vitest';
import { filterGroupEntries, deduplicateEntries } from '../src/filter.js';

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
```

**Step 2: Run test to verify it fails**

```bash
cd worker && npx vitest run test/filter.test.js
```

Expected: FAIL — module `../src/filter.js` not found

**Step 3: Write implementation**

Port the client-side `filterEntries`, `deduplicateEntries`, and `filterByFrequency` logic:

```js
// worker/src/filter.js

/**
 * Filter a group's entries based on calendar params.
 * Direct port of frontend filterEntries() from app.js:1019-1042
 *
 * @param {Array} entries - group.entries from the JSON data
 * @param {string} groupName - e.g. "111"
 * @param {Object} params - { subgroup, uncheckedTypes, excluded, labOverrides }
 * @returns {Array} filtered entries
 */
export function filterGroupEntries(entries, groupName, params) {
  const { subgroup, uncheckedTypes, excluded, labOverrides } = params;
  const typesSet = new Set(['Curs', 'Seminar', 'Laborator']);
  for (const t of uncheckedTypes) typesSet.delete(t);
  const excludedSet = new Set(excluded);

  return entries.filter((e) => {
    if (!typesSet.has(e.type)) return false;
    if (excludedSet.has(e.subject + '|||' + e.type)) return false;

    const f = e.formation;
    // Non-numeric formation (e.g. "M1") → always include
    if (!/^\d/.test(f)) return true;
    // Exact group match
    if (f === groupName) return true;
    // Subgroup handling
    if (f.includes('/') && !groupName.includes('/')) {
      const parts = f.split('/');
      if (parts[0] !== groupName) return false;
      const effectiveSub =
        subgroup === 'all' && labOverrides[e.subject]
          ? labOverrides[e.subject]
          : subgroup;
      if (effectiveSub && effectiveSub !== 'all' && parts[1] !== effectiveSub)
        return false;
      return true;
    }
    return false;
  });
}

/**
 * Remove duplicate entries (same day+time+subject+type+formation+room).
 * Port of frontend deduplicateEntries() from app.js:1056-1073
 */
export function deduplicateEntries(entries) {
  const seen = {};
  const result = [];
  for (const e of entries) {
    const key = `${e.day}-${e.startHour}-${e.endHour}-${e.subject}-${e.type}-${e.formation}-${e.room}`;
    if (!seen[key]) {
      seen[key] = true;
      result.push(e);
    }
  }
  return result;
}

/**
 * Filter entries by frequency.
 * Port of frontend filterByFrequency() from app.js:1089-1092
 */
export function filterByFrequency(entries, freq) {
  if (freq === 'all') return entries;
  return entries.filter((e) => e.frequency === 'every' || e.frequency === freq);
}
```

**Step 4: Run tests to verify they pass**

```bash
cd worker && npx vitest run test/filter.test.js
```

Expected: all tests PASS

**Step 5: Commit**

```bash
git add worker/src/filter.js worker/test/filter.test.js
git commit -m "feat(worker): add entry filtering logic with tests"
```

---

### Task 4: Implement ICS generation

**Files:**
- Create: `worker/src/ics.js`
- Create: `worker/test/ics.test.js`

**Step 1: Write the failing test**

```js
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
```

**Step 2: Run test to verify it fails**

```bash
cd worker && npx vitest run test/ics.test.js
```

Expected: FAIL — module not found

**Step 3: Write implementation**

```js
// worker/src/ics.js

/**
 * Escape a string for ICS format.
 * Port of frontend icsEscape() from app.js:1967-1968
 */
function icsEscape(s) {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/**
 * Generate an ICS calendar string from filtered entries.
 * Port of frontend generateICS() from app.js:1971-2002
 *
 * @param {Array} entries - filtered schedule entries
 * @param {Object} rooms - room code → full location string
 * @returns {string} ICS calendar content
 */
export function generateICS(entries, rooms) {
  const PREFIX = { Curs: '[C]', Seminar: '[S]', Laborator: '[L]' };
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//FMI Cal Generator//UBB Cluj//RO',
    'X-WR-CALNAME:FMI Schedule',
    'X-WR-TIMEZONE:Europe/Bucharest',
  ];

  for (const e of entries) {
    const pfx = PREFIX[e.type] || '';
    for (const ds of e.dates) {
      const d = ds.replace(/-/g, '');
      const sh = String(e.startHour).padStart(2, '0');
      const eh = String(e.endHour).padStart(2, '0');
      lines.push('BEGIN:VEVENT');
      lines.push(`DTSTART;TZID=Europe/Bucharest:${d}T${sh}0000`);
      lines.push(`DTEND;TZID=Europe/Bucharest:${d}T${eh}0000`);
      lines.push(`SUMMARY:${icsEscape(pfx + ' ' + e.subject)}`);
      if (e.room) {
        const loc = rooms[e.room]
          ? `${e.room}, ${rooms[e.room]}`
          : e.room;
        lines.push(`LOCATION:${icsEscape(loc)}`);
      }
      if (e.professor) lines.push(`DESCRIPTION:${icsEscape(e.professor)}`);
      lines.push('END:VEVENT');
    }
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
```

**Step 4: Run tests**

```bash
cd worker && npx vitest run test/ics.test.js
```

Expected: all tests PASS

**Step 5: Commit**

```bash
git add worker/src/ics.js worker/test/ics.test.js
git commit -m "feat(worker): add ICS generation with tests"
```

---

### Task 5: Wire up the Worker handler

**Files:**
- Modify: `worker/src/index.js`
- Create: `worker/test/index.test.js`

This task wires together decode → fetch → filter → ICS into the Worker's fetch handler.

**Step 1: Write the failing test**

```js
// worker/test/index.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from '../src/index.js';

// Mock fetch for origin requests
function mockFetch(responses) {
  return vi.fn((url) => {
    const body = responses[url];
    if (!body) return Promise.resolve(new Response('Not found', { status: 404 }));
    return Promise.resolve(new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
  });
}

function encode(obj) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
}

const ORIGIN = 'https://orar-fmi.rdobre.ro';

const MOCK_DATA = {
  [`${ORIGIN}/data/M1.json`]: {
    code: 'M1', name: 'Matematica', year: 1,
    groups: [{
      name: '111', hasSubgroups: true,
      entries: [
        { day: 'Luni', startHour: 8, endHour: 10, frequency: 'every', type: 'Curs', formation: 'M1', subject: 'Algebra', room: 'C510', professor: 'Prof A', dates: ['2026-02-23'] },
        { day: 'Marti', startHour: 10, endHour: 12, frequency: 'every', type: 'Laborator', formation: '111/1', subject: 'BPOO', room: 'L001', professor: 'Prof B', dates: ['2026-02-24'] },
        { day: 'Marti', startHour: 10, endHour: 12, frequency: 'every', type: 'Laborator', formation: '111/2', subject: 'BPOO', room: 'L002', professor: 'Prof C', dates: ['2026-02-24'] },
      ],
    }],
  },
  [`${ORIGIN}/data/rooms.json`]: { C510: 'FSEGA, etaj 5', L001: 'FSEGA, demisol' },
};

describe('Worker fetch handler', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch(MOCK_DATA);
  });

  it('returns 400 when ?c= param is missing', async () => {
    const req = new Request('https://cal.rdobre.ro/ics');
    const res = await worker.fetch(req);
    expect(res.status).toBe(400);
  });

  it('returns valid ICS for a single calendar', async () => {
    const c = encode({ s: 'M1', g: 0, sg: '1' });
    const req = new Request(`https://cal.rdobre.ro/ics?c=${c}`);
    const res = await worker.fetch(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/calendar; charset=utf-8');
    const body = await res.text();
    expect(body).toContain('BEGIN:VCALENDAR');
    expect(body).toContain('Algebra');
    // Subgroup 1 selected, so 111/2 entry excluded
    expect(body).toContain('L001');
    expect(body).not.toContain('L002');
  });

  it('returns 502 when origin fetch fails', async () => {
    globalThis.fetch = mockFetch({});
    const c = encode({ s: 'INVALID', g: 0 });
    const req = new Request(`https://cal.rdobre.ro/ics?c=${c}`);
    const res = await worker.fetch(req);
    expect(res.status).toBe(502);
  });

  it('returns 400 for out-of-bounds group index', async () => {
    const c = encode({ s: 'M1', g: 99 });
    const req = new Request(`https://cal.rdobre.ro/ics?c=${c}`);
    const res = await worker.fetch(req);
    expect(res.status).toBe(400);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd worker && npx vitest run test/index.test.js
```

Expected: FAIL — handler returns "fmi-cal-worker is running" instead of 400

**Step 3: Write implementation**

```js
// worker/src/index.js
import { decodeCalParams } from './decode.js';
import { filterGroupEntries, filterByFrequency, deduplicateEntries } from './filter.js';
import { generateICS } from './ics.js';

const ORIGIN = 'https://orar-fmi.rdobre.ro';

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Only handle /ics path
    if (url.pathname !== '/ics') {
      return new Response('Not found', { status: 404 });
    }

    // Decode ?c= param
    const c = url.searchParams.get('c');
    if (!c) {
      return new Response('Missing ?c= parameter', { status: 400 });
    }

    let params;
    try {
      params = decodeCalParams(c);
    } catch (e) {
      return new Response(`Invalid ?c= parameter: ${e.message}`, { status: 400 });
    }

    try {
      // Fetch rooms.json (non-critical — default to empty on failure)
      const rooms = (await fetchJSON(`${ORIGIN}/data/rooms.json`)) || {};

      // Process each calendar
      let allEntries = [];

      for (const cal of params.calendars) {
        // Fetch spec data
        const specData = await fetchJSON(`${ORIGIN}/data/${cal.yearCode}.json`);
        if (!specData) {
          return new Response(`Failed to fetch schedule data for ${cal.yearCode}`, { status: 502 });
        }

        // Validate group index
        if (cal.groupIndex < 0 || cal.groupIndex >= specData.groups.length) {
          return new Response(
            `Group index ${cal.groupIndex} out of bounds (${specData.groups.length} groups)`,
            { status: 400 },
          );
        }

        const group = specData.groups[cal.groupIndex];
        const filtered = filterGroupEntries(group.entries, group.name, {
          subgroup: cal.subgroup,
          uncheckedTypes: cal.uncheckedTypes,
          excluded: cal.excluded,
          labOverrides: cal.labOverrides,
        });

        allEntries = allEntries.concat(filtered);
      }

      // Deduplicate (matters for multi-calendar)
      allEntries = deduplicateEntries(allEntries);

      // Apply frequency filter
      allEntries = filterByFrequency(allEntries, params.freq);

      // Generate ICS
      const ics = generateICS(allEntries, rooms);

      return new Response(ics, {
        status: 200,
        headers: {
          'Content-Type': 'text/calendar; charset=utf-8',
          'Cache-Control': 'public, max-age=3600',
          'Access-Control-Allow-Origin': '*',
        },
      });
    } catch (e) {
      // Uncaught error: return valid empty ICS so Google doesn't unsubscribe
      const empty = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//FMI Cal Generator//UBB Cluj//RO',
        'X-WR-CALNAME:FMI Schedule',
        'END:VCALENDAR',
      ].join('\r\n');
      return new Response(empty, {
        status: 200,
        headers: {
          'Content-Type': 'text/calendar; charset=utf-8',
          'X-Error': e.message,
        },
      });
    }
  },
};
```

**Step 4: Run tests**

```bash
cd worker && npx vitest run test/index.test.js
```

Expected: all tests PASS

**Step 5: Run all tests together**

```bash
cd worker && npx vitest run
```

Expected: all tests across all files PASS

**Step 6: Commit**

```bash
git add worker/src/index.js worker/test/index.test.js
git commit -m "feat(worker): wire up fetch handler with decode/filter/ics pipeline"
```

---

### Task 6: Add "Subscribe" button to the frontend

**Files:**
- Modify: `templates/index.html.j2:71-74` (add button)
- Modify: `templates/style.css` (add subscribe button style)
- Modify: `templates/app.js` (add subscribe click handler)

**Step 1: Add the subscribe button to HTML**

In `templates/index.html.j2`, find the schedule-actions div (line 71-74) and add a subscribe button:

```html
        <div class="schedule-actions">
          <button class="download-btn" id="download-btn" disabled>Download .ics</button>
          <button class="subscribe-btn" id="subscribe-btn" disabled>Subscribe</button>
          <button class="share-btn" id="share-btn" disabled>Copy link</button>
        </div>
```

**Step 2: Add CSS for the subscribe button**

In `templates/style.css`, add styling for `.subscribe-btn` next to the existing `.download-btn` and `.share-btn` styles. Match the existing button style pattern.

**Step 3: Add the subscribe click handler in app.js**

Find where `$('#download-btn')` is enabled/disabled (search for `download-btn`). The subscribe button should be enabled/disabled alongside it.

Add the click handler near the download handler (around line 2004):

```js
$('#subscribe-btn').addEventListener('click', () => {
  const stateUrl = encodeStateToURL();
  if (!stateUrl) return;
  const urlObj = new URL(stateUrl);
  const c = urlObj.searchParams.get('c');
  if (!c) return;

  const subscribeHttps = `https://cal.rdobre.ro/ics?c=${c}`;
  const subscribeWebcal = `webcal://cal.rdobre.ro/ics?c=${c}`;

  // Try webcal:// first (opens native calendar app)
  window.open(subscribeWebcal, '_self');

  // Also copy HTTPS URL to clipboard as fallback
  navigator.clipboard.writeText(subscribeHttps).catch(() => {});
});
```

**Step 4: Enable/disable subscribe button alongside download button**

Search `app.js` for where `$('#download-btn').disabled` is set and add the same for `$('#subscribe-btn')`. This is in the `updatePreview()` function — find all places `download-btn` is enabled/disabled.

**Step 5: Rebuild and test locally**

```bash
source .venv/bin/activate && python scripts/generate_index.py
cd site && python -m http.server 8123
```

Verify: select a spec/group, confirm the Subscribe button enables, click it, confirm it generates a `webcal://` URL.

**Step 6: Commit**

```bash
git add templates/index.html.j2 templates/style.css templates/app.js
git commit -m "feat(ui): add Subscribe button for calendar subscriptions"
```

---

### Task 7: Deploy and configure DNS

This task is manual / semi-automated. Steps for reference:

**Step 1: Deploy the Worker**

```bash
cd worker && npx wrangler deploy
```

This deploys to `fmi-cal-worker.rdobre.workers.dev`.

**Step 2: Configure custom domain**

In the Cloudflare dashboard (or via wrangler):
- Add a custom domain route for `cal.rdobre.ro` pointing to the Worker
- Or add to `wrangler.toml`:

```toml
routes = [
  { pattern = "cal.rdobre.ro/*", zone_name = "rdobre.ro" }
]
```

**Step 3: Verify end-to-end**

```bash
# Encode a test payload
C=$(echo -n '{"s":"M1","g":0,"sg":"1"}' | base64)
curl -s "https://cal.rdobre.ro/ics?c=$C" | head -10
```

Expected: valid ICS calendar output starting with `BEGIN:VCALENDAR`

**Step 4: Test in Google Calendar**

1. Open Google Calendar → Settings → Add calendar → From URL
2. Paste: `https://cal.rdobre.ro/ics?c=BASE64...`
3. Confirm events appear

**Step 5: Commit wrangler.toml route config if changed**

```bash
git add worker/wrangler.toml
git commit -m "feat(worker): add custom domain route for cal.rdobre.ro"
```
