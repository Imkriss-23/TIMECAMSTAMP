// ---------- State ----------
const state = {
  facingMode: 'environment',
  stream: null,
  coords: null,
  placeName: null,
  settings: {
    showDatetime: true,
    showLocation: true,
    showLabel: false,
    customLabel: '',
    position: 'bottom-left',
    fontSize: 22,
    dateFormat: 'dmy',
    timerDuration: 3
  },
  lastCaptureDataUrl: null,
  locationStampOn: true,
  gridOn: false,
  flashMode: 'off', // 'off' | 'on' | 'torch'
  timerOn: false,
  torchTrack: null
};

const DB_NAME = 'timestamp-camera-db';
const STORE_NAME = 'photos';

// ---------- Elements ----------
const video = document.getElementById('video');
const overlayCanvas = document.getElementById('overlay-canvas');
const overlayCtx = overlayCanvas.getContext('2d');
const gridCanvas = document.getElementById('grid-canvas');
const gridCtx = gridCanvas.getContext('2d');
const locationStatus = document.getElementById('location-status');
const lastThumb = document.getElementById('last-thumb');
const timerCountdownEl = document.getElementById('timer-countdown');

const screens = {
  camera: document.getElementById('camera-screen'),
  preview: document.getElementById('preview-screen'),
  gallery: document.getElementById('gallery-screen'),
  settings: document.getElementById('settings-screen')
};

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
}

// ---------- IndexedDB helpers ----------
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function savePhoto(dataUrl) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).add({ dataUrl, ts: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getAllPhotos() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result.sort((a, b) => b.ts - a.ts));
    req.onerror = () => reject(req.error);
  });
}

// ---------- Settings persistence ----------
function loadSettings() {
  try {
    const raw = localStorage.getItem('tsc-settings');
    if (raw) Object.assign(state.settings, JSON.parse(raw));
  } catch (e) { /* ignore */ }
  state.locationStampOn = state.settings.showLocation;
  syncSettingsUI();
}
function saveSettings() {
  localStorage.setItem('tsc-settings', JSON.stringify(state.settings));
}
function syncSettingsUI() {
  document.getElementById('toggle-datetime').checked = state.settings.showDatetime;
  document.getElementById('toggle-location').checked = state.settings.showLocation;
  document.getElementById('toggle-label').checked = state.settings.showLabel;
  document.getElementById('custom-label-input').value = state.settings.customLabel;
  document.getElementById('position-select').value = state.settings.position;
  document.getElementById('fontsize-range').value = state.settings.fontSize;
  document.getElementById('dateformat-select').value = state.settings.dateFormat;
  document.getElementById('timer-duration-select').value = state.settings.timerDuration;
  locationToggleBtn.classList.toggle('active', state.locationStampOn);
}

// ---------- Camera ----------
async function startCamera() {
  if (state.stream) {
    state.stream.getTracks().forEach(t => t.stop());
  }
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: state.facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false
    });
    video.srcObject = state.stream;
    const track = state.stream.getVideoTracks()[0];
    state.torchTrack = track || null;
    // Re-apply torch if flash was set to "on" before switching cameras
    if (state.flashMode === 'torch') applyTorch(true);
  } catch (err) {
    alert('Camera access failed: ' + err.message);
  }
}

async function applyTorch(on) {
  if (!state.torchTrack) return;
  const caps = state.torchTrack.getCapabilities ? state.torchTrack.getCapabilities() : {};
  if (!caps.torch) return;
  try {
    await state.torchTrack.applyConstraints({ advanced: [{ torch: on }] });
  } catch (e) { /* not all devices support this */ }
}

document.getElementById('flip-btn').addEventListener('click', () => {
  state.facingMode = state.facingMode === 'environment' ? 'user' : 'environment';
  startCamera();
});

// ---------- Geolocation ----------
function startLocationWatch() {
  if (!navigator.geolocation) {
    locationStatus.textContent = '📍 Not supported';
    return;
  }
  navigator.geolocation.watchPosition(
    async (pos) => {
      state.coords = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      locationStatus.textContent = `📍 ${state.coords.lat.toFixed(4)}, ${state.coords.lon.toFixed(4)}`;
      reverseGeocode(state.coords.lat, state.coords.lon);
    },
    () => { locationStatus.textContent = '📍 Location off'; },
    { enableHighAccuracy: true, maximumAge: 15000, timeout: 10000 }
  );
}

