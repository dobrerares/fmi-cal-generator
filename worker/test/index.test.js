// worker/test/index.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import worker from '../src/index.js';

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

function encodeB64url(obj) {
  return encode(obj).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function mockKV(store = {}) {
  return {
    get: vi.fn((key) => Promise.resolve(store[key] || null)),
    put: vi.fn((key, value) => { store[key] = value; return Promise.resolve(); }),
  };
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

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns 400 when ?c= param is missing', async () => {
    const req = new Request('https://cal.rdobre.ro/ics');
    const res = await worker.fetch(req, {});
    expect(res.status).toBe(400);
  });

  it('returns valid ICS for a single calendar', async () => {
    const c = encode({ s: 'M1', g: 0, sg: '1' });
    const req = new Request(`https://cal.rdobre.ro/ics?c=${c}`);
    const res = await worker.fetch(req, {});
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/calendar; charset=utf-8');
    const body = await res.text();
    expect(body).toContain('BEGIN:VCALENDAR');
    expect(body).toContain('Algebra');
    expect(body).toContain('L001');
    expect(body).not.toContain('L002');
  });

  it('returns 502 when origin fetch fails', async () => {
    globalThis.fetch = mockFetch({});
    const c = encode({ s: 'INVALID', g: 0 });
    const req = new Request(`https://cal.rdobre.ro/ics?c=${c}`);
    const res = await worker.fetch(req, {});
    expect(res.status).toBe(502);
  });

  it('returns 400 for out-of-bounds group index', async () => {
    const c = encode({ s: 'M1', g: 99 });
    const req = new Request(`https://cal.rdobre.ro/ics?c=${c}`);
    const res = await worker.fetch(req, {});
    expect(res.status).toBe(400);
  });

  it('returns valid ICS via path-based base64url route with .ics extension', async () => {
    const b64url = encodeB64url({ s: 'M1', g: 0, sg: '1' });
    const req = new Request(`https://cal.rdobre.ro/ics/${b64url}.ics`);
    const res = await worker.fetch(req, {});
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/calendar; charset=utf-8');
    expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="calendar.ics"');
    const body = await res.text();
    expect(body).toContain('BEGIN:VCALENDAR');
    expect(body).toContain('Algebra');
    expect(body).toContain('L001');
    expect(body).not.toContain('L002');
  });

  it('returns valid ICS via path-based route without .ics extension', async () => {
    const b64url = encodeB64url({ s: 'M1', g: 0, sg: '1' });
    const req = new Request(`https://cal.rdobre.ro/ics/${b64url}`);
    const res = await worker.fetch(req, {});
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('BEGIN:VCALENDAR');
    expect(body).toContain('Algebra');
  });

  it('returns 404 for non /ics paths', async () => {
    const req = new Request('https://cal.rdobre.ro/other');
    const res = await worker.fetch(req, {});
    expect(res.status).toBe(404);
  });

  it('returns valid empty ICS on uncaught error with X-Error header', async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(new Response('not json', { status: 200 })),
    );
    const c = encode({ s: 'M1', g: 0 });
    const req = new Request(`https://cal.rdobre.ro/ics?c=${c}`);
    const res = await worker.fetch(req, {});
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Error')).toBeTruthy();
    const body = await res.text();
    expect(body).toContain('BEGIN:VCALENDAR');
    expect(body).toContain('END:VCALENDAR');
    expect(body).not.toContain('BEGIN:VEVENT');
  });
});

describe('POST /config', () => {
  it('stores config and returns short ID', async () => {
    const kv = mockKV();
    const payload = { s: 'M1', g: 0, sg: '1' };
    const req = new Request('https://cal.rdobre.ro/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const res = await worker.fetch(req, { CAL_CONFIGS: kv });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toMatch(/^[0-9a-f]{10}$/);
    expect(data.url).toBe(`https://cal.rdobre.ro/ics/${data.id}.ics`);
    expect(kv.put).toHaveBeenCalledOnce();
  });

  it('returns same ID for identical configs', async () => {
    const kv = mockKV();
    const payload = { s: 'M1', g: 0 };
    const req1 = new Request('https://cal.rdobre.ro/config', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const req2 = new Request('https://cal.rdobre.ro/config', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const res1 = await worker.fetch(req1, { CAL_CONFIGS: kv });
    const res2 = await worker.fetch(req2, { CAL_CONFIGS: kv });
    const data1 = await res1.json();
    const data2 = await res2.json();
    expect(data1.id).toBe(data2.id);
  });

  it('returns 400 for invalid JSON', async () => {
    const kv = mockKV();
    const req = new Request('https://cal.rdobre.ro/config', {
      method: 'POST',
      body: 'not json',
    });
    const res = await worker.fetch(req, { CAL_CONFIGS: kv });
    expect(res.status).toBe(400);
  });

  it('returns CORS headers on OPTIONS', async () => {
    const req = new Request('https://cal.rdobre.ro/config', { method: 'OPTIONS' });
    const res = await worker.fetch(req, {});
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });
});

describe('KV-based /ics/:id route', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch(MOCK_DATA);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('serves ICS from KV-stored config', async () => {
    const config = JSON.stringify({ s: 'M1', g: 0, sg: '1' });
    const kv = mockKV({ 'a1b2c3d4e5': config });
    const req = new Request('https://cal.rdobre.ro/ics/a1b2c3d4e5.ics');
    const res = await worker.fetch(req, { CAL_CONFIGS: kv, ORIGIN_URL: ORIGIN });
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('BEGIN:VCALENDAR');
    expect(body).toContain('Algebra');
    expect(body).toContain('L001');
    expect(body).not.toContain('L002');
  });

  it('returns 404 for unknown KV ID', async () => {
    const kv = mockKV();
    const req = new Request('https://cal.rdobre.ro/ics/0000000000.ics');
    const res = await worker.fetch(req, { CAL_CONFIGS: kv });
    expect(res.status).toBe(404);
  });
});
