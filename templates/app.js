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
  let restoring = false;
  let selectedFreq = 'current';
  let selectedMobileDay = 'Luni';
  let roomLegend = {};  // { roomCode: "Full location string" }

  // --- Per-calendar state ---
  function createCalendarState(id) {
    return {
      id: id,
      specIndex: null,
      yearCode: null,
      groupIndex: null,
      subgroup: 'all',
      uncheckedTypes: [],
      excludedSubjects: [],
      labSubgroupOverrides: {},
      yearData: null,   // was global specData
      group: null,       // was global selectedGroup
      panel: null,
      yearSelect: null,
      groupSelect: null,
    };
  }

  var MAX_CALENDARS = 5;
  let nextCalId = 1;
  let calendars = [createCalendarState(0)];

  function getCal(calId) {
    return calendars.find(function(c) { return c.id === calId; });
  }

  function calQ(calId, selector) {
    return getCal(calId).panel.querySelector(selector);
  }

  function calQAll(calId, selector) {
    return getCal(calId).panel.querySelectorAll(selector);
  }

  let _lastView = 'empty'; // 'empty' | 'grid'
  const DAYS = ['Luni', 'Marti', 'Miercuri', 'Joi', 'Vineri'];
  const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const GRID_START = 8;
  const GRID_END = 20;

  function resolveCurrentWeek() {
    var weeks = window.__teachingWeeks;
    if (!weeks || !weeks.length) return null;
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    for (var i = 0; i < weeks.length; i++) {
      var parts = weeks[i].monday.split('-');
      var monday = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      var sunday = new Date(monday);
      sunday.setDate(sunday.getDate() + 6);
      if (today >= monday && today <= sunday) {
        return weeks[i].week % 2 === 1 ? 'sapt. 1' : 'sapt. 2';
      }
    }
    return null;
  }

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
  function setupCustomSelect(triggerEl, listEl, hiddenEl, onChange) {
    const trigger = triggerEl;
    const list = listEl;
    const hidden = hiddenEl;
    let hlIdx = -1;

    function open() { list.classList.remove('closing'); list.classList.add('open'); }
    function close() {
      if (!list.classList.contains('open')) return;
      list.classList.remove('open');
      list.classList.add('closing');
      hlIdx = -1;
      list.querySelectorAll('li').forEach(li => li.classList.remove('highlighted'));
      list.addEventListener('animationend', function handler() {
        list.removeEventListener('animationend', handler);
        list.classList.remove('closing');
      });
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
  function enableCard(calId, cls) { calQ(calId, '.' + cls).classList.remove('disabled'); }
  function disableCard(calId, cls) { calQ(calId, '.' + cls).classList.add('disabled'); }

  function resetFrom(calId, step) {
    var cal = getCal(calId);
    const order = ['year-card','group-card','subgroup-card','types-card','subjects-card'];
    const idx = order.indexOf(step);
    for (let i = idx; i < order.length; i++) disableCard(calId, order[i]);
    // Null state that belongs to the reset level or below
    if (idx <= order.indexOf('group-card')) cal.yearData = null;
    if (idx <= order.indexOf('subgroup-card')) {
      cal.group = null;
      cal.subgroup = 'all';
      cal.labSubgroupOverrides = {};
    }
    // Reset types to all checked
    if (idx <= order.indexOf('types-card')) {
      calQAll(calId, '.types-card input[type="checkbox"]').forEach(cb => { cb.checked = true; });
    }
    // Clear subject list
    if (idx <= order.indexOf('subjects-card')) {
      calQ(calId, '.subject-list').innerHTML = '';
    }
    // Clear schedule grid
    renderScheduleGrid();
  }

  // --- Spec change ---
  function onSpecChange(calId, specIndex) {
    resetFrom(calId, 'year-card');
    if (specIndex === '' || specIndex == null) return;

    const spec = indexData.specs[specIndex];
    if (!spec) return;

    calQ(calId, '.spec-select').value = specIndex;

    var calYearSelect = getCal(calId).yearSelect;
    calYearSelect.reset('Select year\u2026');
    calYearSelect.setItems(spec.years.map(y => ({ value: y.code, text: `Year ${y.year}` })));
    enableCard(calId, 'year-card');

    if (spec.years.length === 1) {
      calYearSelect.selectItem(spec.years[0].code, `Year ${spec.years[0].year}`);
    }
    saveState();
  }

  // --- Load index + combobox ---
  let comboboxItems = [];
  var comboboxHighlightIdx = {}; // per-calendar highlighted index for combobox
  const CAL0 = 0; // default calendar id

  function renderList(calId, filter) {
    const list = calQ(calId, '.spec-list');
    list.innerHTML = '';
    comboboxHighlightIdx[calId] = -1;
    comboboxItems.forEach((item, i) => {
      if (filter && !fuzzyMatch(item.name, filter)) return;
      const li = document.createElement('li');
      li.textContent = item.name;
      li.dataset.index = item.index;
      if (String(item.index) === calQ(calId, '.spec-select').value) li.classList.add('selected');
      li.addEventListener('mousedown', e => {
        e.preventDefault();
        selectSpec(calId, item.index, item.name);
      });
      list.appendChild(li);
    });
  }

  function openList(calId) {
    const list = calQ(calId, '.spec-list');
    list.classList.remove('closing');
    list.classList.add('open');
  }
  function closeList(calId) {
    const list = calQ(calId, '.spec-list');
    if (!list.classList.contains('open')) return;
    list.classList.remove('open');
    list.classList.add('closing');
    comboboxHighlightIdx[calId] = -1;
    list.querySelectorAll('li').forEach(li => li.classList.remove('highlighted'));
    list.addEventListener('animationend', function handler() {
      list.removeEventListener('animationend', handler);
      list.classList.remove('closing');
    });
  }

  function selectSpec(calId, index, name) {
    calQ(calId, '.spec-select').value = index;
    calQ(calId, '.spec-input').value = name;
    closeList(calId);
    onSpecChange(calId, index);
  }

  // --- Dynamic panel creation ---
  function createCalendarPanel(calId) {
    var cal = getCal(calId);
    var displayNum = calId + 1;

    // Outer wrapper
    var wrapper = document.createElement('div');
    wrapper.className = 'calendar-accordion';
    wrapper.dataset.calId = String(calId);

    // Accordion header
    var header = document.createElement('div');
    header.className = 'cal-accordion-header';

    var title = document.createElement('span');
    title.className = 'cal-accordion-title';
    title.textContent = 'Calendar ' + displayNum;

    var summary = document.createElement('span');
    summary.className = 'cal-accordion-summary';
    summary.textContent = '';

    var chevron = document.createElement('span');
    chevron.className = 'cal-accordion-chevron';
    chevron.innerHTML = '&#x25BC;';

    header.appendChild(title);
    header.appendChild(summary);
    header.appendChild(chevron);

    // Remove button (hidden for calId 0)
    if (calId !== 0) {
      var removeBtn = document.createElement('button');
      removeBtn.className = 'cal-remove-btn';
      removeBtn.type = 'button';
      removeBtn.innerHTML = '&times;';
      removeBtn.title = 'Remove calendar';
      removeBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        removeCalendar(calId);
      });
      header.appendChild(removeBtn);
    }

    header.addEventListener('click', function() { toggleAccordion(calId); });

    wrapper.appendChild(header);

    // Accordion body
    var body = document.createElement('div');
    body.className = 'cal-accordion-body';

    // 1. Spec card
    var specCard = document.createElement('div');
    specCard.className = 'card spec-card';
    specCard.innerHTML =
      '<h3>Specialization</h3>' +
      '<div class="combobox spec-combobox">' +
        '<input type="text" class="spec-input" placeholder="Loading&hellip;" autocomplete="off" />' +
        '<ul class="combobox-list spec-list"></ul>' +
        '<input type="hidden" class="spec-select" value="" />' +
      '</div>';
    body.appendChild(specCard);

    // 2. Year card
    var yearCard = document.createElement('div');
    yearCard.className = 'card disabled year-card';
    yearCard.innerHTML =
      '<h3>Year</h3>' +
      '<div class="custom-select">' +
        '<button class="custom-select-trigger year-trigger" type="button">Pick a specialization first</button>' +
        '<ul class="custom-select-list year-list"></ul>' +
        '<input type="hidden" class="year-select" value="" />' +
      '</div>';
    body.appendChild(yearCard);

    // 3. Group card
    var groupCard = document.createElement('div');
    groupCard.className = 'card disabled group-card';
    groupCard.innerHTML =
      '<h3>Group</h3>' +
      '<div class="custom-select">' +
        '<button class="custom-select-trigger group-trigger" type="button">Pick a year first</button>' +
        '<ul class="custom-select-list group-list"></ul>' +
        '<input type="hidden" class="group-select" value="" />' +
      '</div>';
    body.appendChild(groupCard);

    // 4. Subgroup card
    var subgroupCard = document.createElement('div');
    subgroupCard.className = 'card disabled subgroup-card';
    subgroupCard.innerHTML =
      '<h3>Subgroup</h3>' +
      '<div class="pill-group subgroup-pills"></div>';
    body.appendChild(subgroupCard);

    // 5. Types card
    var typesCard = document.createElement('div');
    typesCard.className = 'card disabled types-card';
    typesCard.innerHTML =
      '<h3>Event Types</h3>' +
      '<div class="pill-group">' +
        '<label><input type="checkbox" data-type="Curs" checked><span>Courses</span></label>' +
        '<label><input type="checkbox" data-type="Seminar" checked><span>Seminars</span></label>' +
        '<label><input type="checkbox" data-type="Laborator" checked><span>Labs</span></label>' +
      '</div>';
    body.appendChild(typesCard);

    // 6. Subjects card
    var subjectsCard = document.createElement('div');
    subjectsCard.className = 'card disabled subjects-card';
    subjectsCard.innerHTML =
      '<div class="filter-header">' +
        '<h3>Subjects</h3>' +
        '<button class="toggle-subjects-btn">Deselect all</button>' +
      '</div>' +
      '<input type="text" class="subject-search" placeholder="Filter subjects&hellip;" autocomplete="off" aria-label="Filter subjects" />' +
      '<div class="check-group subject-list"></div>';
    body.appendChild(subjectsCard);

    wrapper.appendChild(body);

    // Store panel reference
    cal.panel = wrapper;

    // Wire up all controls scoped to this panel
    cal.yearSelect = setupYearSelect(calId);
    cal.groupSelect = setupGroupSelect(calId);
    setupCombobox(calId);
    setupTypeToggles(calId);
    setupToggleSubjectsBtn(calId);
    setupSubjectSearch(calId);

    return wrapper;
  }

  // --- Accordion functions ---
  function expandAccordion(calId) {
    var cal = getCal(calId);
    if (cal && cal.panel) cal.panel.classList.remove('collapsed');
  }

  function collapseAccordion(calId) {
    var cal = getCal(calId);
    if (cal && cal.panel) cal.panel.classList.add('collapsed');
  }

  function collapseAllButFirst() {
    if (calendars.length > 1) {
      calendars.forEach(function(c, i) {
        if (i === 0) expandAccordion(c.id);
        else collapseAccordion(c.id);
      });
    }
  }

  function toggleAccordion(calId) {
    var cal = getCal(calId);
    if (cal && cal.panel) {
      cal.panel.classList.toggle('collapsed');
    }
  }

  function updateAccordionSummary(calId) {
    var cal = getCal(calId);
    if (!cal || !cal.panel) return;
    var summaryEl = cal.panel.querySelector('.cal-accordion-summary');
    if (!summaryEl) return;

    var parts = [];
    var specIdx = calQ(calId, '.spec-select').value;
    if (specIdx !== '' && indexData && indexData.specs[specIdx]) {
      var specName = indexData.specs[specIdx].name;
      parts.push(specName.length > 16 ? specName.substring(0, 16) + '\u2026' : specName);
    }
    var yearCode = calQ(calId, '.year-select').value;
    if (yearCode) parts.push(yearCode);
    if (cal.group) parts.push('G' + cal.group.name);
    if (cal.subgroup !== 'all') parts.push('/' + cal.subgroup);

    summaryEl.textContent = parts.length ? parts.join(' \u203A ') : '';
  }

  // --- Add calendar handler ---
  function addCalendar() {
    if (calendars.length >= MAX_CALENDARS) return;

    var newId = nextCalId++;
    var newCal = createCalendarState(newId);
    calendars.push(newCal);

    var container = document.getElementById('calendars-container');
    var panel = createCalendarPanel(newId);
    container.appendChild(panel);

    // Collapse all others, expand new one
    calendars.forEach(function(c) {
      if (c.id !== newId) collapseAccordion(c.id);
    });
    expandAccordion(newId);

    // Populate spec list from indexData
    if (indexData) {
      renderList(newId, '');
      calQ(newId, '.spec-input').placeholder = 'Select specialization\u2026';
    }

    // Disable add button if at max
    document.getElementById('add-calendar-btn').disabled = calendars.length >= MAX_CALENDARS;

    saveState();
  }

  // --- Remove calendar handler ---
  function removeCalendar(calId) {
    if (calId === 0) return; // Cannot remove primary
    var cal = getCal(calId);
    if (!cal) return;

    // Remove panel from DOM
    if (cal.panel && cal.panel.parentNode) {
      cal.panel.parentNode.removeChild(cal.panel);
    }

    // Clean up per-calendar tracking
    delete comboboxHighlightIdx[calId];

    // Filter out from calendars array
    calendars = calendars.filter(function(c) { return c.id !== calId; });

    // Re-enable add button if under cap
    document.getElementById('add-calendar-btn').disabled = calendars.length >= MAX_CALENDARS;

    updatePreview();
    saveState();
  }

  // --- Initialize calendar 0 panel ---
  var container = document.getElementById('calendars-container');
  var cal0Panel = createCalendarPanel(CAL0);
  container.appendChild(cal0Panel);

  // Add Calendar button handler
  document.getElementById('add-calendar-btn').addEventListener('click', addCalendar);

  fetch('data/index.json')
    .then(r => r.json())
    .then(data => {
      indexData = data;
      comboboxItems = data.specs.map((s, i) => ({ name: s.name, index: i }));
      calQ(CAL0, '.spec-input').placeholder = 'Select specialization\u2026';
      renderList(CAL0, '');
      if (!restoreFromURL()) {
        restoreState();
      }
    })
    .catch(() => {
      calQ(CAL0, '.spec-input').placeholder = 'Failed to load data';
      calQ(CAL0, '.spec-input').disabled = true;
    });

  // Fetch room legend (non-blocking, enriches ICS and tooltips)
  fetch('data/rooms.json')
    .then(r => r.json())
    .then(data => { roomLegend = data; })
    .catch(() => {});

  // --- Combobox events ---
  function setupCombobox(calId) {
    const specInput = calQ(calId, '.spec-input');
    let blurTimeout = null;

    specInput.addEventListener('focus', () => {
      if (blurTimeout) clearTimeout(blurTimeout);
      specInput.select();
      renderList(calId, specInput.value);
      openList(calId);
    });

    specInput.addEventListener('input', () => {
      renderList(calId, specInput.value);
      openList(calId);
    });

    specInput.addEventListener('blur', () => {
      blurTimeout = setTimeout(() => {
        closeList(calId);
        // Revert text to current selection
        const idx = calQ(calId, '.spec-select').value;
        if (idx !== '' && indexData && indexData.specs[idx]) {
          specInput.value = indexData.specs[idx].name;
        } else {
          specInput.value = '';
        }
      }, 150);
    });

    specInput.addEventListener('keydown', e => {
      const items = calQ(calId, '.spec-list').querySelectorAll('li');
      if (!items.length) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        var cur = comboboxHighlightIdx[calId] != null ? comboboxHighlightIdx[calId] : -1;
        comboboxHighlightIdx[calId] = Math.min(cur + 1, items.length - 1);
        items.forEach((li, i) => li.classList.toggle('highlighted', i === comboboxHighlightIdx[calId]));
        items[comboboxHighlightIdx[calId]].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        var cur2 = comboboxHighlightIdx[calId] != null ? comboboxHighlightIdx[calId] : -1;
        comboboxHighlightIdx[calId] = Math.max(cur2 - 1, -1);
        items.forEach((li, i) => li.classList.toggle('highlighted', i === comboboxHighlightIdx[calId]));
        if (comboboxHighlightIdx[calId] >= 0) items[comboboxHighlightIdx[calId]].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        var hlIdx = comboboxHighlightIdx[calId] != null ? comboboxHighlightIdx[calId] : -1;
        if (hlIdx >= 0 && hlIdx < items.length) {
          const li = items[hlIdx];
          selectSpec(calId, Number(li.dataset.index), li.textContent);
        }
      } else if (e.key === 'Escape') {
        closeList(calId);
        specInput.blur();
      }
    });
  }

  // --- Year custom select (fetch spec JSON on change) ---
  function setupYearSelect(calId) {
    return setupCustomSelect(
      calQ(calId, '.year-trigger'), calQ(calId, '.year-list'), calQ(calId, '.year-select'),
      function(code) {
        var cal = getCal(calId);
        resetFrom(calId, 'group-card');
        if (!code) return;

        cal.groupSelect.reset('Loading\u2026');
        enableCard(calId, 'group-card');

        fetch(`data/${code}.json`)
          .then(r => r.json())
          .then(data => {
            cal.yearData = data;
            cal.groupSelect.reset('Select group\u2026');
            cal.groupSelect.setItems(data.groups.map((g, i) => ({ value: i, text: `Group ${g.name}` })));
            if (cal._urlState) {
              var us = cal._urlState;

              // Apply unchecked types before group selection triggers updateSubjects
              if (us.uncheckedTypes && us.uncheckedTypes.length) {
                calQAll(calId, '.types-card input[type="checkbox"]').forEach(function(cb) {
                  if (us.uncheckedTypes.includes(cb.dataset.type)) cb.checked = false;
                });
              }

              // Apply labSubgroupOverrides before group selection
              if (us.labSubgroupOverrides && Object.keys(us.labSubgroupOverrides).length) {
                cal.labSubgroupOverrides = us.labSubgroupOverrides;
              }

              if (us.groupIndex !== null && us.groupIndex !== undefined) {
                var gi = Number(us.groupIndex);
                if (data.groups[gi]) {
                  cal.groupSelect.selectItem(gi, 'Group ' + data.groups[gi].name);
                }
              }

              // Apply subgroup + excluded after group cascade completes
              setTimeout(function() {
                if (us.subgroup && us.subgroup !== 'all' && cal.group && cal.group.hasSubgroups) {
                  var subRadio = calQ(calId, '.subgroup-pills input[value="' + us.subgroup + '"]');
                  if (subRadio) {
                    subRadio.checked = true;
                    cal.subgroup = us.subgroup;
                  }
                }
                if (us.excluded && us.excluded.length) {
                  var excSet = new Set(us.excluded);
                  calQAll(calId, '.subject-list input[data-key]').forEach(function(cb) {
                    if (excSet.has(cb.dataset.key)) cb.checked = false;
                  });
                  calQAll(calId, '.subject-list .subject-group').forEach(function(g) {
                    var parentCb = g.querySelector('.subject-parent input');
                    var childCbs = Array.prototype.slice.call(g.querySelectorAll('.subject-children input[data-key]'));
                    if (parentCb && childCbs.length) syncParent(parentCb, childCbs);
                  });
                }
                if (!restoring) updatePreview();
                var doneFn = cal._urlRestoreDone;
                delete cal._urlState;
                delete cal._urlRestoreDone;
                if (doneFn) doneFn();
              }, 100);
            }
            if (!cal._urlState) saveState();
          })
          .catch(() => {
            cal.groupSelect.reset('Failed to load');
            if (cal._urlRestoreDone) {
              var doneFn = cal._urlRestoreDone;
              delete cal._urlState;
              delete cal._urlRestoreDone;
              doneFn();
            }
          });
      }
    );
  }

  // --- Group custom select ---
  function setupGroupSelect(calId) {
    return setupCustomSelect(
      calQ(calId, '.group-trigger'), calQ(calId, '.group-list'), calQ(calId, '.group-select'),
      function(val) {
        var cal = getCal(calId);
        resetFrom(calId, 'subgroup-card');
        cal.labSubgroupOverrides = {};
        if (val === '' || val == null || !cal.yearData) return;

        const group = cal.yearData.groups[val];
        cal.group = group;

        // Subgroup pills
        const pills = calQ(calId, '.subgroup-pills');
        pills.innerHTML = '';
        if (group.hasSubgroups) {
          ['1','2','all'].forEach(v => {
            const lbl = document.createElement('label');
            const inp = document.createElement('input');
            inp.type = 'radio';
            inp.name = 'subgroup-' + calId;
            inp.value = v;
            if (v === 'all') inp.checked = true;
            const span = document.createElement('span');
            span.textContent = v === 'all' ? 'Both' : `/${v}`;
            lbl.appendChild(inp);
            lbl.appendChild(span);
            pills.appendChild(lbl);
            inp.addEventListener('change', () => {
              cal.subgroup = v;
              cal.labSubgroupOverrides = {};
              updateSubjects(calId);
              updatePreview();
            });
          });
          cal.subgroup = 'all';
          enableCard(calId, 'subgroup-card');
        } else {
          cal.subgroup = 'all';
        }

        enableCard(calId, 'types-card');
        enableCard(calId, 'subjects-card');
        updateSubjects(calId);
        updatePreview();
        updateAccordionSummary(calId);
      }
    );
  }

  // --- Mini-pill disabled state ---
  function updateMiniPillsDisabled(calId) {
    calQAll(calId, '.sg-mini-pills').forEach(p => {
      const lbl = p.closest('label');
      const cb = lbl && lbl.querySelector('input[data-key]');
      p.classList.toggle('disabled', !!(cb && !cb.checked));
    });
  }

  // --- Type toggles (batch check/uncheck matching subject entries) ---
  function setupTypeToggles(calId) {
    calQAll(calId, '.types-card input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => {
        const t = cb.dataset.type;
        calQAll(calId, '.subject-list input[data-key]').forEach(sc => {
          if (sc.dataset.key.endsWith('|||' + t)) sc.checked = cb.checked;
        });
        // Sync all parent checkboxes
        calQAll(calId, '.subject-list .subject-group').forEach(g => {
          const parentCb = g.querySelector('.subject-parent input');
          const childCbs = [...g.querySelectorAll('.subject-children input[data-key]')];
          if (parentCb && childCbs.length) syncParent(parentCb, childCbs);
        });
        updateToggleBtn(calId);
        updatePreview();
      });
    });
  }

  // --- Subject list ---
  function getActiveTypes(calId) {
    const types = new Set();
    calQAll(calId, '.types-card input[type="checkbox"]').forEach(cb => {
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

  function updateSubjects(calId) {
    var cal = getCal(calId);
    if (!cal.group) return;

    const allTypes = new Set(['Curs', 'Seminar', 'Laborator']);
    const filtered = filterEntries(calId, cal.group, allTypes, new Set());

    // Build Map<subject, Set<type>>
    const subjTypes = new Map();
    filtered.forEach(e => {
      if (!subjTypes.has(e.subject)) subjTypes.set(e.subject, new Set());
      subjTypes.get(e.subject).add(e.type);
    });

    const list = calQ(calId, '.subject-list');
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
        cb.addEventListener('change', () => { updateToggleBtn(calId); updatePreview(); });
        const nameSpan = document.createElement('span');
        nameSpan.textContent = subj;
        const badgeSpan = document.createElement('span');
        badgeSpan.className = `type-badge ${badge[1]}`;
        badgeSpan.textContent = badge[0];
        lbl.appendChild(cb);
        lbl.appendChild(nameSpan);

          // Inline subgroup mini-pills for Lab-only subjects when global is "Both"
          if (t === 'Laborator' && cal.subgroup === 'all' && cal.group.hasSubgroups) {
            const pills = document.createElement('span');
            pills.className = 'sg-mini-pills';
            const current = cal.labSubgroupOverrides[subj] || 'all';
            ['1', '2', 'all'].forEach(sv => {
              const btn = document.createElement('button');
              btn.type = 'button';
              btn.textContent = sv === 'all' ? 'Both' : `/${sv}`;
              if (sv === current) btn.classList.add('active');
              btn.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                cal.labSubgroupOverrides[subj] = sv;
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
            updateToggleBtn(calId);
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
          if (t === 'Laborator' && cal.subgroup === 'all' && cal.group.hasSubgroups) {
            const pills = document.createElement('span');
            pills.className = 'sg-mini-pills';
            const current = cal.labSubgroupOverrides[subj] || 'all';
            ['1', '2', 'all'].forEach(sv => {
              const btn = document.createElement('button');
              btn.type = 'button';
              btn.textContent = sv === 'all' ? 'Both' : `/${sv}`;
              if (sv === current) btn.classList.add('active');
              btn.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                cal.labSubgroupOverrides[subj] = sv;
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
          updateToggleBtn(calId);
          updatePreview();
        });

        // Initial parent state
        syncParent(parentCb, childCbs);
      }
    });

    updateToggleBtn(calId);
    updateMiniPillsDisabled(calId);
    calQ(calId, '.subject-search').value = '';
  }

  function updateToggleBtn(calId) {
    const cbs = [...calQAll(calId, '.subject-list input[data-key]')].filter(
      cb => !cb.closest('label, .subject-group').classList.contains('filtered-out')
    );
    const allChecked = cbs.length > 0 && cbs.every(cb => cb.checked);
    calQ(calId, '.toggle-subjects-btn').textContent = allChecked ? 'Deselect all' : 'Select all';
  }

  function setupToggleSubjectsBtn(calId) {
    calQ(calId, '.toggle-subjects-btn').addEventListener('click', () => {
      const cbs = [...calQAll(calId, '.subject-list input[data-key]')].filter(
        cb => !cb.closest('label, .subject-group').classList.contains('filtered-out')
      );
      const allChecked = cbs.length > 0 && cbs.every(cb => cb.checked);
      cbs.forEach(cb => { cb.checked = !allChecked; });
      // Sync all parent checkboxes
      calQAll(calId, '.subject-list .subject-group').forEach(g => {
        const parentCb = g.querySelector('.subject-parent input');
        const childCbs = [...g.querySelectorAll('.subject-children input[data-key]')];
        if (parentCb && childCbs.length) syncParent(parentCb, childCbs);
      });
      updateToggleBtn(calId);
      updatePreview();
    });
  }

  // --- Subject search ---
  function setupSubjectSearch(calId) {
    calQ(calId, '.subject-search').addEventListener('input', function() {
      const q = this.value;
      // Filter grouped subjects
      calQAll(calId, '.subject-list .subject-group').forEach(g => {
        const name = g.querySelector('.subject-parent span').textContent;
        g.classList.toggle('filtered-out', !fuzzyMatch(name, q));
      });
      // Filter flat (single-type) labels
      calQ(calId, '.subject-list').querySelectorAll(':scope > label').forEach(lbl => {
        const spans = lbl.querySelectorAll('span');
        const name = spans.length ? spans[0].textContent : '';
        lbl.classList.toggle('filtered-out', !fuzzyMatch(name, q));
      });
      updateToggleBtn(calId);
    });
  }

  // --- Filtering ---
  function filterEntries(calId, group, types, excludedKeys) {
    var cal = getCal(calId);
    const gName = group.name;
    const sub = cal.subgroup;
    const overrides = cal.labSubgroupOverrides;
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
        const effectiveSub = (sub === 'all' && overrides[e.subject])
          ? overrides[e.subject]
          : sub;
        if (effectiveSub && effectiveSub !== 'all' && parts[1] !== effectiveSub) return false;
        return true;
      }
      return false;
    });
  }

  // --- Preview ---
  function getFilteredEntries(calId) {
    var cal = getCal(calId);
    if (!cal.group) return [];
    const allTypes = new Set(['Curs', 'Seminar', 'Laborator']);
    const excluded = new Set();
    calQAll(calId, '.subject-list input[data-key]').forEach(cb => {
      if (!cb.checked) excluded.add(cb.dataset.key);
    });
    return filterEntries(calId, cal.group, allTypes, excluded);
  }

  function deduplicateEntries(entries) {
    var seen = {};
    var result = [];
    entries.forEach(function(e) {
      var key = e.day + '-' + e.startHour + '-' + e.endHour + '-' + e.subject + '-' + e.type + '-' + e.formation + '-' + e.room;
      if (seen[key]) {
        // Merge calId into existing entry's _calIds
        if (seen[key]._calIds.indexOf(e._calId) === -1) {
          seen[key]._calIds.push(e._calId);
        }
      } else {
        e._calIds = [e._calId];
        seen[key] = e;
        result.push(e);
      }
    });
    return result;
  }

  function getAllFilteredEntries() {
    var all = [];
    calendars.forEach(function(cal) {
      if (!cal.group) return;
      var entries = getFilteredEntries(cal.id);
      entries.forEach(function(e) {
        var copy = Object.assign({}, e);
        copy._calId = cal.id;
        all.push(copy);
      });
    });
    return deduplicateEntries(all);
  }

  function filterByFrequency(entries, freq, cachedResolved) {
    if (freq === 'all') return entries;
    if (freq === 'current') {
      var resolved = cachedResolved !== undefined ? cachedResolved : resolveCurrentWeek();
      if (!resolved) return entries; // not a teaching week — show all
      return entries.filter(e => e.frequency === 'every' || e.frequency === resolved);
    }
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
    var anyGroup = calendars.some(function(c) { return c.group !== null; });
    const entries = getAllFilteredEntries();
    const count = entries.reduce((sum, e) => sum + e.dates.length, 0);
    $('#event-count').textContent = count;
    $('#download-btn').disabled = count === 0;
    $('#subscribe-btn').disabled = count === 0;
    $('#share-btn').disabled = count === 0;

    var currentWeekResolved = selectedFreq === 'current' ? resolveCurrentWeek() : null;
    const filtered = filterByFrequency(entries, selectedFreq, currentWeekResolved);

    // Non-teaching week banner
    var bannerEl = document.getElementById('non-teaching-banner');
    if (selectedFreq === 'current' && currentWeekResolved === null) {
      if (!bannerEl) {
        bannerEl = document.createElement('div');
        bannerEl.id = 'non-teaching-banner';
        bannerEl.className = 'non-teaching-banner';
        bannerEl.textContent = 'Not a teaching week \u2014 showing all events';
        var gridWrapper = document.getElementById('schedule-grid-wrapper');
        gridWrapper.parentNode.insertBefore(bannerEl, gridWrapper);
      }
    } else if (bannerEl) {
      bannerEl.remove();
    }

    const grid = $('#schedule-grid');
    const empty = $('#schedule-empty');

    if (!anyGroup || filtered.length === 0) {
      if (!anyGroup) {
        empty.querySelector('p').textContent = 'Select a specialization, year, and group to see your schedule';
      } else {
        empty.querySelector('p').textContent = 'No events match your current filters';
      }
      if (_lastView === 'grid') {
        grid.style.display = 'none';
        empty.style.display = 'flex';
        empty.classList.add('hidden');
        requestAnimationFrame(() => empty.classList.remove('hidden'));
      } else {
        grid.style.display = 'none';
        empty.style.display = 'flex';
      }
      _lastView = 'empty';
      return;
    }

    if (_lastView === 'empty') {
      empty.style.display = 'none';
      grid.style.display = 'grid';
      grid.classList.add('entering');
      requestAnimationFrame(() => grid.classList.remove('entering'));
    } else {
      empty.style.display = 'none';
      grid.style.display = 'grid';
    }
    _lastView = 'grid';
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
    let eventIdx = 0;
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
        const TYPE_LABEL = { 'Curs': 'Course', 'Seminar': 'Seminar', 'Laborator': 'Lab' };

        // Subject name
        const subjEl = document.createElement('div');
        subjEl.className = 'event-subject';
        subjEl.textContent = ev.subject;
        el.appendChild(subjEl);

        // Type + Room (same row)
        const metaEl = document.createElement('div');
        metaEl.className = 'event-meta';
        metaEl.textContent = `${BADGE[ev.type] || ''} ${ev.room || ''}`;
        el.appendChild(metaEl);

        // Subgroup (own row, only when any source calendar uses "Both" and event is subgroup-specific)
        let subgroupText = '';
        var showSubgroup = ev._calIds.some(function(cid) {
          var c = getCal(cid);
          return c && c.subgroup === 'all';
        });
        if (showSubgroup && ev.formation && ev.formation.includes('/')) {
          subgroupText = ev.formation;
          const sgEl = document.createElement('div');
          sgEl.className = 'event-meta';
          sgEl.textContent = subgroupText;
          el.appendChild(sgEl);
        }

        // Frequency (own row, only when viewing "All" and event is not every-week)
        let freqText = '';
        if ((selectedFreq === 'all' || selectedFreq === 'current') && ev.frequency && ev.frequency !== 'every') {
          freqText = ev.frequency === 'sapt. 1' ? 'Week 1' : 'Week 2';
          const freqEl = document.createElement('div');
          freqEl.className = 'event-meta';
          freqEl.textContent = freqText;
          el.appendChild(freqEl);
        }

        const roomDisplay = ev.room || 'No room';
        const roomDetail = (ev.room && roomLegend[ev.room]) ? `\n${roomLegend[ev.room]}` : '';
        let calSourceText = '';
        if (calendars.length > 1 && ev._calIds && ev._calIds.length) {
          calSourceText = '\n' + ev._calIds.map(function(cid) { return 'Calendar ' + (cid + 1); }).join(', ');
        }
        const titleText = `${ev.subject}\n${TYPE_LABEL[ev.type] || ev.type} | ${roomDisplay}${roomDetail}${subgroupText ? '\n' + subgroupText : ''}${freqText ? '\n' + freqText : ''}\n${ev.professor || ''}\n${ev.startHour}:00 - ${ev.endHour}:00${calSourceText}`;
        if ('ontouchstart' in window) el.title = titleText;
        el.dataset.popup = titleText;

        el.style.animationDelay = `${Math.min(eventIdx * 20, 300)}ms`;
        eventIdx++;

        grid.appendChild(el);
      });
    });

    // Disable entrance animations after they finish (prevents replay on scroll)
    setTimeout(() => grid.classList.add('settled'), 500);

    saveState();
  }

  // --- Event popup (hover on desktop, tap on mobile) ---
  let activePopup = null;
  let hoveredEvent = null;

  function removePopupNow() {
    if (!activePopup) return;
    activePopup.remove();
    activePopup = null;
  }

  function dismissPopupAnimated() {
    if (!activePopup) return;
    const popup = activePopup;
    activePopup = null;
    popup.classList.add('dismissing');
    const fallback = setTimeout(() => popup.remove(), 200);
    popup.addEventListener('transitionend', function handler() {
      clearTimeout(fallback);
      popup.removeEventListener('transitionend', handler);
      popup.remove();
    });
  }

  function showEventPopup(target) {
    removePopupNow();
    const popup = document.createElement('div');
    popup.className = 'event-popup';
    popup.textContent = target.dataset.popup;
    document.body.appendChild(popup);
    const rect = target.getBoundingClientRect();
    const pw = popup.offsetWidth;
    const ph = popup.offsetHeight;
    let left = rect.left + rect.width / 2 - pw / 2;
    let top = rect.bottom + 8;
    if (left < 8) left = 8;
    if (left + pw > window.innerWidth - 8) left = window.innerWidth - 8 - pw;
    if (top + ph > window.innerHeight - 8) top = rect.top - ph - 8;
    popup.style.left = left + 'px';
    popup.style.top = top + 'px';
    activePopup = popup;
  }

  // Mobile: tap to show popup
  document.addEventListener('click', function(e) {
    const ev = e.target.closest('.schedule-event');
    if (!ev) { dismissPopupAnimated(); return; }
    if (!('ontouchstart' in window)) return;
    e.preventDefault();
    showEventPopup(ev);
  });

  // Desktop: hover to show popup
  const gridWrapper = document.querySelector('.schedule-grid-wrapper');
  if (gridWrapper) {
    gridWrapper.addEventListener('mouseover', function(e) {
      if ('ontouchstart' in window) return;
      const ev = e.target.closest('.schedule-event');
      if (ev === hoveredEvent) return;
      hoveredEvent = ev;
      if (ev) {
        showEventPopup(ev);
      } else {
        removePopupNow();
      }
    });

    gridWrapper.addEventListener('mouseleave', function() {
      if ('ontouchstart' in window) return;
      hoveredEvent = null;
      dismissPopupAnimated();
    });
  }

  // Dismiss popup on scroll (prevents stale popups after scrolling away)
  window.addEventListener('scroll', function() {
    if (activePopup) removePopupNow();
    hoveredEvent = null;
  }, { passive: true });

  function updatePreview() {
    calendars.forEach(function(cal) {
      if (cal.group) updateMiniPillsDisabled(cal.id);
      updateAccordionSummary(cal.id);
    });
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
    const header = $('#bottom-sheet-header');
    const peekText = $('#bottom-sheet-peek-text');
    const content = $('#bottom-sheet-content');

    if (!sheet) return;

    function updatePeekText() {
      // Count how many calendars have a spec selected (i.e. are "configured")
      var configuredCount = calendars.filter(function(c) {
        var specVal = calQ(c.id, '.spec-select').value;
        return specVal !== '';
      }).length;

      if (configuredCount > 1) {
        peekText.textContent = configuredCount + ' calendars configured';
      } else if (configuredCount === 1) {
        // Show detail for the single configured calendar (may be any id)
        var configured = calendars.find(function(c) {
          return calQ(c.id, '.spec-select').value !== '';
        });
        var calId = configured.id;
        var cal = getCal(calId);
        var parts = [];
        var specIdx = calQ(calId, '.spec-select').value;
        if (specIdx !== '' && indexData && indexData.specs[specIdx]) {
          var specName = indexData.specs[specIdx].name;
          parts.push(specName.length > 20 ? specName.substring(0, 20) + '...' : specName);
        }
        var yearCode = calQ(calId, '.year-select').value;
        if (yearCode) parts.push(yearCode);
        if (cal.group) parts.push('G' + cal.group.name);
        if (cal.subgroup !== 'all') parts.push('/' + cal.subgroup);
        peekText.textContent = parts.length ? parts.join(' \u203A ') : 'Select options...';
      } else {
        peekText.textContent = 'Select options...';
      }
    }

    function expand() {
      sheet.classList.add('expanded');
      overlay.classList.add('visible');
      const panel = $('#controls-panel');
      if (panel && content.children.length === 0) {
        var calContainer = document.getElementById('calendars-container');
        var addBtn = document.getElementById('add-calendar-btn');
        if (calContainer) content.appendChild(calContainer);
        if (addBtn) content.appendChild(addBtn);
      }
      // Move schedule actions into bottom sheet on mobile
      var actions = document.querySelector('.schedule-actions');
      if (actions && !content.contains(actions)) {
        content.appendChild(actions);
        actions.style.display = 'flex';
      }
    }

    function collapse() {
      sheet.classList.remove('expanded');
      overlay.classList.remove('visible');
      updatePeekText();
      // Move elements back after slide-out animation finishes
      function onDone() {
        sheet.removeEventListener('transitionend', onDone);
        if (sheet.classList.contains('expanded')) return; // re-expanded during animation
        const panel = $('#controls-panel');
        if (panel && content.children.length > 0) {
          var calContainer = content.querySelector('#calendars-container');
          var addBtn = content.querySelector('#add-calendar-btn');
          if (calContainer) panel.appendChild(calContainer);
          if (addBtn) panel.appendChild(addBtn);
        }
        // Move schedule actions back to schedule panel
        var actions = content.querySelector('.schedule-actions');
        if (actions) {
          var schedulePanel = document.getElementById('schedule-panel');
          if (schedulePanel) {
            schedulePanel.appendChild(actions);
            actions.style.display = '';
          }
        }
      }
      sheet.addEventListener('transitionend', onDone);
    }

    // Tap header to toggle
    header.addEventListener('click', () => {
      if (sheet.classList.contains('expanded')) collapse();
      else expand();
    });

    overlay.addEventListener('click', collapse);

    // Swipe on header to expand/collapse
    let startY = 0;
    let tracking = false;

    header.addEventListener('touchstart', e => {
      startY = e.touches[0].clientY;
      tracking = true;
    }, { passive: true });

    header.addEventListener('touchmove', e => {
      if (!tracking) return;
      const dy = e.touches[0].clientY - startY;
      const isExpanded = sheet.classList.contains('expanded');
      if (isExpanded && dy > 50) { collapse(); tracking = false; }
      if (!isExpanded && dy < -50) { expand(); tracking = false; }
    }, { passive: true });

    header.addEventListener('touchend', () => { tracking = false; }, { passive: true });

    window._updateBottomSheetPeek = updatePeekText;
  }

  initBottomSheet();

  // Auto-select current day on mobile
  (function() {
    if (window.innerWidth > 768) return;
    var jsDay = new Date().getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    var dayMap = { 1: 'Luni', 2: 'Marti', 3: 'Miercuri', 4: 'Joi', 5: 'Vineri' };
    var today = dayMap[jsDay] || 'Luni'; // weekends default to Monday
    selectedMobileDay = today;
    document.querySelectorAll('.day-tab').forEach(function(btn) {
      btn.classList.toggle('active', btn.dataset.day === today);
    });
  })();

  // --- Persistence ---
  function syncCalStateFromDOM(calId) {
    var cal = getCal(calId);
    var state = {};
    state.specIndex = calQ(calId, '.spec-select').value;
    state.yearCode = calQ(calId, '.year-select').value;
    state.groupIndex = calQ(calId, '.group-select').value;
    state.subgroup = cal.subgroup;
    state.uncheckedTypes = [];
    calQAll(calId, '.types-card input[type="checkbox"]').forEach(function(cb) {
      if (!cb.checked) state.uncheckedTypes.push(cb.dataset.type);
    });
    state.excludedKeys = [];
    calQAll(calId, '.subject-list input[data-key]').forEach(function(cb) {
      if (!cb.checked) state.excludedKeys.push(cb.dataset.key);
    });
    state.labSubgroupOverrides = cal.labSubgroupOverrides;
    return state;
  }

  function saveState() {
    if (restoring) return;
    try {
      var calStates = calendars.map(function(cal) {
        return syncCalStateFromDOM(cal.id);
      });
      var payload = { v: 2, calendars: calStates, freq: selectedFreq };
      localStorage.setItem('fmi-cal-state', JSON.stringify(payload));
      if (window._updateBottomSheetPeek) window._updateBottomSheetPeek();
      calendars.forEach(function(c) { updateAccordionSummary(c.id); });
    } catch (e) {}
  }

  function restoreCalendar(calId, state, onDone) {
    if (!state || state.specIndex === '' || state.specIndex == null) {
      if (onDone) onDone();
      return;
    }
    if (!indexData.specs[state.specIndex]) {
      if (onDone) onDone();
      return;
    }

    var cal = getCal(calId);
    var spec = indexData.specs[state.specIndex];
    calQ(calId, '.spec-select').value = state.specIndex;
    calQ(calId, '.spec-input').value = spec.name;

    // Populate year options (same as onSpecChange)
    cal.yearSelect.setItems(spec.years.map(function(y) { return { value: y.code, text: 'Year ' + y.year }; }));
    enableCard(calId, 'year-card');

    // Validate yearCode
    if (!state.yearCode || !spec.years.some(function(y) { return y.code === state.yearCode; })) {
      if (onDone) onDone();
      return;
    }
    cal.yearSelect.setValue(state.yearCode);

    // Fetch year data
    fetch('data/' + state.yearCode + '.json')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        cal.yearData = data;

        // Populate group options
        cal.groupSelect.setItems(data.groups.map(function(g, i) { return { value: i, text: 'Group ' + g.name }; }));
        enableCard(calId, 'group-card');

        // Validate groupIndex
        var gi = state.groupIndex;
        if (gi === '' || gi === null || gi === undefined || !data.groups[gi]) {
          if (onDone) onDone();
          return;
        }
        cal.groupSelect.setValue(gi);
        cal.group = data.groups[gi];

        // Build subgroup pills (same as group-change handler)
        var group = cal.group;
        var pills = calQ(calId, '.subgroup-pills');
        pills.innerHTML = '';
        if (group.hasSubgroups) {
          var savedSub = (state.subgroup === '1' || state.subgroup === '2') ? state.subgroup : 'all';
          ['1','2','all'].forEach(function(v) {
            var lbl = document.createElement('label');
            var inp = document.createElement('input');
            inp.type = 'radio';
            inp.name = 'subgroup-' + calId;
            inp.value = v;
            if (v === savedSub) inp.checked = true;
            var span = document.createElement('span');
            span.textContent = v === 'all' ? 'Both' : '/' + v;
            lbl.appendChild(inp);
            lbl.appendChild(span);
            pills.appendChild(lbl);
            inp.addEventListener('change', function() {
              cal.subgroup = v;
              cal.labSubgroupOverrides = {};
              updateSubjects(calId);
              updatePreview();
            });
          });
          cal.subgroup = savedSub;
          if (state.labSubgroupOverrides) {
            cal.labSubgroupOverrides = state.labSubgroupOverrides;
          }
          enableCard(calId, 'subgroup-card');
        } else {
          cal.subgroup = 'all';
        }

        // Restore unchecked types
        if (state.uncheckedTypes && state.uncheckedTypes.length) {
          calQAll(calId, '.types-card input[type="checkbox"]').forEach(function(cb) {
            if (state.uncheckedTypes.includes(cb.dataset.type)) cb.checked = false;
          });
        }

        enableCard(calId, 'types-card');
        enableCard(calId, 'subjects-card');

        updateSubjects(calId);

        // Apply excludedKeys (uncheck matching inputs)
        if (state.excludedKeys && state.excludedKeys.length) {
          var excSet = new Set(state.excludedKeys);
          calQAll(calId, '.subject-list input[data-key]').forEach(function(cb) {
            if (excSet.has(cb.dataset.key)) cb.checked = false;
          });
          // Sync all parent checkboxes
          calQAll(calId, '.subject-list .subject-group').forEach(function(g) {
            var parentCb = g.querySelector('.subject-parent input');
            var childCbs = Array.prototype.slice.call(g.querySelectorAll('.subject-children input[data-key]'));
            if (parentCb && childCbs.length) syncParent(parentCb, childCbs);
          });
        }

        if (onDone) onDone();
      })
      .catch(function() {
        if (onDone) onDone();
      });
  }

  function restoreState() {
    try {
      var raw = localStorage.getItem('fmi-cal-state');
      if (!raw) return;
      var saved = JSON.parse(raw);
      if (!saved) return;

      // Detect v1 (flat object) vs v2 (has .calendars array)
      var calStates;
      if (saved.v === 2 && Array.isArray(saved.calendars)) {
        calStates = saved.calendars;
      } else {
        // v1: flat object, wrap in single-element array
        calStates = [saved];
      }

      if (!calStates.length) return;
      calStates = calStates.slice(0, MAX_CALENDARS);

      restoring = true;

      // Restore global frequency
      if (saved.freq) {
        selectedFreq = saved.freq;
        var freqRadio = $('#freq-toggle input[value="' + saved.freq + '"]');
        if (freqRadio) freqRadio.checked = true;
      }

      // Create additional calendar panels for indices beyond 0
      for (var i = 1; i < calStates.length; i++) {
        addCalendar();
      }

      // Restore each calendar with async counter
      var pendingRestores = calStates.length;
      calStates.forEach(function(state, idx) {
        var calId = calendars[idx].id;
        restoreCalendar(calId, state, function() {
          pendingRestores--;
          if (pendingRestores === 0) {
            restoring = false;
            collapseAllButFirst();
            updatePreview();
            saveState(); // migrate v1 → v2 format
          }
        });
      });
    } catch (e) {
      restoring = false;
    }
  }

  // --- Shareable URLs (base64-encoded JSON) ---
  function encodeCalStateForURL(calId) {
    var cal = getCal(calId);
    var yearCode = calQ(calId, '.year-select').value;
    if (!yearCode) return null;

    var groupIdx = calQ(calId, '.group-select').value;
    if (groupIdx === '' || groupIdx == null) return null;

    var state = { s: yearCode, g: Number(groupIdx) };
    if (cal.subgroup !== 'all') state.sg = cal.subgroup;

    // Unchecked types
    var uncheckedTypes = [];
    calQAll(calId, '.types-card input[type="checkbox"]').forEach(function(cb) {
      if (!cb.checked) uncheckedTypes.push(cb.dataset.type);
    });
    if (uncheckedTypes.length) state.ut = uncheckedTypes;

    // Excluded subjects
    var excluded = [];
    calQAll(calId, '.subject-list input[data-key]').forEach(function(cb) {
      if (!cb.checked) excluded.push(cb.dataset.key);
    });
    if (excluded.length) state.ex = excluded;

    // Lab subgroup overrides
    if (Object.keys(cal.labSubgroupOverrides).length) state.lo = cal.labSubgroupOverrides;

    return state;
  }

  function encodeStateToURL() {
    // Collect states for all calendars that have a group selected
    var calStates = [];
    calendars.forEach(function(c) {
      var s = encodeCalStateForURL(c.id);
      if (s) calStates.push(s);
    });

    if (!calStates.length) return;

    var payload;
    if (calStates.length === 1) {
      // Single calendar: flat format for backward compatibility
      payload = calStates[0];
      payload.f = selectedFreq;
    } else {
      // Multi-calendar: { cals: [...], f: freq }
      payload = { cals: calStates };
      payload.f = selectedFreq;
    }

    var json = JSON.stringify(payload);
    var b64 = btoa(unescape(encodeURIComponent(json)));
    return window.location.origin + window.location.pathname + '?c=' + encodeURIComponent(b64);
  }

  function decodeCalState(obj) {
    return {
      yearCode: obj.s,
      groupIndex: obj.g !== undefined ? String(obj.g) : null,
      subgroup: obj.sg || 'all',
      uncheckedTypes: obj.ut || [],
      excluded: obj.ex || [],
      labSubgroupOverrides: obj.lo || {},
    };
  }

  function decodeStateFromURL() {
    var params = new URLSearchParams(window.location.search);

    // Support new base64 format
    if (params.has('c')) {
      try {
        var json = decodeURIComponent(escape(atob(params.get('c'))));
        var state = JSON.parse(json);

        // Multi-calendar format: { cals: [...], f: freq }
        if (Array.isArray(state.cals)) {
          return {
            calStates: state.cals.map(decodeCalState),
            freq: state.f || 'all',
          };
        }

        // Single-calendar format: flat object with .s
        if (state.s) {
          return {
            calStates: [decodeCalState(state)],
            freq: state.f || 'all',
          };
        }

        return null;
      } catch (e) { return null; }
    }

    // Legacy: plain params (backwards compat)
    if (params.has('spec')) {
      return {
        calStates: [{
          yearCode: params.get('spec'),
          groupIndex: params.get('group'),
          subgroup: params.get('sub') || 'all',
          uncheckedTypes: [],
          excluded: params.get('excl') ? params.get('excl').split(',') : [],
          labSubgroupOverrides: {},
        }],
        freq: params.get('freq') || 'all',
      };
    }

    return null;
  }

  // Share button handler
  function copyToClipboard(text) {
    if (navigator.clipboard) {
      return navigator.clipboard.writeText(text).catch(() => copyFallback(text));
    }
    return copyFallback(text);
  }

  function copyFallback(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    document.execCommand('copy');
    ta.remove();
    return Promise.resolve();
  }

  $('#share-btn').addEventListener('click', () => {
    const url = encodeStateToURL();
    if (!url) return;

    copyToClipboard(url).then(() => {
      const btn = $('#share-btn');
      const orig = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = orig; }, 2000);
    });
  });

  // Restore from URL (takes priority over localStorage)
  function restoreFromURL() {
    var decoded = decodeStateFromURL();
    if (!decoded || !decoded.calStates || !decoded.calStates.length || !indexData) return false;
    decoded.calStates = decoded.calStates.slice(0, MAX_CALENDARS);

    // Validate that at least the first calendar has a valid spec
    var firstState = decoded.calStates[0];
    var firstSpecIndex = null;
    for (var i = 0; i < indexData.specs.length; i++) {
      if (indexData.specs[i].years.some(function(y) { return y.code === firstState.yearCode; })) {
        firstSpecIndex = i;
        break;
      }
    }
    if (firstSpecIndex === null) return false;

    restoring = true;

    // Apply global frequency
    if (decoded.freq) {
      selectedFreq = decoded.freq;
      var freqRadio = $('#freq-toggle input[value="' + decoded.freq + '"]');
      if (freqRadio) freqRadio.checked = true;
    }

    // Create additional calendar panels for indices beyond 0
    for (var ci = 1; ci < decoded.calStates.length; ci++) {
      addCalendar();
    }

    // Track pending async URL restores
    var pendingUrlRestores = decoded.calStates.length;

    // Restore each calendar via the cascade mechanism
    decoded.calStates.forEach(function(calState, idx) {
      var calId = calendars[idx].id;
      var cal = getCal(calId);

      // Find specIndex for this calendar's yearCode
      var specIndex = null;
      for (var si = 0; si < indexData.specs.length; si++) {
        if (indexData.specs[si].years.some(function(y) { return y.code === calState.yearCode; })) {
          specIndex = si;
          break;
        }
      }
      if (specIndex === null) {
        pendingUrlRestores--;
        if (pendingUrlRestores === 0) {
          restoring = false;
          if (calendars.length > 1) {
            calendars.forEach(function(c, i) {
              if (i === 0) expandAccordion(c.id);
              else collapseAccordion(c.id);
            });
          }
          saveState();
        }
        return;
      }

      // Set per-calendar _urlState (used by setupYearSelect cascade)
      cal._urlState = calState;
      cal._urlRestoreDone = function() {
        pendingUrlRestores--;
        if (pendingUrlRestores === 0) {
          restoring = false;
          collapseAllButFirst();
          updatePreview();
          saveState();
        }
      };

      selectSpec(calId, specIndex, indexData.specs[specIndex].name);

      // For multi-year specs, onSpecChange only auto-selects when there's 1 year.
      // Explicitly select the correct year so the cascade continues.
      var spec = indexData.specs[specIndex];
      if (spec.years.length > 1) {
        var yearMatch = spec.years.find(function(y) { return y.code === calState.yearCode; });
        if (yearMatch) {
          cal.yearSelect.selectItem(yearMatch.code, 'Year ' + yearMatch.year);
        }
      }
    });

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
        if (e.room) {
          const loc = roomLegend[e.room] ? `${e.room}, ${roomLegend[e.room]}` : e.room;
          lines.push(`LOCATION:${icsEscape(loc)}`);
        }
        if (e.professor) lines.push(`DESCRIPTION:${icsEscape(e.professor)}`);
        lines.push('END:VEVENT');
      }
    }

    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  }

  $('#download-btn').addEventListener('click', () => {
    const entries = getAllFilteredEntries();
    if (!entries.length) return;

    const ics = generateICS(entries);
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;

    // Build filename: merged-schedule.ics for multiple calendars, spec-group-subgroup.ics for single
    const activeCals = calendars.filter(function(c) { return c.group; });
    if (activeCals.length > 1) {
      a.download = 'merged-schedule.ics';
    } else {
      var cal = activeCals[0] || getCal(CAL0);
      const code = cal.yearData ? cal.yearData.code : 'schedule';
      const gName = cal.group ? cal.group.name.replace('/', '-') : 'schedule';
      const sub = cal.subgroup === 'all' ? 'all' : cal.subgroup;
      a.download = `${code}-${gName}-${sub}.ics`;
    }

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  // --- Calendar Subscription ---
  var subDropdown = $('#subscribe-dropdown');

  function getSubscribeURL() {
    var stateUrl = encodeStateToURL();
    if (!stateUrl) return null;
    var urlObj = new URL(stateUrl);
    var c = urlObj.searchParams.get('c');
    if (!c) return null;
    return 'https://cal.rdobre.ro/ics?c=' + encodeURIComponent(c);
  }

  $('#subscribe-btn').addEventListener('click', function(e) {
    e.stopPropagation();
    subDropdown.hidden = !subDropdown.hidden;
  });

  // Close dropdown on outside click
  document.addEventListener('click', function() {
    subDropdown.hidden = true;
  });
  subDropdown.addEventListener('click', function(e) {
    e.stopPropagation();
  });

  subDropdown.querySelectorAll('.subscribe-dropdown-item').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var url = getSubscribeURL();
      if (!url) return;
      var action = btn.dataset.action;

      var webcalUrl = url.replace('https://', 'webcal://');

      if (action === 'google') {
        // Google Calendar requires webcal:// in the cid param, not https://
        window.open('https://calendar.google.com/calendar/render?cid=' + encodeURIComponent(webcalUrl), '_blank');
      } else if (action === 'outlook') {
        // Outlook web subscribe
        window.open('https://outlook.live.com/calendar/0/addfromweb?url=' + encodeURIComponent(url), '_blank');
      } else if (action === 'webcal') {
        // webcal:// for native calendar apps (iOS/macOS Calendar, Thunderbird, etc.)
        window.location.href = webcalUrl;
      } else if (action === 'copy') {
        copyToClipboard(url).then(function() {
          btn.textContent = 'Copied!';
          setTimeout(function() { btn.textContent = 'Copy URL'; }, 2000);
        });
        return; // don't close dropdown on copy
      }

      subDropdown.hidden = true;
    });
  });


  // --- PWA Service Worker ---
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').then(function(reg) {
      // Check for updates
      reg.addEventListener('updatefound', function() {
        var newWorker = reg.installing;
        newWorker.addEventListener('statechange', function() {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New version available — show toast
            var toast = $('#pwa-toast');
            if (toast) {
              toast.hidden = false;
              $('#pwa-toast-refresh').addEventListener('click', function() {
                newWorker.postMessage({ type: 'SKIP_WAITING' });
              });
              $('#pwa-toast-dismiss').addEventListener('click', function() {
                toast.hidden = true;
              });
            }
          }
        });
      });
    });

    // Reload when new SW takes over
    var refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', function() {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  }
})();