// Best-effort, free reverse geocoding. Fails silently (falls back to lat/lon).
async function reverseGeocode(lat, lon) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=14`, {
      headers: { 'Accept-Language': 'en' }
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data && data.display_name) {
      const parts = data.display_name.split(',').map(s => s.trim());
      state.placeName = parts.slice(0, 3).join(', ');
      locationStatus.textContent = `📍 ${state.placeName}`;
    }
  } catch (e) { /* offline or blocked — lat/lon fallback already shown */ }
}

// ---------- Top toolbar: location toggle, timer, flash, grid ----------
const locationToggleBtn = document.getElementById('location-toggle-btn');
const timerBtn = document.getElementById('timer-btn');
const flashBtn = document.getElementById('flash-btn');
const gridBtn = document.getElementById('grid-btn');

locationToggleBtn.addEventListener('click', () => {
  state.locationStampOn = !state.locationStampOn;
  state.settings.showLocation = state.locationStampOn;
  saveSettings();
  locationToggleBtn.classList.toggle('active', state.locationStampOn);
  syncSettingsUI();
});

timerBtn.addEventListener('click', () => {
  state.timerOn = !state.timerOn;
  timerBtn.classList.toggle('active', state.timerOn);
});

const flashCycle = ['off', 'on', 'torch'];
const flashIcons = { off: '⚡', on: '⚡', torch: '🔦' };
flashBtn.addEventListener('click', async () => {
  const idx = flashCycle.indexOf(state.flashMode);
  state.flashMode = flashCycle[(idx + 1) % flashCycle.length];
  flashBtn.textContent = flashIcons[state.flashMode];
  flashBtn.classList.toggle('active', state.flashMode !== 'off');
  if (state.flashMode === 'torch') {
    await applyTorch(true);
  } else {
    await applyTorch(false);
  }
});

gridBtn.addEventListener('click', () => {
  state.gridOn = !state.gridOn;
  gridBtn.classList.toggle('active', state.gridOn);
  drawGrid();
});

function drawGrid() {
  gridCanvas.width = gridCanvas.clientWidth;
  gridCanvas.height = gridCanvas.clientHeight;
  gridCtx.clearRect(0, 0, gridCanvas.width, gridCanvas.height);
  if (!state.gridOn) return;
  const w = gridCanvas.width, h = gridCanvas.height;
  gridCtx.strokeStyle = 'rgba(255,255,255,0.4)';
  gridCtx.lineWidth = 1;
  for (let i = 1; i < 3; i++) {
    const x = (w / 3) * i;
    gridCtx.beginPath(); gridCtx.moveTo(x, 0); gridCtx.lineTo(x, h); gridCtx.stroke();
    const y = (h / 3) * i;
    gridCtx.beginPath(); gridCtx.moveTo(0, y); gridCtx.lineTo(w, y); gridCtx.stroke();
  }
}
window.addEventListener('resize', drawGrid);

function runShutterFlashEffect() {
  if (state.flashMode !== 'on') return;
  const flash = document.createElement('div');
  flash.style.cssText = 'position:fixed;inset:0;background:#fff;z-index:9999;opacity:0.85;pointer-events:none;';
  document.body.appendChild(flash);
  requestAnimationFrame(() => {
    flash.style.transition = 'opacity 200ms ease-out';
    flash.style.opacity = '0';
    setTimeout(() => flash.remove(), 220);
  });
}

function waitForTimer() {
  return new Promise(resolve => {
    if (!state.timerOn) return resolve();
    let remaining = state.settings.timerDuration;
    timerCountdownEl.classList.remove('hidden');
    timerCountdownEl.textContent = remaining;
    const iv = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        clearInterval(iv);
        timerCountdownEl.classList.add('hidden');
        resolve();
      } else {
        timerCountdownEl.textContent = remaining;
      }
    }, 1000);
  });
}

// ---------- Mode tabs (Photo / Video) ----------
document.getElementById('mode-photo').addEventListener('click', () => setMode('photo'));
document.getElementById('mode-video').addEventListener('click', () => setMode('video'));
function setMode(mode) {
  document.getElementById('mode-photo').classList.toggle('active', mode === 'photo');
  document.getElementById('mode-video').classList.toggle('active', mode === 'video');
  if (mode === 'video') {
    alert('Video mode is coming soon — this version captures timestamped photos.');
    setMode('photo');
  }
}

// ---------- Stamp text building ----------
function formatDate(d) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  switch (state.settings.dateFormat) {
    case 'mdy': return `${mm}/${dd}/${yyyy}`;
    case 'ymd': return `${yyyy}-${mm}-${dd}`;
    default: return `${dd}/${mm}/${yyyy}`;
  }
}
function formatTime(d) {
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}
function getTimezoneLabel() {
  try {
    const offsetMin = -new Date().getTimezoneOffset();
    const sign = offsetMin >= 0 ? '+' : '-';
    const abs = Math.abs(offsetMin);
    const hh = String(Math.floor(abs / 60)).padStart(2, '0');
    const mm = String(abs % 60).padStart(2, '0');
    return `GMT${sign}${hh}:${mm}`;
  } catch (e) { return ''; }
}

function buildStampLines() {
  const lines = [];
  const now = new Date();

  if (state.settings.showDatetime) {
    lines.push(`${formatDate(now)}  ${formatTime(now)}  ${getTimezoneLabel()}`);
  }

  if (state.settings.showLocation) {
    if (state.placeName) lines.push(state.placeName);
    else if (state.coords) lines.push('Location unavailable');

    if (state.coords) {
      const latDir = state.coords.lat >= 0 ? 'N' : 'S';
      const lonDir = state.coords.lon >= 0 ? 'E' : 'W';
      lines.push(`${Math.abs(state.coords.lat).toFixed(5)}°${latDir}, ${Math.abs(state.coords.lon).toFixed(5)}°${lonDir}`);
    } else if (!state.placeName) {
      lines.push('Location unavailable');
    }
  }

  if (state.settings.showLabel && state.settings.customLabel.trim()) {
    lines.push(state.settings.customLabel.trim());
  }
  return lines;
}

function wrapLine(ctx, text, maxWidth) {
  const words = text.split(' ');
  const wrapped = [];
  let current = '';
  for (const word of words) {
    const test = current ? current + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      wrapped.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) wrapped.push(current);
  return wrapped;
}

function drawStamp(ctx, canvasW, canvasH) {
  const rawLines = buildStampLines();
  if (rawLines.length === 0) return;

  const fontSize = Math.round((state.settings.fontSize / 400) * canvasW) || state.settings.fontSize;
  const padding = fontSize * 0.6;
  const lineHeight = fontSize * 1.35;
  const margin = fontSize * 0.8;
  const maxBoxW = canvasW - margin * 2;
  const maxTextW = maxBoxW - padding * 2;

  ctx.font = `600 ${fontSize}px -apple-system, Roboto, sans-serif`;
  ctx.textBaseline = 'bottom';

  // Wrap any line that's too wide for the frame
  const lines = [];
  rawLines.forEach(l => {
    if (ctx.measureText(l).width > maxTextW) {
      lines.push(...wrapLine(ctx, l, maxTextW));
    } else {
      lines.push(l);
    }
  });

  const widths = lines.map(l => ctx.measureText(l).width);
  const boxW = Math.min(Math.max(...widths) + padding * 2, maxBoxW);
  const boxH = lines.length * lineHeight + padding * 1.2;

  let x, y;
  const pos = state.settings.position;
  if (pos.includes('right')) x = canvasW - boxW - margin;
  else x = margin;
  if (pos.includes('bottom')) y = canvasH - boxH - margin;
  else y = margin;

  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  roundRect(ctx, x, y, boxW, boxH, 8);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 3;
  lines.forEach((line, i) => {
    const ty = y + padding * 0.6 + lineHeight * (i + 1);
    ctx.fillText(line, x + padding, ty);
  });
  ctx.shadowBlur = 0;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Live preview overlay on the camera feed (visual only, low-res is fine)
function renderLiveOverlay() {
  if (video.videoWidth) {
    overlayCanvas.width = overlayCanvas.clientWidth;
    overlayCanvas.height = overlayCanvas.clientHeight;
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    drawStamp(overlayCtx, overlayCanvas.width, overlayCanvas.height);
  }
  requestAnimationFrame(renderLiveOverlay);
}

// ---------- Capture ----------
document.getElementById('shutter-btn').addEventListener('click', async () => {
  await waitForTimer();

  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  // Mirror front camera for a natural-looking saved photo
  if (state.facingMode === 'user') {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, 0, 0, w, h);
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  drawStamp(ctx, w, h);
  runShutterFlashEffect();

  state.lastCaptureDataUrl = canvas.toDataURL('image/jpeg', 0.92);
  document.getElementById('preview-img').src = state.lastCaptureDataUrl;
  showScreen('preview');
});

document.getElementById('discard-btn').addEventListener('click', () => {
  state.lastCaptureDataUrl = null;
  showScreen('camera');
});

document.getElementById('save-btn').addEventListener('click', async () => {
  if (!state.lastCaptureDataUrl) return;
  await savePhoto(state.lastCaptureDataUrl);
  setLastThumb(state.lastCaptureDataUrl);
  state.lastCaptureDataUrl = null;
  showScreen('camera');
});

function setLastThumb(dataUrl) {
  lastThumb.src = dataUrl;
  lastThumb.classList.add('has-photo');
}

// ---------- Gallery ----------
document.getElementById('gallery-btn').addEventListener('click', async () => {
  await renderGallery();
  showScreen('gallery');
});
document.getElementById('gallery-back-btn').addEventListener('click', () => showScreen('camera'));

async function renderGallery() {
  const grid = document.getElementById('gallery-grid');
  const empty = document.getElementById('gallery-empty');
  const photos = await getAllPhotos();
  grid.innerHTML = '';
  empty.style.display = photos.length ? 'none' : 'block';
  photos.forEach(p => {
    const img = document.createElement('img');
    img.src = p.dataUrl;
    img.addEventListener('click', () => downloadPhoto(p.dataUrl, p.ts));
    grid.appendChild(img);
  });
}

function downloadPhoto(dataUrl, ts) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `timestamp-${ts}.jpg`;
  a.click();
}

// ---------- Settings screen ----------
document.getElementById('settings-btn').addEventListener('click', () => showScreen('settings'));
document.getElementById('settings-back-btn').addEventListener('click', () => showScreen('camera'));

document.getElementById('toggle-datetime').addEventListener('change', e => {
  state.settings.showDatetime = e.target.checked; saveSettings();
});
document.getElementById('toggle-location').addEventListener('change', e => {
  state.settings.showLocation = e.target.checked;
  state.locationStampOn = e.target.checked;
  locationToggleBtn.classList.toggle('active', state.locationStampOn);
  saveSettings();
});
document.getElementById('toggle-label').addEventListener('change', e => {
  state.settings.showLabel = e.target.checked; saveSettings();
});
document.getElementById('custom-label-input').addEventListener('input', e => {
  state.settings.customLabel = e.target.value; saveSettings();
});
document.getElementById('position-select').addEventListener('change', e => {
  state.settings.position = e.target.value; saveSettings();
});
document.getElementById('fontsize-range').addEventListener('input', e => {
  state.settings.fontSize = Number(e.target.value); saveSettings();
});
document.getElementById('dateformat-select').addEventListener('change', e => {
  state.settings.dateFormat = e.target.value; saveSettings();
});
document.getElementById('timer-duration-select').addEventListener('change', e => {
  state.settings.timerDuration = Number(e.target.value); saveSettings();
});

// ---------- Init ----------
async function initThumb() {
  const photos = await getAllPhotos();
  if (photos.length) setLastThumb(photos[0].dataUrl);
}

loadSettings();
locationToggleBtn.classList.toggle('active', state.locationStampOn);
startCamera();
startLocationWatch();
renderLiveOverlay();
drawGrid();
initThumb();

// Register service worker for installability / offline use
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
