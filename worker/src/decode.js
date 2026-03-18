// worker/src/decode.js
export function decodeCalParams(b64, preParsed) {
  const payload = preParsed || JSON.parse(decodeURIComponent(escape(atob(b64))));

  let rawCals;
  let freq = 'all';

  if (payload.cals) {
    rawCals = payload.cals;
    if (payload.f) freq = payload.f;
  } else {
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
