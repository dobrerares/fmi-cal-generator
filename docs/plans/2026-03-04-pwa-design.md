# PWA Support — Design

## Goal

Add Progressive Web App functionality so users can install the app to their home screen and use it offline. Non-invasive — no changes to existing app behavior.

## File Structure

New template files:
```
templates/
├── manifest.json.j2          # Web app manifest
├── sw.js                      # Service worker
└── icons/
    ├── icon.svg               # Source SVG (timetable grid + FMI)
    ├── icon-192.png           # 192x192
    ├── icon-512.png           # 512x512
    └── apple-touch-icon.png   # 180x180
```

Build output additions in `site/`:
```
site/
├── manifest.json
├── sw.js
└── icons/
    ├── icon-192.png
    ├── icon-512.png
    └── apple-touch-icon.png
```

## Build Changes

`generate_index.py` additions:
- Copy `sw.js` to `site/sw.js`
- Copy `templates/icons/` to `site/icons/`
- Render `manifest.json.j2` → `site/manifest.json`

## Web App Manifest

```json
{
  "name": "Orar FMI UBB Cluj",
  "short_name": "Orar FMI UBB",
  "description": "Schedule viewer for Faculty of Mathematics and Informatics, UBB Cluj",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#18181b",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

## HTML Head Additions

```html
<link rel="manifest" href="/manifest.json">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<meta name="theme-color" content="#18181b">
<meta name="description" content="Schedule viewer for FMI UBB Cluj">
```

Plus service worker registration in the JS.

## Service Worker — Caching Strategy

| Resource | Strategy | Rationale |
|----------|----------|-----------|
| `index.html` | Network-first, cache fallback | Prefer fresh content, works offline |
| `data/*.json` | Network-first, cache fallback | Schedule updates weekly, serve cached offline |
| Icons, manifest | Cache-first | Rarely change |
| Google Fonts (Inter) | Cache-first | Fonts never change |

**On install:** Pre-cache `index.html`, `manifest.json`, and icons. Does NOT pre-cache `data/*.json` — those cache on first fetch (user only needs their selected spec/group).

## Update Flow

1. Browser checks for updated `sw.js` on every app launch (standard SW lifecycle).
2. New SW installs in background, enters "waiting" state.
3. App detects waiting SW, shows toast: "Orar nou disponibil" + "Reincarca" button.
4. Tap refresh → activates new SW, reloads page.
5. If ignored → new version activates next time the app opens.

## Update Toast UI

- Small bar at bottom of screen, using existing shadcn/zinc design tokens.
- Text: "Orar nou disponibil" + "Reincarca" button.
- Dismissible (X button).
- On mobile PWA, positioned above bottom sheet controls.
- Only appears when a new service worker is waiting.

## Icon Design

- Timetable grid motif with "FMI" text.
- SVG source, exported to PNG at required sizes.
- Matches the app's zinc color palette.
