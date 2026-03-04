# PWA Support — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Progressive Web App support so users can install the app to their home screen and use it offline.

**Architecture:** Separate static files (manifest.json, sw.js, icons) alongside the existing index.html. Build script copies them to site/. Service worker uses network-first caching for HTML and data, cache-first for static assets. Update toast notifies users of new versions.

**Tech Stack:** Vanilla JS service worker, Web App Manifest, existing Jinja2 build pipeline.

---

### Task 1: Create App Icons

**Files:**
- Create: `templates/icons/icon.svg`
- Create: `templates/icons/icon-192.png`
- Create: `templates/icons/icon-512.png`
- Create: `templates/icons/apple-touch-icon.png`

**Step 1: Create SVG icon**

Design a timetable-grid icon with "FMI" text. Use zinc-900 (`#18181b`) as the primary color. The icon should be a simple calendar/timetable grid that's recognizable at small sizes.

Create `templates/icons/icon.svg` — a 512x512 SVG with:
- Rounded-rect background in `#18181b`
- 3x3 grid lines in white suggesting a timetable
- "FMI" text centered, white, bold

**Step 2: Generate PNGs from SVG**

Run:
```bash
# Requires Inkscape or rsvg-convert or ImageMagick
# Using ImageMagick (most commonly available):
convert templates/icons/icon.svg -resize 192x192 templates/icons/icon-192.png
convert templates/icons/icon.svg -resize 512x512 templates/icons/icon-512.png
convert templates/icons/icon.svg -resize 180x180 templates/icons/apple-touch-icon.png
```

If ImageMagick is not available, use `rsvg-convert` or Python Pillow.

**Step 3: Commit**

```bash
git add templates/icons/
git commit -m "feat(pwa): add app icons (SVG source + PNG exports)"
```

---

### Task 2: Create Web App Manifest

**Files:**
- Create: `templates/manifest.json`

**Step 1: Create manifest file**

Create `templates/manifest.json`:

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
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any"
    }
  ]
}
```

**Step 2: Commit**

```bash
git add templates/manifest.json
git commit -m "feat(pwa): add web app manifest"
```

---

### Task 3: Create Service Worker

**Files:**
- Create: `templates/sw.js`

**Step 1: Write the service worker**

Create `templates/sw.js`:

```javascript
const CACHE_NAME = 'orar-fmi-v1';

const PRECACHE_URLS = [
  '/',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// Install: precache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
});

