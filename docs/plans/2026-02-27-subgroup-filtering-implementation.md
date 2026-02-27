# Per-Subject Subgroup Filtering — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add inline `[1 | 2 | Both]` mini-pill toggles on Lab rows in the subject list so users can control subgroup inclusion per-subject when the global subgroup is "Both".

**Architecture:** Purely frontend JS/CSS change. Add a `labSubgroupOverrides` Map to track per-subject subgroup choices. Modify `updateSubjects()` to render mini-pills on Lab rows. Modify `filterEntries()` to consult the overrides. Update persistence.

**Tech Stack:** Vanilla JS, CSS (no build tools, no frameworks)

---

### Task 1: Add state variable and reset logic

**Files:**
- Modify: `templates/app.js:29-34` (state section)
- Modify: `templates/app.js:337-360` (group change handler — subgroup pills)
- Modify: `templates/app.js:350-354` (global subgroup change listener)

**Step 1: Add `labSubgroupOverrides` state variable**

At line 34 (after `let restoring = false;`), add:

```javascript
let labSubgroupOverrides = {};  // { subjectName: '1' | '2' | 'all' }
```

**Step 2: Clear overrides when global subgroup changes**

In the global subgroup pill `change` listener (line 350-354), clear overrides and rebuild subjects:

```javascript
inp.addEventListener('change', () => {
  selectedSubgroup = v;
  labSubgroupOverrides = {};
  updateSubjects();
  updatePreview();
});
```

**Step 3: Clear overrides on group change**

In the group change handler (line 328), after `resetFrom('subgroup-card')`, add:

```javascript
labSubgroupOverrides = {};
```

**Step 4: Verify manually**

Run: `python scripts/generate_index.py && cd site && python -m http.server 8123`

Expected: App loads, no errors in console. Behavior unchanged so far.

**Step 5: Commit**

```bash
git add templates/app.js
git commit -m "Add labSubgroupOverrides state variable with reset logic"
```

---

### Task 2: Add mini-pill CSS styles

**Files:**
- Modify: `templates/style.css` (after `.pill-group` rules, around line 411)

**Step 1: Add mini-pill styles**

After the `.pill-group span:active` rule (line 411), add:

```css
/* --- Inline subgroup mini-pills (inside subject list) --- */
.sg-mini-pills {
  display: inline-flex;
  gap: 0.125rem;
  margin-left: 0.5rem;
  flex-shrink: 0;
}
.sg-mini-pills button {
  font-family: inherit;
  font-size: 0.6875rem;
  font-weight: 500;
  padding: 0.0625rem 0.375rem;
  border: 1px solid var(--border);
  border-radius: 0.25rem;
  background: transparent;
  color: var(--muted-foreground);
  cursor: pointer;
  line-height: 1.4;
  transition: background-color 0.15s, color 0.15s, border-color 0.15s;
}
.sg-mini-pills button:hover {
  background: var(--accent);
  color: var(--foreground);
}
.sg-mini-pills button.active {
  background: var(--primary);
  color: var(--primary-foreground);
  border-color: var(--primary);
}
```

**Step 2: Verify manually**

