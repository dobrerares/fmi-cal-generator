(function() {
  'use strict';

  // --- Theme ---
  const themeBtn = document.getElementById('theme-toggle');
  const THEMES = ['light', 'amoled'];
  const THEME_ICONS = { light: '\u2600\uFE0F', amoled: '\uD83C\uDF19' };

  function getPreferredTheme() {
    const saved = localStorage.getItem('fmi-cal-theme');
    if (saved === 'dark') return 'amoled';  // migrate removed theme
    if (saved && THEMES.includes(saved)) return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'amoled' : 'light';
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    themeBtn.textContent = THEME_ICONS[theme] || THEME_ICONS.light;
    localStorage.setItem('fmi-cal-theme', theme);
  }

  applyTheme(getPreferredTheme());

  themeBtn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const idx = THEMES.indexOf(current);
    applyTheme(THEMES[(idx + 1) % THEMES.length]);
  });

  // --- State ---
  let indexData = null;   // { specs: [{ name, years: [{year,code}] }] }
  let specData = null;    // { code, name, year, groups: [{name, hasSubgroups, entries}] }
  let selectedGroup = null;
  let selectedSubgroup = 'all';
  let restoring = false;

  const $ = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);
  function editDist(a, b) {
    if (a.length > b.length) { const t = a; a = b; b = t; }
    let prev = Array.from({ length: a.length + 1 }, (_, i) => i);
    for (let j = 1; j <= b.length; j++) {
      const curr = [j];
      for (let i = 1; i <= a.length; i++) {
        curr[i] = a[i-1] === b[j-1]
          ? prev[i-1]
          : 1 + Math.min(prev[i-1], prev[i], curr[i-1]);
      }
      prev = curr;
    }
    return prev[a.length];
  }
  function fuzzyMatch(text, query) {
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!tokens.length) return true;
    const words = text.toLowerCase().split(/\s+/);
    return tokens.every(tok => {
      const maxDist = tok.length >= 7 ? 2 : tok.length >= 4 ? 1 : 0;
      return words.some(w => w.includes(tok) || editDist(tok, w) <= maxDist)
        || text.toLowerCase().includes(tok);
    });
  }

  // --- Tabs ---
  $$('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.tab').forEach(t => t.classList.remove('active'));
      $$('.tab-content').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      $(`#${btn.dataset.tab === 'builder' ? 'builder-section' : 'download-section'}`).classList.add('active');
    });
  });

  // --- Enable/disable cards ---
  function enableCard(id) { $(`#${id}`).classList.remove('disabled'); }
  function disableCard(id) { $(`#${id}`).classList.add('disabled'); }

  function resetFrom(step) {
    const order = ['year-card','group-card','subgroup-card','types-card','subjects-card','preview-card'];
    const idx = order.indexOf(step);
    for (let i = idx; i < order.length; i++) disableCard(order[i]);
    // Only null state that belongs to the reset level or below
    if (idx <= order.indexOf('group-card')) specData = null;
    if (idx <= order.indexOf('subgroup-card')) selectedGroup = null;
  }

  // --- Spec change ---
  function onSpecChange(specIndex) {
    resetFrom('year-card');
    if (specIndex === '' || specIndex == null) return;

    const spec = indexData.specs[specIndex];
    if (!spec) return;

    $('#spec-select').value = specIndex;

    const sel = $('#year-select');
    sel.innerHTML = '<option value="">Select year&hellip;</option>';
    spec.years.forEach(y => {
      const opt = document.createElement('option');
      opt.value = y.code;
      opt.textContent = `Year ${y.year}`;
      sel.appendChild(opt);
    });
    enableCard('year-card');

    if (spec.years.length === 1) {
      sel.value = spec.years[0].code;
      sel.dispatchEvent(new Event('change'));
    }
    saveState();
  }

  // --- Load index + combobox ---
  let comboboxItems = [];
  let highlightedIdx = -1;

  function renderList(filter) {
    const list = $('#spec-list');
    list.innerHTML = '';
    highlightedIdx = -1;
    comboboxItems.forEach((item, i) => {
      if (filter && !fuzzyMatch(item.name, filter)) return;
      const li = document.createElement('li');
      li.textContent = item.name;
      li.dataset.index = item.index;
      if (String(item.index) === $('#spec-select').value) li.classList.add('selected');
      li.addEventListener('mousedown', e => {
        e.preventDefault();
        selectSpec(item.index, item.name);
      });
      list.appendChild(li);
    });
  }

  function openList() {
    $('#spec-list').classList.add('open');
  }
  function closeList() {
    $('#spec-list').classList.remove('open');
    highlightedIdx = -1;
    // Remove highlights
    $$('#spec-list li').forEach(li => li.classList.remove('highlighted'));
  }

  function selectSpec(index, name) {
    $('#spec-select').value = index;
    $('#spec-input').value = name;
    closeList();
    onSpecChange(index);
  }

  fetch('data/index.json')
    .then(r => r.json())
    .then(data => {
      indexData = data;
      comboboxItems = data.specs.map((s, i) => ({ name: s.name, index: i }));
      $('#spec-input').placeholder = 'Select specialization\u2026';
      renderList('');
      restoreState();
    })
    .catch(() => {
      $('#spec-input').placeholder = 'Failed to load data';
      $('#spec-input').disabled = true;
    });

  // --- Combobox events ---
  const specInput = $('#spec-input');

  specInput.addEventListener('focus', () => {
    if (blurTimeout) clearTimeout(blurTimeout);
    specInput.select();
    renderList(specInput.value);
    openList();
  });

  specInput.addEventListener('input', () => {
    renderList(specInput.value);
    openList();
  });

  let blurTimeout = null;
  specInput.addEventListener('blur', () => {
    blurTimeout = setTimeout(() => {
      closeList();
      // Revert text to current selection
      const idx = $('#spec-select').value;
      if (idx !== '' && indexData && indexData.specs[idx]) {
        specInput.value = indexData.specs[idx].name;
      } else {
        specInput.value = '';
      }
    }, 150);
  });

  specInput.addEventListener('keydown', e => {
    const items = $$('#spec-list li');
    if (!items.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      highlightedIdx = Math.min(highlightedIdx + 1, items.length - 1);
      items.forEach((li, i) => li.classList.toggle('highlighted', i === highlightedIdx));
      items[highlightedIdx].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      highlightedIdx = Math.max(highlightedIdx - 1, -1);
      items.forEach((li, i) => li.classList.toggle('highlighted', i === highlightedIdx));
      if (highlightedIdx >= 0) items[highlightedIdx].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIdx >= 0 && highlightedIdx < items.length) {
        const li = items[highlightedIdx];
        selectSpec(Number(li.dataset.index), li.textContent);
      }
    } else if (e.key === 'Escape') {
      closeList();
      specInput.blur();
    }
  });

  // --- Year change (fetch spec JSON) ---
  $('#year-select').addEventListener('change', function() {
    resetFrom('group-card');
    if (!this.value) return;

    const code = this.value;
    const groupSel = $('#group-select');
    groupSel.innerHTML = '<option value="">Loading&hellip;</option>';
    enableCard('group-card');

    fetch(`data/${code}.json`)
      .then(r => r.json())
      .then(data => {
        specData = data;
        groupSel.innerHTML = '<option value="">Select group&hellip;</option>';
        data.groups.forEach((g, i) => {
          const opt = document.createElement('option');
          opt.value = i;
          opt.textContent = `Group ${g.name}`;
          groupSel.appendChild(opt);
        });
        saveState();
      })
      .catch(() => {
        groupSel.innerHTML = '<option value="">Failed to load</option>';
      });
  });

  // --- Group change ---
  $('#group-select').addEventListener('change', function() {
    resetFrom('subgroup-card');
    if (!this.value || !specData) return;

    const group = specData.groups[this.value];
    selectedGroup = group;

    // Subgroup pills
    const pills = $('#subgroup-pills');
    pills.innerHTML = '';
    if (group.hasSubgroups) {
      ['1','2','all'].forEach(v => {
        const lbl = document.createElement('label');
        const inp = document.createElement('input');
        inp.type = 'radio';
        inp.name = 'subgroup';
        inp.value = v;
        if (v === 'all') inp.checked = true;
        const span = document.createElement('span');
        span.textContent = v === 'all' ? 'Both' : `Subgroup ${v}`;
        lbl.appendChild(inp);
        lbl.appendChild(span);
        pills.appendChild(lbl);
        inp.addEventListener('change', () => {
          selectedSubgroup = v;
          updateSubjects();
          updatePreview();
        });
      });
      selectedSubgroup = 'all';
      enableCard('subgroup-card');
    } else {
      selectedSubgroup = 'all';
    }

    enableCard('types-card');
    enableCard('subjects-card');
    enableCard('preview-card');
    updateSubjects();
    updatePreview();
  });

  // --- Type toggles (batch check/uncheck matching subject entries) ---
  $$('#types-card input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      const t = cb.dataset.type;
      $$('#subject-list input[data-key]').forEach(sc => {
        if (sc.dataset.key.endsWith('|||' + t)) sc.checked = cb.checked;
      });
      // Sync all parent checkboxes
      $$('#subject-list .subject-group').forEach(g => {
        const parentCb = g.querySelector('.subject-parent input');
        const childCbs = [...g.querySelectorAll('.subject-children input[data-key]')];
        if (parentCb && childCbs.length) syncParent(parentCb, childCbs);
      });
      updateToggleBtn();
      updatePreview();
    });
  });

  // --- Subject list ---
  function getActiveTypes() {
    const types = new Set();
    $$('#types-card input[type="checkbox"]').forEach(cb => {
      if (cb.checked) types.add(cb.dataset.type);
    });
    return types;
  }

  function syncParent(parentCb, childCbs) {
    const total = childCbs.length;
    const checked = childCbs.filter(c => c.checked).length;
    parentCb.checked = checked === total;
    parentCb.indeterminate = checked > 0 && checked < total;
  }

  function updateSubjects() {
    if (!selectedGroup) return;

    const allTypes = new Set(['Curs', 'Seminar', 'Laborator']);
    const filtered = filterEntries(selectedGroup, allTypes, new Set());

    // Build Map<subject, Set<type>>
    const subjTypes = new Map();
    filtered.forEach(e => {
      if (!subjTypes.has(e.subject)) subjTypes.set(e.subject, new Set());
      subjTypes.get(e.subject).add(e.type);
    });

    const list = $('#subject-list');
    // Preserve checked state using composite keys
    const prev = {};
    list.querySelectorAll('input[data-key]').forEach(cb => { prev[cb.dataset.key] = cb.checked; });

    list.innerHTML = '';
    const BADGE = { 'Curs': ['C', 'badge-c'], 'Seminar': ['S', 'badge-s'], 'Laborator': ['L', 'badge-l'] };
    const sortedSubjects = [...subjTypes.keys()].sort();

    sortedSubjects.forEach(subj => {
      const typesSet = subjTypes.get(subj);
      const typeArr = [...typesSet].sort();

      if (typeArr.length === 1) {
        // Single type -> flat row
        const t = typeArr[0];
        const key = subj + '|||' + t;
        const badge = BADGE[t] || ['?',''];
        const lbl = document.createElement('label');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.dataset.key = key;
        cb.checked = prev[key] !== undefined ? prev[key] : true;
        cb.addEventListener('change', () => { updateToggleBtn(); updatePreview(); });
        const nameSpan = document.createElement('span');
        nameSpan.textContent = subj;
        const badgeSpan = document.createElement('span');
        badgeSpan.className = `type-badge ${badge[1]}`;
        badgeSpan.textContent = badge[0];
        lbl.appendChild(cb);
        lbl.appendChild(nameSpan);
        lbl.appendChild(badgeSpan);
        list.appendChild(lbl);
      } else {
        // Multi-type -> grouped with parent
        const group = document.createElement('div');
        group.className = 'subject-group';

        const parentRow = document.createElement('div');
        parentRow.className = 'subject-parent';
        const parentCb = document.createElement('input');
        parentCb.type = 'checkbox';
        const parentName = document.createElement('span');
        parentName.textContent = subj;
        parentRow.appendChild(parentCb);
        parentRow.appendChild(parentName);
        group.appendChild(parentRow);

        const childContainer = document.createElement('div');
        childContainer.className = 'subject-children check-group';
        const childCbs = [];

        typeArr.forEach(t => {
          const key = subj + '|||' + t;
          const badge = BADGE[t] || ['?',''];
          const lbl = document.createElement('label');
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.dataset.key = key;
          cb.checked = prev[key] !== undefined ? prev[key] : true;
          cb.addEventListener('change', () => {
            syncParent(parentCb, childCbs);
            updateToggleBtn();
            updatePreview();
          });
          childCbs.push(cb);
          const nameSpan = document.createElement('span');
          nameSpan.textContent = t === 'Curs' ? 'Course' : t === 'Seminar' ? 'Seminar' : t === 'Laborator' ? 'Lab' : t;
          const badgeSpan = document.createElement('span');
          badgeSpan.className = `type-badge ${badge[1]}`;
          badgeSpan.textContent = badge[0];
          lbl.appendChild(cb);
          lbl.appendChild(nameSpan);
          lbl.appendChild(badgeSpan);
          childContainer.appendChild(lbl);
        });

        group.appendChild(childContainer);
        list.appendChild(group);

        // Parent toggles all children
        parentCb.addEventListener('change', () => {
          childCbs.forEach(c => { c.checked = parentCb.checked; });
          parentCb.indeterminate = false;
          updateToggleBtn();
          updatePreview();
        });

        // Initial parent state
        syncParent(parentCb, childCbs);
      }
    });

    updateToggleBtn();
    $('#subject-search').value = '';
  }

  function updateToggleBtn() {
    const cbs = [...$$('#subject-list input[data-key]')].filter(
      cb => cb.closest('label, .subject-group').style.display !== 'none'
    );
    const allChecked = cbs.length > 0 && cbs.every(cb => cb.checked);
    $('#toggle-subjects-btn').textContent = allChecked ? 'Deselect all' : 'Select all';
  }

  $('#toggle-subjects-btn').addEventListener('click', () => {
    const cbs = [...$$('#subject-list input[data-key]')].filter(
      cb => cb.closest('label, .subject-group').style.display !== 'none'
    );
    const allChecked = cbs.length > 0 && cbs.every(cb => cb.checked);
    cbs.forEach(cb => { cb.checked = !allChecked; });
    // Sync all parent checkboxes
    $$('#subject-list .subject-group').forEach(g => {
      const parentCb = g.querySelector('.subject-parent input');
      const childCbs = [...g.querySelectorAll('.subject-children input[data-key]')];
      if (parentCb && childCbs.length) syncParent(parentCb, childCbs);
    });
    updateToggleBtn();
    updatePreview();
  });

  // --- Subject search ---
  $('#subject-search').addEventListener('input', function() {
    const q = this.value;
    // Filter grouped subjects
    $$('#subject-list .subject-group').forEach(g => {
      const name = g.querySelector('.subject-parent span').textContent;
      g.style.display = fuzzyMatch(name, q) ? '' : 'none';
    });
    // Filter flat (single-type) labels
    $$('#subject-list > label').forEach(lbl => {
      const spans = lbl.querySelectorAll('span');
      const name = spans.length ? spans[0].textContent : '';
      lbl.style.display = fuzzyMatch(name, q) ? '' : 'none';
    });
    updateToggleBtn();
  });

  // --- Filtering ---
  function filterEntries(group, types, excludedKeys) {
    const gName = group.name;
    const sub = selectedSubgroup;
    return group.entries.filter(e => {
      if (!types.has(e.type)) return false;
      if (excludedKeys.has(e.subject + '|||' + e.type)) return false;
      const f = e.formation;
      if (!/^\d/.test(f)) return true;
      if (f === gName) return true;
      if (f.includes('/') && !gName.includes('/')) {
        const parts = f.split('/');
        if (parts[0] !== gName) return false;
        if (sub && sub !== 'all' && parts[1] !== sub) return false;
        return true;
      }
      return false;
    });
  }

  // --- Preview ---
  function getFilteredEntries() {
    if (!selectedGroup) return [];
    const allTypes = new Set(['Curs', 'Seminar', 'Laborator']);
    const excluded = new Set();
    $$('#subject-list input[data-key]').forEach(cb => {
      if (!cb.checked) excluded.add(cb.dataset.key);
    });
    return filterEntries(selectedGroup, allTypes, excluded);
  }

  function updatePreview() {
    const entries = getFilteredEntries();
    const count = entries.reduce((sum, e) => sum + e.dates.length, 0);
    $('#event-count').textContent = count;
    $('#download-btn').disabled = count === 0;
    saveState();
  }

  // --- Persistence ---
  function saveState() {
    if (restoring) return;
    try {
      const state = {};
      state.specIndex = $('#spec-select').value;
      state.yearCode = $('#year-select').value;
      state.groupIndex = $('#group-select').value;
      state.subgroup = selectedSubgroup;
      state.uncheckedTypes = [];
      $$('#types-card input[type="checkbox"]').forEach(cb => {
        if (!cb.checked) state.uncheckedTypes.push(cb.dataset.type);
      });
      state.excludedKeys = [];
      $$('#subject-list input[data-key]').forEach(cb => {
        if (!cb.checked) state.excludedKeys.push(cb.dataset.key);
      });
      localStorage.setItem('fmi-cal-state', JSON.stringify(state));
    } catch (e) {}
  }

  function restoreState() {
    try {
      const raw = localStorage.getItem('fmi-cal-state');
      if (!raw) return;
      const state = JSON.parse(raw);
      if (!state || state.specIndex === '' || state.specIndex == null) return;
      if (!indexData.specs[state.specIndex]) return;

      restoring = true;

      const spec = indexData.specs[state.specIndex];
      $('#spec-select').value = state.specIndex;
      $('#spec-input').value = spec.name;

      // Populate year options (same as onSpecChange)
      const yearSel = $('#year-select');
      yearSel.innerHTML = '<option value="">Select year&hellip;</option>';
      spec.years.forEach(y => {
        const opt = document.createElement('option');
        opt.value = y.code;
        opt.textContent = `Year ${y.year}`;
        yearSel.appendChild(opt);
      });
      enableCard('year-card');

      // Validate yearCode
      if (!state.yearCode || !spec.years.some(y => y.code === state.yearCode)) {
        restoring = false;
        return;
      }
      yearSel.value = state.yearCode;

      // Fetch year data
      fetch(`data/${state.yearCode}.json`)
        .then(r => r.json())
        .then(data => {
          specData = data;

          // Populate group options
          const groupSel = $('#group-select');
          groupSel.innerHTML = '<option value="">Select group&hellip;</option>';
          data.groups.forEach((g, i) => {
            const opt = document.createElement('option');
            opt.value = i;
            opt.textContent = `Group ${g.name}`;
            groupSel.appendChild(opt);
          });
          enableCard('group-card');

          // Validate groupIndex
          const gi = state.groupIndex;
          if (gi === '' || gi === null || gi === undefined || !data.groups[gi]) {
            restoring = false;
            return;
          }
          groupSel.value = gi;
          selectedGroup = data.groups[gi];

          // Build subgroup pills (same as group-change handler)
          const group = selectedGroup;
          const pills = $('#subgroup-pills');
          pills.innerHTML = '';
          if (group.hasSubgroups) {
            const savedSub = (state.subgroup === '1' || state.subgroup === '2') ? state.subgroup : 'all';
            ['1','2','all'].forEach(v => {
              const lbl = document.createElement('label');
              const inp = document.createElement('input');
              inp.type = 'radio';
              inp.name = 'subgroup';
              inp.value = v;
              if (v === savedSub) inp.checked = true;
              const span = document.createElement('span');
              span.textContent = v === 'all' ? 'Both' : `Subgroup ${v}`;
              lbl.appendChild(inp);
              lbl.appendChild(span);
              pills.appendChild(lbl);
              inp.addEventListener('change', () => {
                selectedSubgroup = v;
                updateSubjects();
                updatePreview();
              });
            });
            selectedSubgroup = savedSub;
            enableCard('subgroup-card');
          } else {
            selectedSubgroup = 'all';
          }

          // Restore unchecked types
          if (state.uncheckedTypes && state.uncheckedTypes.length) {
            $$('#types-card input[type="checkbox"]').forEach(cb => {
              if (state.uncheckedTypes.includes(cb.dataset.type)) cb.checked = false;
            });
          }

          enableCard('types-card');
          enableCard('subjects-card');
          enableCard('preview-card');

          updateSubjects();

          // Apply excludedKeys (uncheck matching inputs)
          if (state.excludedKeys && state.excludedKeys.length) {
            const excSet = new Set(state.excludedKeys);
            $$('#subject-list input[data-key]').forEach(cb => {
              if (excSet.has(cb.dataset.key)) cb.checked = false;
            });
            // Sync all parent checkboxes
            $$('#subject-list .subject-group').forEach(g => {
              const parentCb = g.querySelector('.subject-parent input');
              const childCbs = [...g.querySelectorAll('.subject-children input[data-key]')];
              if (parentCb && childCbs.length) syncParent(parentCb, childCbs);
            });
          }

          updatePreview();
          restoring = false;
        })
        .catch(() => {
          restoring = false;
        });
    } catch (e) {
      restoring = false;
    }
  }

  // --- ICS generation ---
  function icsEscape(s) {
    return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  }

  function generateICS(entries) {
    const PREFIX = { 'Curs': '[C]', 'Seminar': '[S]', 'Laborator': '[L]' };
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
        if (e.room) lines.push(`LOCATION:${icsEscape(e.room)}`);
        if (e.professor) lines.push(`DESCRIPTION:${icsEscape(e.professor)}`);
        lines.push('END:VEVENT');
      }
    }

    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  }

  $('#download-btn').addEventListener('click', () => {
    const entries = getFilteredEntries();
    if (!entries.length) return;

    const ics = generateICS(entries);
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;

    // Build filename: spec-group-subgroup.ics
    const code = specData ? specData.code : 'schedule';
    const gName = selectedGroup.name.replace('/', '-');
    const sub = selectedSubgroup === 'all' ? 'all' : selectedSubgroup;
    a.download = `${code}-${gName}-${sub}.ics`;

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

})();
