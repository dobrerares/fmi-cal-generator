// worker/src/filter.js

export function filterGroupEntries(entries, groupName, params) {
  const { subgroup, uncheckedTypes, excluded, labOverrides } = params;
  const typesSet = new Set(['Curs', 'Seminar', 'Laborator']);
  for (const t of uncheckedTypes) typesSet.delete(t);
  const excludedSet = new Set(excluded);

  return entries.filter((e) => {
    if (!typesSet.has(e.type)) return false;
    if (excludedSet.has(e.subject + '|||' + e.type)) return false;

    const f = e.formation;
    if (!/^\d/.test(f)) return true;
    if (f === groupName) return true;
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

export function filterByFrequency(entries, freq) {
  if (freq === 'all') return entries;
  return entries.filter((e) => e.frequency === 'every' || e.frequency === freq);
}
