(function() {
  'use strict';

  // --- Theme ---
  const themeBtn = document.getElementById('theme-toggle');
  const THEMES = ['light', 'amoled'];
  const THEME_ICONS = { light: '\u2600\uFE0F', amoled: '\uD83C\uDF19' };

  function getPreferredTheme() {
    const saved = localStorage.getItem('fmi-cal-theme');
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
  let labSubgroupOverrides = {};  // { subjectName: '1' | '2' | 'all' }
  let selectedFreq = 'all';
  let selectedMobileDay = 'Luni';

  const DAYS = ['Luni', 'Marti', 'Miercuri', 'Joi', 'Vineri'];
  const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const GRID_START = 8;
  const GRID_END = 20;

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

  // --- Custom select dropdown helper ---
  function setupCustomSelect(triggerSel, listSel, hiddenSel, onChange) {
    const trigger = $(triggerSel);
    const list = $(listSel);
    const hidden = $(hiddenSel);
    let hlIdx = -1;

    function open() { list.classList.add('open'); }
    function close() {
      list.classList.remove('open');
      hlIdx = -1;
      list.querySelectorAll('li').forEach(li => li.classList.remove('highlighted'));
    }
    function isOpen() { return list.classList.contains('open'); }

    function selectItem(value, text) {
      hidden.value = value;
      trigger.textContent = text;
      trigger.classList.remove('placeholder');
      list.querySelectorAll('li').forEach(li =>
        li.classList.toggle('selected', li.dataset.value === String(value))
      );
      close();
      if (onChange) onChange(value);
    }

    function setItems(items) {
      list.innerHTML = '';
      hlIdx = -1;
      items.forEach(item => {
        const li = document.createElement('li');
        li.textContent = item.text;
        li.dataset.value = String(item.value);
        if (String(item.value) === hidden.value) li.classList.add('selected');
        li.addEventListener('mousedown', e => {
          e.preventDefault();
          selectItem(item.value, item.text);
        });
        list.appendChild(li);
      });
    }

    function reset(text) {
      hidden.value = '';
      trigger.textContent = text;
      trigger.classList.add('placeholder');
      list.innerHTML = '';
      close();
    }

    function setValue(value) {
      const li = list.querySelector(`li[data-value="${value}"]`);
      if (li) {
        hidden.value = value;
        trigger.textContent = li.textContent;
        trigger.classList.remove('placeholder');
        list.querySelectorAll('li').forEach(l => l.classList.toggle('selected', l === li));
      }
    }

    trigger.addEventListener('click', () => { if (isOpen()) close(); else open(); });
    document.addEventListener('mousedown', e => {
      if (!trigger.contains(e.target) && !list.contains(e.target)) close();
    });
    trigger.addEventListener('keydown', e => {
      const items = list.querySelectorAll('li');
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!isOpen()) { open(); return; }
        hlIdx = Math.min(hlIdx + 1, items.length - 1);
        items.forEach((li, i) => li.classList.toggle('highlighted', i === hlIdx));
        items[hlIdx].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        hlIdx = Math.max(hlIdx - 1, 0);
        items.forEach((li, i) => li.classList.toggle('highlighted', i === hlIdx));
        if (items[hlIdx]) items[hlIdx].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (!isOpen()) { open(); return; }
        if (hlIdx >= 0 && hlIdx < items.length) {
          selectItem(items[hlIdx].dataset.value, items[hlIdx].textContent);
        }
      } else if (e.key === 'Escape') {
        close();
      }
    });

    return { selectItem, setItems, reset, setValue, close, open };
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
    const order = ['year-card','group-card','subgroup-card','types-card','subjects-card'];
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

    yearSelect.reset('Select year\u2026');
    yearSelect.setItems(spec.years.map(y => ({ value: y.code, text: `Year ${y.year}` })));
    enableCard('year-card');

    if (spec.years.length === 1) {
      yearSelect.selectItem(spec.years[0].code, `Year ${spec.years[0].year}`);
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
      if (!restoreFromURL()) {
        restoreState();
      }
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

  // --- Year custom select (fetch spec JSON on change) ---
  const yearSelect = setupCustomSelect('#year-trigger', '#year-list', '#year-select', function(code) {
    resetFrom('group-card');
    if (!code) return;

    groupSelect.reset('Loading\u2026');
    enableCard('group-card');

    fetch(`data/${code}.json`)
      .then(r => r.json())
      .then(data => {
        specData = data;
        groupSelect.reset('Select group\u2026');
        groupSelect.setItems(data.groups.map((g, i) => ({ value: i, text: `Group ${g.name}` })));
        if (window._urlState) {
          const us = window._urlState;
          if (us.groupIndex !== null && us.groupIndex !== undefined) {
            const gi = Number(us.groupIndex);
            if (data.groups[gi]) {
              groupSelect.selectItem(gi, `Group ${data.groups[gi].name}`);
            }
          }
          if (us.freq && us.freq !== 'all') {
            selectedFreq = us.freq;
            const freqRadio = $(`#freq-toggle input[value="${us.freq}"]`);
            if (freqRadio) freqRadio.checked = true;
          }
          // Apply subgroup + excluded after group cascade completes
          // The group selectItem will trigger group onChange which builds subgroup pills
          // We need to apply subgroup + excluded after that cascade
          setTimeout(() => {
            if (us.subgroup && us.subgroup !== 'all' && selectedGroup && selectedGroup.hasSubgroups) {
              const subRadio = $(`#subgroup-pills input[value="${us.subgroup}"]`);
              if (subRadio) {
                subRadio.checked = true;
                selectedSubgroup = us.subgroup;
              }
            }
            if (us.excluded && us.excluded.length) {
              const excSet = new Set(us.excluded);
              $$('#subject-list input[data-key]').forEach(cb => {
                if (excSet.has(cb.dataset.key)) cb.checked = false;
              });
              $$('#subject-list .subject-group').forEach(g => {
                const parentCb = g.querySelector('.subject-parent input');
                const childCbs = [...g.querySelectorAll('.subject-children input[data-key]')];
                if (parentCb && childCbs.length) syncParent(parentCb, childCbs);
              });
            }
            updatePreview();
            delete window._urlState;
          }, 100);
        }
        saveState();
      })
      .catch(() => {
        groupSelect.reset('Failed to load');
      });
  });

  // --- Group custom select ---
  const groupSelect = setupCustomSelect('#group-trigger', '#group-list', '#group-select', function(val) {
    resetFrom('subgroup-card');
    labSubgroupOverrides = {};
    if (val === '' || val == null || !specData) return;

    const group = specData.groups[val];
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
        span.textContent = v === 'all' ? 'Both' : `/${v}`;
        lbl.appendChild(inp);
        lbl.appendChild(span);
        pills.appendChild(lbl);
        inp.addEventListener('change', () => {
          selectedSubgroup = v;
          labSubgroupOverrides = {};
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

          // Inline subgroup mini-pills for Lab-only subjects when global is "Both"
          if (t === 'Laborator' && selectedSubgroup === 'all' && selectedGroup.hasSubgroups) {
            const pills = document.createElement('span');
            pills.className = 'sg-mini-pills';
            const current = labSubgroupOverrides[subj] || 'all';
            ['1', '2', 'all'].forEach(sv => {
              const btn = document.createElement('button');
              btn.type = 'button';
              btn.textContent = sv === 'all' ? 'Both' : `/${sv}`;
              if (sv === current) btn.classList.add('active');
              btn.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                labSubgroupOverrides[subj] = sv;
                pills.querySelectorAll('button').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                updatePreview();
              });
              pills.appendChild(btn);
            });
            lbl.appendChild(pills);
          }

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

          // Inline subgroup mini-pills for Lab when global is "Both"
          if (t === 'Laborator' && selectedSubgroup === 'all' && selectedGroup.hasSubgroups) {
            const pills = document.createElement('span');
            pills.className = 'sg-mini-pills';
            const current = labSubgroupOverrides[subj] || 'all';
            ['1', '2', 'all'].forEach(sv => {
              const btn = document.createElement('button');
              btn.type = 'button';
              btn.textContent = sv === 'all' ? 'Both' : `/${sv}`;
              if (sv === current) btn.classList.add('active');
              btn.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                labSubgroupOverrides[subj] = sv;
                pills.querySelectorAll('button').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                updatePreview();
              });
              pills.appendChild(btn);
            });
            lbl.appendChild(pills);
          }

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
        // Per-subject override takes priority over global
        const effectiveSub = (sub === 'all' && labSubgroupOverrides[e.subject])
          ? labSubgroupOverrides[e.subject]
          : sub;
        if (effectiveSub && effectiveSub !== 'all' && parts[1] !== effectiveSub) return false;
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

  function filterByFrequency(entries, freq) {
    if (freq === 'all') return entries;
    return entries.filter(e => e.frequency === 'every' || e.frequency === freq);
  }

  function detectOverlaps(events) {
    const sorted = events.slice().sort((a, b) => a.startHour - b.startHour || a.endHour - b.endHour);
    const columns = [];

    sorted.forEach(ev => {
      let placed = false;
      for (let c = 0; c < columns.length; c++) {
        const lastInCol = columns[c][columns[c].length - 1];
        if (lastInCol.endHour <= ev.startHour) {
          columns[c].push(ev);
          ev._col = c;
          placed = true;
          break;
        }
      }
      if (!placed) {
        ev._col = columns.length;
        columns.push([ev]);
      }
    });

    // Find max overlapping at each event's time range
    sorted.forEach(ev => {
      let maxCols = 0;
      sorted.forEach(other => {
        if (other.startHour < ev.endHour && other.endHour > ev.startHour) {
          maxCols = Math.max(maxCols, other._col + 1);
        }
      });
      ev._totalCols = maxCols;
    });

    return sorted;
  }

  function renderScheduleGrid() {
    const entries = getFilteredEntries();
    const count = entries.reduce((sum, e) => sum + e.dates.length, 0);
    $('#event-count').textContent = count;
    $('#download-btn').disabled = count === 0;
    $('#share-btn').disabled = count === 0;

    const filtered = filterByFrequency(entries, selectedFreq);

    const grid = $('#schedule-grid');
    const empty = $('#schedule-empty');

    if (!selectedGroup || filtered.length === 0) {
      grid.style.display = 'none';
      empty.style.display = 'flex';
      if (!selectedGroup) {
        empty.querySelector('p').textContent = 'Select a specialization, year, and group to see your schedule';
      } else {
        empty.querySelector('p').textContent = 'No events match your current filters';
      }
      return;
    }

    empty.style.display = 'none';
    grid.style.display = 'grid';
    grid.innerHTML = '';

    const isMobile = window.innerWidth <= 768;
    const daysToShow = isMobile ? [selectedMobileDay] : DAYS;
    const numDays = daysToShow.length;

    grid.style.gridTemplateColumns = `3rem repeat(${numDays}, 1fr)`;

    // Row 1: headers
    const corner = document.createElement('div');
    corner.className = 'grid-header grid-header-corner';
    grid.appendChild(corner);

    daysToShow.forEach((day, i) => {
      const hdr = document.createElement('div');
      hdr.className = 'grid-header';
      hdr.textContent = DAY_LABELS[DAYS.indexOf(day)];
      hdr.style.gridColumn = String(i + 2);
      grid.appendChild(hdr);
    });

    // Hour rows (include GRID_END for the final label + line)
    for (let h = GRID_START; h <= GRID_END; h++) {
      const rowIdx = (h - GRID_START) * 2 + 2;

      const label = document.createElement('div');
      label.className = 'grid-hour';
      label.textContent = `${h}:00`;
      label.style.gridRow = String(rowIdx);
      label.style.gridColumn = '1';
      grid.appendChild(label);

      const line = document.createElement('div');
      line.className = 'grid-line';
      line.style.gridRow = String(rowIdx);
      line.style.gridColumn = `2 / ${numDays + 2}`;
      grid.appendChild(line);

      // No half-hour line for the last hour
      if (h < GRID_END) {
        const halfLine = document.createElement('div');
        halfLine.className = 'grid-line-half';
        halfLine.style.gridRow = String(rowIdx + 1);
        halfLine.style.gridColumn = `2 / ${numDays + 2}`;
        grid.appendChild(halfLine);
      }
    }

    // Group entries by day
    const byDay = {};
    DAYS.forEach(d => { byDay[d] = []; });
    filtered.forEach(e => {
      if (byDay[e.day]) byDay[e.day].push(e);
    });

    // Render events
    daysToShow.forEach((day, dayIdx) => {
      const dayEvents = byDay[day];
      if (!dayEvents.length) return;

      const processed = detectOverlaps(dayEvents);

      processed.forEach(ev => {
        const startRow = (ev.startHour - GRID_START) * 2 + 2;
        const endRow = (ev.endHour - GRID_START) * 2 + 2;

        const el = document.createElement('div');
        const typeClass = ev.type === 'Curs' ? 'type-curs'
          : ev.type === 'Seminar' ? 'type-seminar' : 'type-laborator';
        el.className = `schedule-event ${typeClass}`;

        el.style.gridRow = `${startRow} / ${endRow}`;
        el.style.gridColumn = String(dayIdx + 2);

        if (ev._totalCols > 1) {
          const pct = 100 / ev._totalCols;
          el.style.width = `${pct}%`;
          el.style.marginLeft = `${ev._col * pct}%`;
        }

        const BADGE = { 'Curs': '[C]', 'Seminar': '[S]', 'Laborator': '[L]' };

        // Determine subgroup suffix if "Both" is selected and event is subgroup-specific
        let subgroupTag = '';
        if (selectedSubgroup === 'all' && ev.formation && ev.formation.includes('/')) {
          const sgPart = ev.formation.split('/')[1];
          if (sgPart === '1' || sgPart === '2') subgroupTag = ` /${sgPart}`;
        }

        const subjEl = document.createElement('div');
        subjEl.className = 'event-subject';
        subjEl.textContent = ev.subject;
        el.appendChild(subjEl);

        const metaEl = document.createElement('div');
        metaEl.className = 'event-meta';
        metaEl.textContent = `${BADGE[ev.type] || ''}${subgroupTag} ${ev.room || ''}`;
        el.appendChild(metaEl);

        el.title = `${ev.subject}\n${BADGE[ev.type] || ev.type}${subgroupTag} | ${ev.room || 'No room'}\n${ev.professor || ''}\n${ev.startHour}:00 - ${ev.endHour}:00`;

        grid.appendChild(el);
      });
    });

    saveState();
  }

  function updatePreview() {
    renderScheduleGrid();
  }

  // --- Frequency toggle ---
  $$('#freq-toggle input[type="radio"]').forEach(radio => {
    radio.addEventListener('change', () => {
      selectedFreq = radio.value;
      renderScheduleGrid();
    });
  });

  // --- Day tabs (mobile) ---
  $$('.day-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.day-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedMobileDay = btn.dataset.day;
      renderScheduleGrid();
    });
  });

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(renderScheduleGrid, 150);
  });

  // --- Bottom Sheet (mobile) ---
  function initBottomSheet() {
    const sheet = $('#bottom-sheet');
    const overlay = $('#bottom-sheet-overlay');
    const peek = $('#bottom-sheet-peek');
    const peekText = $('#bottom-sheet-peek-text');
    const content = $('#bottom-sheet-content');

    if (!sheet) return;

    function updatePeekText() {
      const parts = [];
      const specIdx = $('#spec-select').value;
      if (specIdx !== '' && indexData && indexData.specs[specIdx]) {
        const specName = indexData.specs[specIdx].name;
        parts.push(specName.length > 20 ? specName.substring(0, 20) + '...' : specName);
      }
      const yearCode = $('#year-select').value;
      if (yearCode) parts.push(yearCode);
      if (selectedGroup) parts.push('G' + selectedGroup.name);
      if (selectedSubgroup !== 'all') parts.push('/' + selectedSubgroup);

      peekText.textContent = parts.length ? parts.join(' > ') : 'Select options...';
    }

    function expand() {
      sheet.classList.add('expanded');
      overlay.classList.add('visible');
      const panel = $('#controls-panel');
      if (panel && content.children.length === 0) {
        Array.from(panel.children).forEach(card => {
          content.appendChild(card);
        });
      }
    }

    function collapse() {
      sheet.classList.remove('expanded');
      overlay.classList.remove('visible');
      const panel = $('#controls-panel');
      if (panel && content.children.length > 0) {
        Array.from(content.children).forEach(card => {
          panel.appendChild(card);
        });
      }
      updatePeekText();
    }

    peek.addEventListener('click', () => {
      if (sheet.classList.contains('expanded')) {
        collapse();
      } else {
        expand();
      }
    });

    overlay.addEventListener('click', collapse);

    let startY = 0;
    const handle = sheet.querySelector('.bottom-sheet-handle');
    if (handle) {
      handle.addEventListener('touchstart', e => {
        startY = e.touches[0].clientY;
      }, { passive: true });

      handle.addEventListener('touchmove', e => {
        const dy = e.touches[0].clientY - startY;
        if (dy > 80) collapse();
      }, { passive: true });
    }

    window._updateBottomSheetPeek = updatePeekText;
  }

  initBottomSheet();

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
      state.labSubgroupOverrides = labSubgroupOverrides;
      localStorage.setItem('fmi-cal-state', JSON.stringify(state));
      if (window._updateBottomSheetPeek) window._updateBottomSheetPeek();
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
      yearSelect.setItems(spec.years.map(y => ({ value: y.code, text: `Year ${y.year}` })));
      enableCard('year-card');

      // Validate yearCode
      if (!state.yearCode || !spec.years.some(y => y.code === state.yearCode)) {
        restoring = false;
        return;
      }
      yearSelect.setValue(state.yearCode);

      // Fetch year data
      fetch(`data/${state.yearCode}.json`)
        .then(r => r.json())
        .then(data => {
          specData = data;

          // Populate group options
          groupSelect.setItems(data.groups.map((g, i) => ({ value: i, text: `Group ${g.name}` })));
          enableCard('group-card');

          // Validate groupIndex
          const gi = state.groupIndex;
          if (gi === '' || gi === null || gi === undefined || !data.groups[gi]) {
            restoring = false;
            return;
          }
          groupSelect.setValue(gi);
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
              span.textContent = v === 'all' ? 'Both' : `/${v}`;
              lbl.appendChild(inp);
              lbl.appendChild(span);
              pills.appendChild(lbl);
              inp.addEventListener('change', () => {
                selectedSubgroup = v;
                labSubgroupOverrides = {};
                updateSubjects();
                updatePreview();
              });
            });
            selectedSubgroup = savedSub;
            if (state.labSubgroupOverrides) {
              labSubgroupOverrides = state.labSubgroupOverrides;
            }
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

  // --- Shareable URLs ---
  function encodeStateToURL() {
    const specIdx = $('#spec-select').value;
    if (specIdx === '' || specIdx == null) return;

    const yearCode = $('#year-select').value;
    if (!yearCode) return;

    const params = new URLSearchParams();
    params.set('spec', yearCode);
    const groupIdx = $('#group-select').value;
    if (groupIdx !== '' && groupIdx != null) {
      params.set('group', groupIdx);
      if (selectedSubgroup !== 'all') params.set('sub', selectedSubgroup);
    }
    if (selectedFreq !== 'all') params.set('freq', selectedFreq);

    const excluded = [];
    $$('#subject-list input[data-key]').forEach(cb => {
      if (!cb.checked) excluded.push(cb.dataset.key);
    });
    if (excluded.length) params.set('excl', excluded.join(','));

    return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
  }

  function decodeStateFromURL() {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('spec')) return null;
    return {
      yearCode: params.get('spec'),
      groupIndex: params.get('group'),
      subgroup: params.get('sub') || 'all',
      freq: params.get('freq') || 'all',
      excluded: params.get('excl') ? params.get('excl').split(',') : [],
    };
  }

  // Share button handler
  $('#share-btn').addEventListener('click', () => {
    const url = encodeStateToURL();
    if (!url) return;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => {
        const btn = $('#share-btn');
        const orig = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = orig; }, 2000);
      });
    }
  });

  // Restore from URL (takes priority over localStorage)
  function restoreFromURL() {
    const state = decodeStateFromURL();
    if (!state || !indexData) return false;

    let specIndex = null;
    for (let i = 0; i < indexData.specs.length; i++) {
      if (indexData.specs[i].years.some(y => y.code === state.yearCode)) {
        specIndex = i;
        break;
      }
    }
    if (specIndex === null) return false;

    window._urlState = state;
    selectSpec(specIndex, indexData.specs[specIndex].name);
    return true;
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
