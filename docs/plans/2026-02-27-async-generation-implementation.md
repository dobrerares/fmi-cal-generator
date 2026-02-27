# Async Generation Pipeline — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Parallelize HTTP fetches in `generate_all.py` using `ThreadPoolExecutor` to reduce generation time from ~2 min to ~10s.

**Architecture:** Split the sequential per-spec loop into Phase 1 (parallel HTTP fetches via ThreadPoolExecutor) and Phase 2 (sequential file generation). Only `scripts/generate_all.py` changes. No new dependencies.

**Tech Stack:** Python stdlib `concurrent.futures.ThreadPoolExecutor`

---

### Task 1: Extract `fetch_spec_data()` helper

**Files:**
- Modify: `scripts/generate_all.py`

**Step 1: Create the `fetch_spec_data` function**

Extract the network-bound portion of the per-spec loop into a standalone function that can be submitted to a thread pool. This function fetches schedules and the academic calendar for a single spec.

```python
from dataclasses import dataclass

@dataclass
class SpecFetchResult:
    """Result of fetching data for one specialization."""
    spec: object  # Specialization
    schedules: list
    acad_cal: object  # AcademicCalendar
    error: str | None = None

def fetch_spec_data(
    spec,
    base_url: str,
    semester_num: int,
    acad_cache: dict[str, "AcademicCalendar"],
) -> SpecFetchResult:
    """Fetch schedules + academic calendar for one spec. Thread-safe."""
    try:
        schedules = fetch_group_schedules(base_url, spec.code)
        study_line = get_study_line(spec.code, spec.name)
        cache_key = f"{study_line}-{semester_num}"
        if cache_key not in acad_cache:
            acad_cache[cache_key] = fetch_academic_calendar(study_line, semester_num)
        acad_cal = acad_cache[cache_key]
        return SpecFetchResult(spec=spec, schedules=schedules, acad_cal=acad_cal)
    except Exception as e:
        return SpecFetchResult(spec=spec, schedules=[], acad_cal=None, error=str(e))
```

**Step 2: Verify existing tests still pass**

Run: `python -m pytest tests/ -v`
Expected: All existing tests pass (we haven't changed library code).

**Step 3: Commit**

```bash
git add scripts/generate_all.py
git commit -m "refactor: extract fetch_spec_data helper from main loop"
```

---

### Task 2: Rewrite main loop to use ThreadPoolExecutor

**Files:**
- Modify: `scripts/generate_all.py`

**Step 1: Replace sequential loop with parallel fetch + sequential process**

Add imports at top of file:
```python
from concurrent.futures import ThreadPoolExecutor, as_completed
import time  # already imported, add time.perf_counter usage
```

Replace the `for spec in specs:` loop in `main()` with:

```python
    # --- Phase 1: Parallel fetch all spec data ---
    t0 = time.perf_counter()

    # Deduplicate specs by code (only fetch each code once)
    unique_specs = []
    for spec in specs:
        if spec.code not in seen_codes:
            seen_codes.add(spec.code)
            unique_specs.append(spec)

    acad_cache: dict[str, AcademicCalendar] = {}
    results: list[SpecFetchResult] = []

    with ThreadPoolExecutor() as executor:
        futures = {
            executor.submit(fetch_spec_data, spec, base_url, semester_num, acad_cache): spec
            for spec in unique_specs
        }
        for future in as_completed(futures):
            result = future.result()
            results.append(result)
            if result.error:
                print(f"  ERROR fetching {result.spec.code}: {result.error}")
            else:
                print(f"  Fetched {result.spec.code}")

    t_fetch = time.perf_counter() - t0
    print(f"\nPhase 1 (fetch): {t_fetch:.1f}s")

    # --- Phase 2: Sequential generation ---
    t1 = time.perf_counter()

    for result in results:
        if result.error:
            errors.append(f"  ERROR fetching {result.spec.code}: {result.error}")
            continue

        spec = result.spec
        schedules = result.schedules
        acad_cal = result.acad_cal

        spec_dir = output_dir / sanitize_dirname(spec.name) / f"Year {spec.year}"
        spec_dir.mkdir(parents=True, exist_ok=True)

        print(f"\n[{spec.code}] {spec.name} Year {spec.year}")

        # ... existing .ics generation + JSON generation code (unchanged) ...
```

Remove `time.sleep(0.5)`.

Also move the `spec_index` building out of the dedup-guarded block — it should still run for every spec (including duplicates). Keep the existing logic that adds to `spec_index` before the dedup check.

Add timing summary at the end:
```python
    t_gen = time.perf_counter() - t1
    t_total = time.perf_counter() - t0
    print(f"Phase 2 (generate): {t_gen:.1f}s")
    print(f"Total: {t_total:.1f}s")
```

**Step 2: Verify existing tests still pass**

Run: `python -m pytest tests/ -v`
Expected: All existing tests pass.

**Step 3: Commit**

```bash
git add scripts/generate_all.py
git commit -m "feat: parallelize spec fetching with ThreadPoolExecutor

Remove sequential HTTP fetching and 0.5s rate-limiting delays.
All spec data is now fetched concurrently, then processed sequentially."
```

---

### Task 3: Test full pipeline end-to-end

**Step 1: Run the new parallel pipeline**

```bash
source .venv/bin/activate
time python scripts/generate_all.py
```

Expected: Completes in ~5-15 seconds. Output shows Phase 1/Phase 2 timing. All `.ics` and JSON files generated in `site/`.

**Step 2: Run generate_index.py**

```bash
python scripts/generate_index.py
```

Expected: `site/index.html` generated successfully.

**Step 3: Spot-check output correctness**

Verify a few generated files look correct:
```bash
ls site/data/*.json | head -5
cat site/data/index.json | python -m json.tool | head -20
ls site/Informatica*/Year\ 2/*.ics | head -5
```

**Step 4: Run existing tests**

```bash
python -m pytest tests/ -v
```

Expected: All tests pass.
