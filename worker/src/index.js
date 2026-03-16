// worker/src/index.js
import { decodeCalParams } from './decode.js';
import { filterGroupEntries, filterByFrequency, deduplicateEntries } from './filter.js';
import { generateICS } from './ics.js';

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

export default {
  async fetch(request, env) {
    const ORIGIN = env.ORIGIN_URL || 'https://orar-fmi.rdobre.ro';
    const url = new URL(request.url);

    if (url.pathname !== '/ics') {
      return new Response('Not found', { status: 404 });
    }

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

      return new Response(ics, {
        status: 200,
        headers: {
          'Content-Type': 'text/calendar; charset=utf-8',
          'Cache-Control': 'public, max-age=3600',
          'Access-Control-Allow-Origin': '*',
        },
      });
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
        headers: {
          'Content-Type': 'text/calendar; charset=utf-8',
          'X-Error': e.message,
        },
      });
    }
  },
};