// Fetch: network-first for HTML and data, cache-first for static assets
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only handle same-origin requests + Google Fonts
  if (url.origin !== self.location.origin &&
      !url.hostname.includes('fonts.googleapis.com') &&
      !url.hostname.includes('fonts.gstatic.com')) {
    return;
  }

  // Cache-first for fonts
  if (url.hostname.includes('fonts.googleapis.com') ||
      url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // Cache-first for icons and manifest
  if (url.pathname.startsWith('/icons/') || url.pathname === '/manifest.json') {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // Network-first for everything else (HTML, data JSON)
  event.respondWith(networkFirst(event.request));
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (e) {
    const cached = await caches.match(request);
    return cached || new Response('Offline', { status: 503 });
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (e) {
    return new Response('Offline', { status: 503 });
  }
}
```

**Step 2: Commit**

```bash
git add templates/sw.js
git commit -m "feat(pwa): add service worker with network-first caching"
```

---

### Task 4: Add PWA Meta Tags and SW Registration to HTML Template

**Files:**
- Modify: `templates/index.html.j2:3-10` (head section)
- Modify: `templates/index.html.j2:110` (before closing script, add SW registration)

**Step 1: Add meta tags to head**

In `templates/index.html.j2`, after line 5 (`<meta name="viewport"...>`), add:

```html
  <meta name="description" content="Schedule viewer for FMI UBB Cluj">
  <meta name="theme-color" content="#18181b">
  <link rel="manifest" href="/manifest.json">
  <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
  <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png">
```

**Step 2: Commit**

```bash
git add templates/index.html.j2
git commit -m "feat(pwa): add manifest link, meta tags, and icons to HTML head"
```

---

### Task 5: Add Update Toast UI

**Files:**
- Modify: `templates/style.css` (add toast styles at end)
- Modify: `templates/index.html.j2` (add toast HTML before `</body>`)

**Step 1: Add toast HTML**

In `templates/index.html.j2`, before the `<footer>` tag (line 105), add:

```html
  <!-- PWA update toast -->
  <div class="pwa-toast" id="pwa-toast" hidden>
    <span>Orar nou disponibil</span>
    <button class="pwa-toast-btn" id="pwa-toast-refresh">Reincarca</button>
    <button class="pwa-toast-dismiss" id="pwa-toast-dismiss" aria-label="Dismiss">&times;</button>
  </div>
```

**Step 2: Add toast CSS**

Append to `templates/style.css`:

```css
/* --- PWA update toast --- */
.pwa-toast {
  position: fixed;
  bottom: 1rem;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  background: var(--card);
  color: var(--card-foreground);
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  box-shadow: var(--card-shadow);
  font-size: 0.875rem;
  z-index: 10000;
  transition: opacity 0.3s, transform 0.3s;
}

.pwa-toast[hidden] {
  display: none;
}

.pwa-toast-btn {
  padding: 0.375rem 0.75rem;
  background: var(--primary);
  color: var(--primary-foreground);
  border: none;
  border-radius: 0.375rem;
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
}

.pwa-toast-dismiss {
  background: none;
  border: none;
  color: var(--muted-foreground);
  font-size: 1.125rem;
  cursor: pointer;
  padding: 0 0.25rem;
  line-height: 1;
}

/* On mobile, position above bottom sheet */
@media (max-width: 768px) {
  .pwa-toast {
    bottom: 5rem;
  }
}
```

**Step 3: Commit**

```bash
git add templates/index.html.j2 templates/style.css
git commit -m "feat(pwa): add update toast HTML and CSS"
```

---

### Task 6: Add SW Registration and Update Logic to app.js

**Files:**
- Modify: `templates/app.js` (add SW registration inside the IIFE, at the end before closing `})();`)

**Step 1: Add service worker registration**

In `templates/app.js`, before the final `})();` (line 2032), add:

```javascript
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
```

Also add the `SKIP_WAITING` handler in `templates/sw.js`:

```javascript
// At the top of sw.js, after PRECACHE_URLS:
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
```

**Step 2: Commit**

```bash
git add templates/app.js templates/sw.js
git commit -m "feat(pwa): add service worker registration and update toast logic"
```

---

### Task 7: Update Build Script to Copy PWA Files

**Files:**
- Modify: `scripts/generate_index.py:111-119` (main function)

**Step 1: Add file copying to main()**

In `scripts/generate_index.py`, modify the `main()` function to also copy PWA assets:

```python
import shutil

def main() -> None:
    site_dir = Path("site")
    if not site_dir.exists():
        print("Error: site/ directory not found. Run generate_all.py first.")
        raise SystemExit(1)

    templates_dir = Path(__file__).resolve().parent.parent / "templates"

    index_html = generate_index(site_dir)
    (site_dir / "index.html").write_text(index_html, encoding="utf-8")
    print("Generated site/index.html")

    # Copy PWA files
    for fname in ("sw.js", "manifest.json"):
        src = templates_dir / fname
        if src.exists():
            shutil.copy2(src, site_dir / fname)
            print(f"Copied {fname}")

    icons_src = templates_dir / "icons"
    if icons_src.exists():
        icons_dst = site_dir / "icons"
        if icons_dst.exists():
            shutil.rmtree(icons_dst)
        shutil.copytree(icons_src, icons_dst)
        # Remove SVG source from output (only PNGs needed)
        svg = icons_dst / "icon.svg"
        if svg.exists():
            svg.unlink()
        print("Copied icons/")
```

**Step 2: Run the build to verify**

```bash
source .venv/bin/activate
python scripts/generate_index.py
ls -la site/sw.js site/manifest.json site/icons/
```

Expected: All PWA files present in `site/`.

**Step 3: Commit**

```bash
git add scripts/generate_index.py
git commit -m "feat(pwa): update build script to copy PWA assets to site/"
```

---

### Task 8: Test the Full PWA

**Step 1: Build and preview locally**

```bash
source .venv/bin/activate
python scripts/generate_index.py
cd site && python -m http.server 8123
```

**Step 2: Manual verification checklist**

Open `http://localhost:8123` in Chrome:
- [ ] Check DevTools > Application > Manifest — shows "Orar FMI UBB Cluj"
- [ ] Check DevTools > Application > Service Workers — registered, active
- [ ] Check DevTools > Application > Cache Storage — precached URLs present
- [ ] Navigate to a schedule, go offline (DevTools Network > Offline), reload — app works
- [ ] Go back online, hard refresh to trigger SW update flow

**Step 3: Run existing tests to ensure nothing broke**

```bash
python -m pytest tests/ -v
```

Expected: All existing tests pass.

**Step 4: Commit any fixes, then push**

```bash
git push origin main
```
