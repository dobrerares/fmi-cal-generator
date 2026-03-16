# Calendar Subscription via Cloudflare Worker

## Problem

The FMI Calendar Generator builds `.ics` files client-side based on user selections (spec, group, subgroup, frequency, excluded subjects, lab overrides). Users can download these files, but there's no way to **subscribe** — meaning Google Calendar (or Apple/Outlook) can't auto-poll for updates.

## Solution

A Cloudflare Worker at `cal.rdobre.ro` that accepts the same base64-encoded `?c=` parameter the frontend already generates, fetches schedule JSON from the existing GitHub Pages origin, applies the full filtering logic server-side, and returns a valid `.ics` response.

## Architecture

```
Google Calendar (polls every 12-24h)
        │
        ▼
webcal://cal.rdobre.ro/ics?c=BASE64
        │
        ▼
┌─────────────────────────────┐
│   Cloudflare Worker         │
│                             │
│  1. Decode ?c= param        │
│  2. Fetch JSON from origin  │
│  3. Filter entries           │
│  4. Return text/calendar    │
└─────────────────────────────┘
        │
        ▼
https://orar-fmi.rdobre.ro/data/{spec}.json
```

No database, no auth, no state. Pure function: params in, `.ics` out.

## URL Format

Reuses the existing frontend base64 `?c=` encoding:

```
webcal://cal.rdobre.ro/ics?c=BASE64_ENCODED_JSON
```

### Single calendar payload (decoded)

```json
{
  "s": "M1",
  "g": 0,
  "sg": "1",
  "ut": ["Curs"],
  "ex": ["Algebra|||Seminar"],
  "lo": { "BPOO": "2" },
  "f": "sapt. 1"
}
```

### Multi-calendar payload (decoded)

```json
{
  "cals": [
    { "s": "M1", "g": 0, "sg": "1", "ut": [], "ex": [], "lo": {} },
    { "s": "IE2", "g": 1, "sg": "all", "ut": [], "ex": [], "lo": {} }
  ],
  "f": "all"
}
```

## Worker Processing Steps

For each calendar in the payload:

1. Fetch `https://orar-fmi.rdobre.ro/data/{spec}.json`
2. Find group by index `g`
3. Apply type filter (exclude types in `ut`)
4. Apply subject+type exclusion (entries in `ex`)
5. Apply formation/subgroup logic (global `sg` + per-subject lab overrides `lo`)
6. Apply frequency filter (`f`)

If multi-calendar: merge entries and deduplicate (same logic as client-side `deduplicateEntries()`).

Generate and return `text/calendar` response.

## Data Source

Fetches JSON from the existing GitHub Pages site at `orar-fmi.rdobre.ro/data/`. No data bundling or redeployment needed — Worker always uses fresh data.

## Caching

- JSON fetches cached via Cloudflare Cache API with ~1 hour TTL
- Google Calendar polls every 12-24h; schedule updates at most weekly
- Balance: fresh enough to pick up changes, avoids redundant origin fetches

## Error Handling

| Condition | Response |
|-----------|----------|
| Missing/invalid `?c=` param | 400 plain text error |
| Spec JSON fetch failure | 502 error |
| Group index out of bounds | 400 error |
| Uncaught exception | 200 with valid empty `.ics` + `X-Error` header |

Returning a valid empty `.ics` on uncaught errors prevents Google Calendar from silently unsubscribing.

## Frontend Integration

A "Subscribe" button next to the existing "Download" button:

1. Builds the same `?c=` base64 payload the share URL uses
2. Constructs `webcal://cal.rdobre.ro/ics?c=BASE64`
3. Opens it (triggers OS calendar subscription flow)
4. Also shows a copyable `https://` URL for manual paste into Google Calendar's "Subscribe by URL"

## Hosting

- **Platform:** Cloudflare Workers (free tier: 100k requests/day)
- **Domain:** `cal.rdobre.ro` (custom subdomain via Cloudflare DNS)
- **Cost:** Free for expected usage (~500-1000 polls/day max)

## Filtering Parity

Full parity with client-side filtering:

- Event type filtering (Curs, Seminar, Laborator)
- Subject+type exclusion
- Subgroup selection (all, 1, 2)
- Per-subject lab subgroup overrides
- Frequency filtering (all, every, sapt. 1, sapt. 2)
- Multi-calendar merge with deduplication
