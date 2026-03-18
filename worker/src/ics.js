// worker/src/ics.js

function icsEscape(s) {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
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
    'METHOD:PUBLISH',
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
      lines.push(`DTSTAMP:${dtstamp}`);
      lines.push(`UID:${d}T${sh}-${e.subject}-${e.type}@fmi-cal`);
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
