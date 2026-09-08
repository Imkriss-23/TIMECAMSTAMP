# Timestamp Camera

A free, no-ads, no-tracking camera app that stamps date, time, and location
on your photos. Runs entirely in the browser — nothing is uploaded anywhere,
photos are stored only on your device (IndexedDB).

## Features
- Live camera preview (front/back switch)
- Live timestamp overlay so you see the stamp before you shoot
- Date, time, location (reverse-geocoded to a place name, falls back to lat/lon)
- Optional custom label text
- Configurable stamp position and text size
- On-device gallery with download-to-device
- Installable as a PWA (Add to Home Screen) — works offline after first load

## Run locally
Just open `index.html` via a local server (camera access requires HTTPS or
localhost — it won't work from a plain `file://` path):

```bash
npx serve .
# or
python3 -m http.server 8000
```

Then visit `http://localhost:PORT` on your phone (same Wi-Fi) or use ngrok
for a real HTTPS tunnel if testing camera/geolocation on a physical device
without deploying yet.

## Deploy for free (GitHub + Vercel)

1. Push this folder to a new GitHub repo.
2. Go to [vercel.com](https://vercel.com), sign in with GitHub, click
   **New Project**, and import the repo.
3. Leave all build settings blank/default — this is a static site, no
   framework, no build step. Deploy.
4. Vercel gives you a free `https://your-app.vercel.app` URL. That's your
   live, installable app.

## Turn it into an installable Android app (optional, still free)

You don't need Android Studio for this:

1. Go to [pwabuilder.com](https://www.pwabuilder.com).
2. Paste in your Vercel URL.
3. PWABuilder scores your PWA (manifest, service worker, icons — this
   project already has all three) and lets you generate a signed **Android
   Package (APK/AAB)** you can sideload or publish to the Play Store.

Until then, anyone can just open the Vercel link in Chrome on Android and
tap **"Add to Home Screen"** — it installs and behaves like a native app,
with an icon and everything, no Play Store needed.

## Notes on permissions
- **Camera**: required, prompted on first load.
- **Location**: required for the location stamp; if denied, the app still
  works and just shows "Location unavailable" in the stamp (toggle it off
  in Settings if you don't want it).
- Reverse geocoding (turning coordinates into a place name) uses the free
  OpenStreetMap Nominatim API. If you're offline or it's unreachable, the
  app falls back to raw latitude/longitude — capture never breaks.

## Customizing icons
Icons live in `icons/icon-192.png` and `icons/icon-512.png`. Replace them
with your own artwork (same filenames/sizes) any time — no code changes
needed.
