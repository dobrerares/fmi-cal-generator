# Async Generation Pipeline — Design

## Problem

The full `generate_all.py` pipeline takes ~2 minutes. ~95% of that time is spent waiting on sequential HTTP requests to the university server, plus intentional 0.5s rate-limiting delays between specializations.

## Solution

Use `concurrent.futures.ThreadPoolExecutor` to parallelize the HTTP-bound work in `generate_all.py`. No new dependencies — stdlib only. Library modules (`scraper.py`, `academic.py`, `calendar_gen.py`) remain untouched.

## Architecture

Split the current sequential loop into two phases:

### Phase 1 — Parallel fetch

Use `ThreadPoolExecutor` with no concurrency limit to fetch all spec data simultaneously:

```python
def fetch_spec_data(spec, base_url, semester_num, acad_cache):
    """Fetch schedules + academic calendar for one spec. Thread-safe."""
    schedules = fetch_group_schedules(base_url, spec.code)
    study_line = get_study_line(spec.code, spec.name)
    cache_key = f"{study_line}-{semester_num}"
    if cache_key not in acad_cache:
        acad_cache[cache_key] = fetch_academic_calendar(study_line, semester_num)
    return spec, schedules, acad_cache[cache_key]
```

All specs submitted to the executor at once. Each thread makes 1-2 HTTP requests.

### Phase 2 — Sequential process

Iterate over fetched results to generate `.ics` files, JSON data, and build the spec index. This is CPU-bound but takes <2 seconds.

## What changes

- **`scripts/generate_all.py`**: Rewrite main loop to use ThreadPoolExecutor. Add timing instrumentation.
- **Remove**: `time.sleep(0.5)` rate-limiting delay.

## What stays the same

- `scraper.py`, `academic.py`, `calendar_gen.py`, `models.py` — untouched
- CLI (`cli.py`) — untouched
- `generate_index.py` — untouched
- All output files (`.ics`, JSON, HTML) — identical content
- Error handling: continue on error, report at end

## Thread safety

- Academic calendar cache: shared dict, but CPython's GIL makes simple dict reads/writes atomic. Worst case: a duplicate fetch (harmless).
- Each thread only reads shared state (base_url, semester_num) and writes to the shared cache dict.
- File I/O happens in Phase 2 (sequential), so no file write races.

## Expected performance

- Before: ~2 minutes
- After: ~5-15 seconds (limited by slowest single HTTP response)
