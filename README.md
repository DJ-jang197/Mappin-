# Location Alarm (Chrome Extension + Web)

Location Alarm helps you set a destination from Google Maps and get notified when you arrive within a radius.

- **Chrome extension (MV3):** runs on `https://www.google.com/maps/*`, reads URL/DOM in-page, uses the popup for geolocation.
- **Web app:** works in any modern mobile or desktop browser. You **paste a Google Maps URL** (coordinates must appear in the link), then start monitoring. No Chrome APIs; state is stored in `localStorage` on that origin.

## Milestone Status

- M1: done (scaffold/build/load path working)
- M2: done (parser + tests implemented)
- M3: in progress (haversine + popup watchPosition loop implemented)
- M4: not started

## Build and Load

1. Install deps: `npm install`
2. Build: `npm run build`
3. Open `chrome://extensions`
4. Enable **Developer mode**
5. Click **Load unpacked**
6. Select: `C:\Code_Related_Works\VS_Code_Personal\Mappin\Mappin\dist`

## Web app (mobile + desktop)

After `npm run build`, static files are emitted under `dist/web/`:

- `dist/web/index.html` — open in a browser (or host the `dist/web` folder on any static host).
- `dist/web/webApp.js` — bundled application logic (loaded by `index.html`).
- `dist/web/manifest.webmanifest` — minimal PWA manifest (`Add to Home Screen` support varies by browser; you can add icons later).

### Mobile flow

1. In the Google Maps app (or mobile browser), open a place and use **Share** → **Copy link**.
2. Open the Location Alarm web app in your phone browser.
3. Paste the URL. If the link does **not** contain `@lat,lng` or `?q=lat,lng` with numbers, parsing will fail — open the place until the URL includes coordinates, or use the **Chrome extension** on desktop for DOM fallback.
4. Optional: set a **Label**.
5. Tap **Load destination from URL**, then **Start monitoring** and allow location + notifications when prompted.

### Local preview

From the repo root, after a build:

```bash
npx --yes serve dist -p 4173
```

Then open `http://localhost:4173/web/` (note the `/web/` path).

## Manual Test Checklist (M1-M2)

Use this script during local QA and demo recording.

### 0) Pre-flight

- [ ] `npm run build` succeeds
- [ ] Extension loads from `dist` with no red errors in `chrome://extensions`
- [ ] Service worker inspect window opens without runtime exceptions

### 1) Open consoles

- [ ] On Google Maps tab, open DevTools (`F12` or `Ctrl+Shift+I`)
- [ ] Select **Console** tab
- [ ] In console, run `window.location.href` and verify URL starts with `https://www.google.com/maps`

### 2) URL parsing: standard map view

- [ ] Visit `https://www.google.com/maps/@43.4723,-80.5449,14z`
- [ ] Confirm console log indicates destination sent
- [ ] Open popup and click refresh: destination appears

### 3) URL parsing: coordinate query

- [ ] Visit `https://www.google.com/maps?q=43.4723,-80.5449`
- [ ] Confirm destination is extracted and popup displays it

### 4) URL parsing: place-name query + DOM fallback

- [ ] Visit `https://www.google.com/maps?q=University+of+Waterloo`
- [ ] Wait for page content to settle
- [ ] Confirm destination still resolves (meta fallback path)

### 5) Graceful failure: directions without coords

- [ ] Visit `https://www.google.com/maps/dir/Home/Work`
- [ ] Confirm warning log appears (no crash)
- [ ] Popup remains idle/no destination

### 6) Graceful failure: Street View

- [ ] Open a Street View URL or switch to Street View
- [ ] Confirm parse is skipped with warning
- [ ] Confirm no destination update and no uncaught errors

### 7) Multi-tab behavior

- [ ] Open two Maps tabs with different destinations
- [ ] Trigger parse in tab A, then tab B
- [ ] Confirm most recent destination (tab B) is what popup shows

## Manual Test Checklist (M3)

### 1) Haversine sanity

- [ ] Run `npm run test` and confirm `haversine.test.ts` passes
- [ ] Confirm Toronto -> Waterloo check is around 94km

### 2) Popup watch activation

- [ ] Set destination from Google Maps
- [ ] Open popup: it should **not** request location until you tap **Start monitoring** (Chrome needs a user gesture)
- [ ] Tap **Start monitoring** and allow the location prompt if shown; status becomes `ACTIVE`
- [ ] Use the **Arrival radius** slider (50m–2km); confirm the label updates and `chrome.storage.sync` stores `radiusMetres`
- [ ] Confirm distance line shows `arrival ≤ Xm` matching the slider
- [ ] Confirm distance and accuracy text update while popup stays open

### 3) Permission denied handling

- [ ] Block location permission for the extension popup
- [ ] Reopen popup
- [ ] Confirm clear permission-denied error and no active watch

### 4) GPS loss handling

- [ ] Simulate poor/unstable location source
- [ ] Confirm warning appears for timeout/position unavailable
- [ ] Confirm popup does not crash and keeps trying

### 5) Arrival notification and duplicate guard

- [ ] Force location within radius of destination
- [ ] Confirm one arrival notification appears
- [ ] Move away and re-enter radius
- [ ] Confirm notification does not fire repeatedly for the same destination

### 6) Local arrival history

- [ ] Trigger arrivals for more than 5 destinations
- [ ] In service worker console, run `chrome.storage.local.get("alarmHistory")`
- [ ] Confirm only latest 5 entries are retained

## Notes

- Geolocation watch runs in popup context for MV3 reliability.
- Background monitoring stops when popup closes (MVP limitation).
- Google Maps in iframe/embedded surfaces may not execute content scripts depending on host page policies.
- This MVP intentionally avoids paid Maps APIs and external geolocation services.
