// worker/src/ics.js

// Europe/Bucharest timezone definition (EET/EEST)
// RFC 5545 §3.6.5: VTIMEZONE MUST be specified for each TZID referenced
const VTIMEZONE_BUCHAREST = [
  'BEGIN:VTIMEZONE',
  'TZID:Europe/Bucharest',
  'BEGIN:STANDARD',
  'DTSTART:19701025T040000',
  'RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=10',
  'TZOFFSETFROM:+0300',
  'TZOFFSETTO:+0200',
  'TZNAME:EET',
  'END:STANDARD',
  'BEGIN:DAYLIGHT',
  'DTSTART:19700329T030000',
  'RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=3',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0300',
  'TZNAME:EEST',
  'END:DAYLIGHT',
  'END:VTIMEZONE',
];

function icsEscape(s) {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

// RFC 5545 §3.1: lines SHOULD NOT exceed 75 octets; fold with CRLF + space
// Counts UTF-8 bytes (not JS characters) and avoids splitting multi-byte sequences
function icsFold(line) {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(line);
  if (bytes.length <= 75) return line;

  const parts = [];
  let offset = 0;
  let isFirst = true;

  while (offset < bytes.length) {
    const limit = isFirst ? 75 : 74; // continuation lines have a leading space
    isFirst = false;

    if (offset + limit >= bytes.length) {
      parts.push(new TextDecoder().decode(bytes.slice(offset)));
      break;
    }

    // Back up if we're in the middle of a UTF-8 multi-byte sequence
    // Continuation bytes have the form 10xxxxxx (0x80–0xBF)
    let splitAt = offset + limit;
    while (splitAt > offset && (bytes[splitAt] & 0xc0) === 0x80) {
      splitAt--;
    }

    parts.push(new TextDecoder().decode(bytes.slice(offset, splitAt)));
    offset = splitAt;
  }

  return parts.join('\r\n ');
}

export function generateICS(entries, rooms) {
  const PREFIX = { Curs: '[C]', Seminar: '[S]', Laborator: '[L]' };
  const now = new Date();
  const dtstamp =
    now.getUTCFullYear().toString() +
    String(now.getUTCMonth() + 1).padStart(2, '0') +
    String(now.getUTCDate()).padStart(2, '0') +
    'T' +
    String(now.getUTCHours()).padStart(2, '0') +
    String(now.getUTCMinutes()).padStart(2, '0') +
    String(now.getUTCSeconds()).padStart(2, '0') +
    'Z';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//FMI Cal Generator//UBB Cluj//RO',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:FMI Schedule',
    'X-WR-TIMEZONE:Europe/Bucharest',
    ...VTIMEZONE_BUCHAREST,
  ];

  for (const e of entries) {
    const pfx = PREFIX[e.type] || '';
    for (const ds of e.dates) {
      const d = ds.replace(/-/g, '');
      const sh = String(e.startHour).padStart(2, '0');
      const eh = String(e.endHour).padStart(2, '0');
      lines.push('BEGIN:VEVENT');
      lines.push(`DTSTAMP:${dtstamp}`);
      lines.push(icsFold(`UID:${d}T${sh}-${e.subject}-${e.type}@fmi-cal`));
      lines.push(`DTSTART;TZID=Europe/Bucharest:${d}T${sh}0000`);
      lines.push(`DTEND;TZID=Europe/Bucharest:${d}T${eh}0000`);
      lines.push(icsFold(`SUMMARY:${icsEscape(pfx + ' ' + e.subject)}`));
      if (e.room) {
        const loc = rooms[e.room]
          ? `${e.room}, ${rooms[e.room]}`
          : e.room;
        lines.push(icsFold(`LOCATION:${icsEscape(loc)}`));
      }
      if (e.professor) lines.push(icsFold(`DESCRIPTION:${icsEscape(e.professor)}`));
      lines.push('SEQUENCE:0');
      lines.push('END:VEVENT');
    }
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
