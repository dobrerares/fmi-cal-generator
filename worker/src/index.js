// worker/src/index.js
import { decodeCalParams } from './decode.js';
import { filterGroupEntries, filterByFrequency, deduplicateEntries } from './filter.js';
import { generateICS } from './ics.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const ICS_HEADERS = {
  'Content-Type': 'text/calendar; charset=utf-8',
  'Content-Disposition': 'attachment; filename="calendar.ics"',
  'Cache-Control': 'public, max-age=3600',
  'Access-Control-Allow-Origin': '*',
};

async function fetchJSON(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) return null;
  return res.json();
}

// SHA-256 hash → first 10 hex chars (40 bits of entropy)
async function hashConfig(json) {
  const data = new TextEncoder().encode(json);
  const buf = await crypto.subtle.digest('SHA-256', data);
  const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return hex.slice(0, 10);
}

async function handleConfig(request, env) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });
  }

  const json = await request.text();

  // Validate it's parseable before storing
  try {
    const payload = JSON.parse(json);
    // Normalize: re-stringify to ensure deterministic hashing
    const normalized = JSON.stringify(payload);
    const id = await hashConfig(normalized);

    await env.CAL_CONFIGS.put(id, normalized);

    return new Response(JSON.stringify({ id, url: `https://cal.rdobre.ro/ics/${id}.ics` }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }
}

async function handleConfigGet(pathname, env) {
  const id = decodeURIComponent(pathname.slice('/config/'.length));
  if (!/^[0-9a-f]{10}$/.test(id)) {
    return new Response(JSON.stringify({ error: 'Invalid config ID' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }
  const json = await env.CAL_CONFIGS.get(id);
  if (!json) {
    return new Response(JSON.stringify({ error: 'Config not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }
  return new Response(json, {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

async function resolveParams(pathname, searchParams, env) {
  // Path-based: /ics/<id-or-base64url>.ics
  if (pathname.startsWith('/ics/')) {
    let seg = decodeURIComponent(pathname.slice(5));
    if (seg.endsWith('.ics')) seg = seg.slice(0, -4);

    // Short KV ID: 10 hex chars (a-f0-9)
    if (/^[0-9a-f]{10}$/.test(seg) && env.CAL_CONFIGS) {
      const json = await env.CAL_CONFIGS.get(seg);
      if (!json) return { error: 'Config not found', status: 404 };
      return { params: decodeCalParams(null, JSON.parse(json)) };
    }

    // Legacy base64url path
    let b64 = seg.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    return { params: decodeCalParams(b64) };
  }

  // Legacy query-based: /ics?c=BASE64
  if (pathname === '/ics') {
    const c = searchParams.get('c');
    if (!c) return { error: 'Missing calendar parameter', status: 400 };
    return { params: decodeCalParams(c) };
  }

  return { error: 'Not found', status: 404 };
}

async function handleICS(request, env) {
  const ORIGIN = env.ORIGIN_URL || 'https://orar-fmi.rdobre.ro';
  const url = new URL(request.url);

  const resolved = await resolveParams(url.pathname, url.searchParams, env);
  if (resolved.error) {
    return new Response(resolved.error, { status: resolved.status });
  }

  const { params } = resolved;

  try {
    const rooms = (await fetchJSON(`${ORIGIN}/data/rooms.json`)) || {};

    let allEntries = [];

    for (const cal of params.calendars) {
      const specData = await fetchJSON(`${ORIGIN}/data/${cal.yearCode}.json`);
      if (!specData) {
        return new Response(`Failed to fetch schedule data for ${cal.yearCode}`, { status: 502 });
      }

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

    allEntries = deduplicateEntries(allEntries);
    allEntries = filterByFrequency(allEntries, params.freq);

    const ics = generateICS(allEntries, rooms);

    return new Response(ics, { status: 200, headers: ICS_HEADERS });
  } catch (e) {
    const empty = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//FMI Cal Generator//UBB Cluj//RO',
      'X-WR-CALNAME:FMI Schedule',
      'END:VCALENDAR',
    ].join('\r\n');
    return new Response(empty, {
      status: 200,
      headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'X-Error': e.message },
    });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/config') {
      return handleConfig(request, env);
    }

    // GET /config/<hash> — retrieve stored config for short share URLs
    if (url.pathname.startsWith('/config/')) {
      return handleConfigGet(url.pathname, env);
    }

    return handleICS(request, env);
  },
};
