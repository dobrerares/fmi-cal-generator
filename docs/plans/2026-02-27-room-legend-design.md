# Room Legend — Design

## Goal

Enrich ICS calendar `LOCATION` field and event tooltips with full room details (building name, floor, street address) scraped from the UBB room legend page.

## Data Source

URL: `https://www.cs.ubbcluj.ro/files/orar/{YEAR}-{SEM}/sali/legenda.html`

Two-column HTML table:
- **Sala** (room code): e.g. `L338`, `2/I`, `pi`
- **Localizarea** (location): e.g. `FSEGA Building, Floor 3, Teodor Mihali St. 58-60`

## Changes

### 1. `scraper.py` — `fetch_room_legend(base_url)`

New function. Takes the tabelar base URL, derives the legend URL (`../sali/legenda.html`), parses the table. Returns `dict[str, str]` mapping room code to location string.

### 2. `generate_all.py` — write `site/data/rooms.json`

Call `fetch_room_legend()` once at the start of batch generation. Write result as `site/data/rooms.json`. Standalone file (not embedded per-spec) since rooms are shared across all specializations.

### 3. `calendar_gen.py` — `generate_ics(entries, calendar, room_legend=None)`

Add optional `room_legend` parameter. When provided and room code is found, set `LOCATION` to `"RoomCode, FullLocation"` instead of just `"RoomCode"`.

### 4. `app.js` — client-side enrichment

- Fetch `data/rooms.json` once on page load (fire-and-forget, non-blocking).
- **ICS generation**: use room legend to format `LOCATION` as `"RoomCode, FullLocation"`.
- **Event tooltip/popup**: append full room location to the detail text.
- **Grid blocks**: unchanged — still show only the room code.

### 5. Tests

- Test `fetch_room_legend` HTML parsing with sample HTML fixture.
- Test `generate_ics` LOCATION enrichment with room legend.

## Non-goals

- No UI changes to grid event blocks (room code stays compact).
- No new data model — just a simple `dict[str, str]`.