Regenerate site and confirm no visual regressions (pills don't appear yet, just CSS ready).

**Step 3: Commit**

```bash
git add templates/style.css
git commit -m "Add CSS for inline subgroup mini-pills"
```

---

### Task 3: Render mini-pills in subject list

**Files:**
- Modify: `templates/app.js:468-490` (inside `updateSubjects()`, the `typeArr.forEach` loop for multi-type grouped subjects)

**Step 1: Add mini-pill rendering to Lab rows**

In `updateSubjects()`, inside the `typeArr.forEach(t => { ... })` block (lines 468-490), after the badge span is appended to `lbl` (line 489), add logic to insert mini-pills when the type is `Laborator`, the global subgroup is `'all'`, and the group has subgroups.

Replace the block at lines 468-490 with:

```javascript
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
      btn.textContent = sv === 'all' ? 'Both' : `Sg ${sv}`;
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
```

Also apply the same logic for the **single-type flat row** case (lines 429-448). When a subject has only `Laborator` as its type and global is "Both" with subgroups, add mini-pills there too:

Replace lines 429-448 with:

```javascript
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
      btn.textContent = sv === 'all' ? 'Both' : `Sg ${sv}`;
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

  const badgeSpan = document.createElement('span');
  badgeSpan.className = `type-badge ${badge[1]}`;
  badgeSpan.textContent = badge[0];
  lbl.appendChild(badgeSpan);
  list.appendChild(lbl);
```

**Step 2: Verify manually**

Regenerate site. Select a group with subgroups (e.g., I1 → Year 1 → Group 211). Set global to "Both". Confirm mini-pills `[Sg 1 | Sg 2 | Both]` appear on Lab rows. Click them — active state should toggle.

**Step 3: Commit**

```bash
git add templates/app.js
git commit -m "Render inline subgroup mini-pills on Lab rows"
```

---

### Task 4: Wire mini-pills to filterEntries

**Files:**
- Modify: `templates/app.js:554-572` (`filterEntries` function)

**Step 1: Update filterEntries to check per-subject overrides**

Replace the `filterEntries` function (lines 554-572) with:

```javascript
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
```

**Step 2: Verify manually**

Regenerate site. Select group 211 with "Both". Set a subject's Lab to "Sg 1". Verify the event count decreases (that subject's Sg 2 lab entries are excluded). Set back to "Both" — count restores.

**Step 3: Commit**

```bash
git add templates/app.js
git commit -m "Wire subgroup mini-pills to filterEntries logic"
```

---

### Task 5: Update persistence (save/restore)

**Files:**
- Modify: `templates/app.js:593-611` (`saveState` function)
- Modify: `templates/app.js:614-724` (`restoreState` function)

**Step 1: Save overrides in saveState**

In `saveState()` (around line 609, before the `localStorage.setItem` call), add:

```javascript
state.labSubgroupOverrides = labSubgroupOverrides;
```

**Step 2: Restore overrides in restoreState**

In `restoreState()`, after `selectedSubgroup` is set (around line 682), add:

```javascript
if (state.labSubgroupOverrides) {
  labSubgroupOverrides = state.labSubgroupOverrides;
}
```

**Step 3: Verify manually**

Set per-subject overrides. Refresh page. Confirm overrides are restored.

**Step 4: Commit**

```bash
git add templates/app.js
git commit -m "Persist labSubgroupOverrides in localStorage"
```

---

### Task 6: Handle duplicate global subgroup pill logic in restoreState

**Files:**
- Modify: `templates/app.js:664-680` (restoreState subgroup pill change listener)

**Step 1: Clear overrides in the restoreState pill listener too**

The subgroup pills are built in two places: group change handler and restoreState. Both need the same `labSubgroupOverrides = {};` reset. In restoreState's pill change listener (around line 676-680):

```javascript
inp.addEventListener('change', () => {
  selectedSubgroup = v;
  labSubgroupOverrides = {};
  updateSubjects();
  updatePreview();
});
```

**Step 2: Verify manually**

Restore state with overrides. Change global subgroup pill. Confirm overrides are cleared and mini-pills reset.

**Step 3: Commit**

```bash
git add templates/app.js
git commit -m "Clear subgroup overrides on global pill change in restoreState path"
```

---

### Task 7: Regenerate site and final verification

**Step 1: Regenerate**

Run: `python scripts/generate_index.py`

**Step 2: Full manual test**

1. Select I1 → Year 1 → Group 211
2. Set global to "Both" — mini-pills appear on all Lab rows
3. Toggle one Lab to "Sg 1" — event count changes, preview excludes Sg 2 labs for that subject
4. Toggle another to "Sg 2" — independent control works
5. Change global to "Subgroup 1" — mini-pills disappear, all labs show Sg 1 only
6. Change back to "Both" — mini-pills reappear, all reset to "Both"
7. Set some overrides, refresh page — overrides persist
8. Test with a group without subgroups — no mini-pills appear
9. Check both themes (light + AMOLED) — mini-pills look correct

**Step 3: Commit and push**

```bash
git add site/index.html
git commit -m "Regenerate site with per-subject subgroup filtering"
git push
```
