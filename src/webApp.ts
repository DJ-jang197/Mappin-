import "./styles/webApp.css";
import { haversine } from "./utils/haversine";
import { startArrivalVibrationLoop, stopArrivalVibration } from "./utils/arrivalVibration";
import { primeArrivalAlarmAudio, startArrivalAlarmLoop, stopArrivalAlarmLoop } from "./utils/playArrivalAlarm";
import { parseDestinationFromMapsPage } from "./utils/parseCoords";
import { AlarmHistoryEntry, AlarmState, Destination } from "./utils/types";

const STORAGE_STATE = "locationAlarmWeb.state";
const STORAGE_HISTORY = "locationAlarmWeb.history";
const STORAGE_RADIUS = "locationAlarmWeb.radiusMetres";

const RADIUS_MIN_M = 50;
const RADIUS_MAX_M = 2_000;
const RADIUS_DEFAULT_M = 200;

const GEO_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 30_000,
  timeout: 10_000
};

const mapsUrlInput = document.getElementById("maps-url") as HTMLTextAreaElement | null;
const labelOverrideInput = document.getElementById("label-override") as HTMLInputElement | null;
const loadDestButton = document.getElementById("load-destination") as HTMLButtonElement | null;
const statePanel = document.getElementById("state-panel");
const statePill = document.getElementById("state-pill");
const stateDesc = document.getElementById("state-desc");
const destinationEl = document.getElementById("destination");
const radiusSlider = document.getElementById("radius-slider") as HTMLInputElement | null;
const radiusValueEl = document.getElementById("radius-value");
const startButton = document.getElementById("start-monitoring") as HTMLButtonElement | null;
const stopButton = document.getElementById("stop-monitoring") as HTMLButtonElement | null;
const refreshButton = document.getElementById("refresh-state") as HTMLButtonElement | null;
const clearButton = document.getElementById("clear-alarm") as HTMLButtonElement | null;
const arrivalAlarmActions = document.getElementById("arrival-alarm-actions");
const stopAlarmSoundButton = document.getElementById("stop-alarm-sound") as HTMLButtonElement | null;
const arrivalCompleteButton = document.getElementById("arrival-complete") as HTMLButtonElement | null;
const metricsBlock = document.getElementById("metrics-block");
const distanceEl = document.getElementById("distance");
const accuracyBadge = document.getElementById("accuracy-badge");
const errorEl = document.getElementById("error");
const historyList = document.getElementById("history-list");
const historyEmpty = document.getElementById("history-empty");

if (
  !mapsUrlInput ||
  !labelOverrideInput ||
  !loadDestButton ||
  !statePanel ||
  !statePill ||
  !stateDesc ||
  !destinationEl ||
  !radiusSlider ||
  !radiusValueEl ||
  !startButton ||
  !stopButton ||
  !refreshButton ||
  !clearButton ||
  !arrivalAlarmActions ||
  !stopAlarmSoundButton ||
  !arrivalCompleteButton ||
  !metricsBlock ||
  !distanceEl ||
  !accuracyBadge ||
  !errorEl ||
  !historyList ||
  !historyEmpty
) {
  throw new Error("Web app markup is missing required elements.");
}

const mapsUrlNode = mapsUrlInput;
const labelOverrideNode = labelOverrideInput;
const loadDestNode = loadDestButton;
const statePanelNode = statePanel;
const statePillNode = statePill;
const stateDescNode = stateDesc;
const destinationNode = destinationEl;
const radiusNode = radiusSlider;
const radiusValueNode = radiusValueEl;
const startNode = startButton;
const stopNode = stopButton;
const refreshNode = refreshButton;
const clearNode = clearButton;
const arrivalAlarmActionsNode = arrivalAlarmActions;
const stopAlarmSoundNode = stopAlarmSoundButton;
const arrivalCompleteNode = arrivalCompleteButton;
const metricsBlockNode = metricsBlock;
const distanceNode = distanceEl;
const accuracyBadgeNode = accuracyBadge;
const errorNode = errorEl;
const historyListNode = historyList;
const historyEmptyNode = historyEmpty;

let watchId: number | null = null;
let latestState: AlarmState = defaultState();
let arrivalNotified = false;
let radiusDebounce: number | null = null;

function defaultState(): AlarmState {
  return {
    destination: null,
    isActive: false,
    hasArrived: false,
    radiusMetres: RADIUS_DEFAULT_M
  };
}

function emptyDocumentLike(title: string): {
  title: string;
  querySelector: () => null;
} {
  return {
    title,
    querySelector: () => null
  };
}

function loadRadius(): number {
  try {
    const raw = localStorage.getItem(STORAGE_RADIUS);
    if (!raw) {
      return RADIUS_DEFAULT_M;
    }
    const v = Number(raw);
    if (!Number.isFinite(v) || v < RADIUS_MIN_M || v > RADIUS_MAX_M) {
      return RADIUS_DEFAULT_M;
    }
    return Math.round(v);
  } catch {
    return RADIUS_DEFAULT_M;
  }
}

function saveRadius(radiusMetres: number): void {
  localStorage.setItem(STORAGE_RADIUS, String(radiusMetres));
}

function loadState(): AlarmState {
  try {
    const raw = localStorage.getItem(STORAGE_STATE);
    if (!raw) {
      return { ...defaultState(), radiusMetres: loadRadius() };
    }
    const parsed = JSON.parse(raw) as Partial<AlarmState>;
    const radius = loadRadius();
    return {
      destination: parsed.destination ?? null,
      isActive: false,
      hasArrived: Boolean(parsed.hasArrived),
      radiusMetres: radius
    };
  } catch {
    return { ...defaultState(), radiusMetres: loadRadius() };
  }
}

function saveState(state: AlarmState): void {
  const serializable: AlarmState = {
    ...state,
    isActive: false
  };
  localStorage.setItem(STORAGE_STATE, JSON.stringify(serializable));
}

function loadHistory(): AlarmHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_HISTORY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as AlarmHistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHistory(entries: AlarmHistoryEntry[]): void {
  localStorage.setItem(STORAGE_HISTORY, JSON.stringify(entries.slice(0, 5)));
}

function formatArrivedAt(ts: number): string {
  return new Date(ts).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

function renderHistory(history: AlarmHistoryEntry[]): void {
  historyListNode.textContent = "";
  const hasItems = history.length > 0;
  historyEmptyNode.classList.toggle("history-hint--hidden", hasItems);

  for (const entry of history) {
    const li = document.createElement("li");
    li.className = "history-item";
    const label = document.createElement("strong");
    label.textContent = entry.destination.label || "Destination";
    li.appendChild(label);
    const meta = document.createElement("span");
    meta.className = "history-meta";
    const { lat, lng } = entry.destination.coords;
    meta.textContent = `${formatArrivedAt(entry.arrivedAt)} · ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    li.appendChild(meta);
    historyListNode.appendChild(li);
  }
}

function setAccuracyBadge(accuracyMetres: number | null): void {
  if (accuracyMetres === null || !Number.isFinite(accuracyMetres)) {
    accuracyBadgeNode.textContent = "";
    accuracyBadgeNode.classList.add("accuracy-badge--hidden");
    accuracyBadgeNode.classList.remove("accuracy-badge--ok", "accuracy-badge--warn");
    return;
  }

  const rounded = Math.round(accuracyMetres);
  accuracyBadgeNode.textContent = `±${rounded} m`;
  accuracyBadgeNode.classList.remove("accuracy-badge--hidden");
  accuracyBadgeNode.classList.toggle("accuracy-badge--warn", accuracyMetres > 500);
  accuracyBadgeNode.classList.toggle("accuracy-badge--ok", accuracyMetres <= 500);
}

function renderState(): void {
  const state = latestState;
  if (!state.destination) {
    statePanelNode.dataset.state = "idle";
    statePillNode.textContent = "Idle";
    stateDescNode.textContent = "Open Google Maps and pick a destination.";
  } else if (state.hasArrived) {
    statePanelNode.dataset.state = "arrived";
    statePillNode.textContent = "Arrived";
    stateDescNode.textContent = "You entered the arrival radius. Stop the alarm or tap Complete when you are done.";
  } else if (state.isActive) {
    statePanelNode.dataset.state = "active";
    statePillNode.textContent = "Active";
    stateDescNode.textContent = "Monitoring your position. Keep this app open while traveling.";
  } else {
    statePanelNode.dataset.state = "ready";
    statePillNode.textContent = "Ready";
    stateDescNode.textContent = "Destination is set. Tap Start monitoring when you begin traveling.";
  }

  destinationNode.textContent = state.destination
    ? `${state.destination.label} (${state.destination.coords.lat.toFixed(5)}, ${state.destination.coords.lng.toFixed(5)})`
    : "No destination loaded yet.";

  radiusNode.value = String(state.radiusMetres);
  radiusValueNode.textContent = String(state.radiusMetres);

  const showLiveMetrics = Boolean(state.destination) && (state.isActive || watchId !== null) && !state.hasArrived;
  metricsBlockNode.hidden = !showLiveMetrics;

  if (!showLiveMetrics) {
    distanceNode.textContent = "";
    setAccuracyBadge(null);
  }

  const canStart = Boolean(state.destination) && !state.hasArrived && watchId === null;
  startNode.disabled = !canStart;
  startNode.textContent = watchId !== null ? "Monitoring…" : "Start monitoring";
  stopNode.disabled = watchId === null && !state.isActive;

  arrivalAlarmActionsNode.hidden = !state.hasArrived;
}

function stopWatching(): void {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  if (latestState.isActive) {
    latestState = { ...latestState, isActive: false };
    saveState(latestState);
  }
}

function refreshStateFromStorage(): void {
  stopArrivalAlarmLoop();
  stopArrivalVibration();
  stopWatching();
  latestState = loadState();
  arrivalNotified = latestState.hasArrived;
  renderHistory(loadHistory());
  renderState();
}

function showArrivalNotification(destination: Destination): void {
  if (typeof Notification === "undefined") {
    return;
  }
  if (Notification.permission !== "granted") {
    return;
  }
  try {
    new Notification("Mappin' — you've arrived", {
      body: `You arrived at ${destination.label || "your destination"}.`,
      silent: false
    });
  } catch {
    // Ignore notification failures (e.g. mobile policy).
  }
}

function recordArrival(destination: Destination, arrivedAt: number): void {
  const entry: AlarmHistoryEntry = { destination, arrivedAt };
  const next = [entry, ...loadHistory()].slice(0, 5);
  saveHistory(next);
}

async function handleArrival(destination: Destination): Promise<void> {
  const arrivedAt = Date.now();
  startArrivalAlarmLoop();
  startArrivalVibrationLoop();
  latestState = { ...latestState, hasArrived: true, isActive: false };
  saveState(latestState);
  recordArrival(destination, arrivedAt);
  renderHistory(loadHistory());
  showArrivalNotification(destination);
  renderState();
}

function handleGeoPosition(position: GeolocationPosition): void {
  if (!latestState.destination) {
    stopWatching();
    return;
  }

  const current = {
    lat: position.coords.latitude,
    lng: position.coords.longitude
  };
  const accuracyMetres = position.coords.accuracy;
  const destination = latestState.destination.coords;
  const radiusMetres = latestState.radiusMetres;
  const distanceMetres = haversine(current, destination);

  distanceNode.textContent = `Distance: ${Math.round(
    distanceMetres
  )} m · arrival within ${Math.round(radiusMetres)} m`;
  setAccuracyBadge(accuracyMetres);
  errorNode.textContent = "";

  if (distanceMetres <= radiusMetres && !latestState.hasArrived && !arrivalNotified) {
    arrivalNotified = true;
    stopWatching();
    void handleArrival(latestState.destination);
  }
}

function handleGeoError(error: GeolocationPositionError): void {
  if (error.code === error.PERMISSION_DENIED) {
    errorNode.textContent =
      "Location permission denied. On your phone: enable Location for the browser, open site settings for this page, and allow location. Then tap Start monitoring again.";
    stopWatching();
    renderState();
    return;
  }

  if (error.code === error.POSITION_UNAVAILABLE) {
    errorNode.textContent = "GPS signal unavailable. Keeping watch active and retrying.";
    return;
  }

  if (error.code === error.TIMEOUT) {
    errorNode.textContent = "GPS timeout. Waiting for the next position update.";
    return;
  }

  errorNode.textContent = "Unexpected geolocation error.";
}

async function startWatchIfNeeded(): Promise<void> {
  if (!latestState.destination || latestState.hasArrived || watchId !== null) {
    return;
  }

  primeArrivalAlarmAudio();

  if (typeof Notification !== "undefined" && Notification.permission === "default") {
    void Notification.requestPermission();
  }

  watchId = navigator.geolocation.watchPosition(handleGeoPosition, handleGeoError, GEO_OPTIONS);
  latestState = { ...latestState, isActive: true };
  saveState(latestState);
  renderState();

  navigator.geolocation.getCurrentPosition(handleGeoPosition, handleGeoError, GEO_OPTIONS);
}

loadDestNode.addEventListener("click", () => {
  errorNode.textContent = "";
  const href = mapsUrlNode.value.trim();
  if (!href) {
    errorNode.textContent = "Paste a Google Maps URL first.";
    return;
  }

  const labelOverride = labelOverrideNode.value.trim();
  const doc = emptyDocumentLike(labelOverride);
  const parsed = parseDestinationFromMapsPage(href, doc, {
    logger: console
  });

  if (!parsed) {
    errorNode.textContent =
      "Could not read coordinates from that URL. Try a link with @lat,lng in the path or ?q=lat,lng.";
    return;
  }

  const destination: Destination = labelOverride
    ? { ...parsed, label: labelOverride }
    : parsed;

  latestState = {
    ...latestState,
    destination,
    hasArrived: false,
    isActive: false,
    radiusMetres: loadRadius()
  };
  arrivalNotified = false;
  saveState(latestState);
  stopWatching();
  renderState();
});

startNode.addEventListener("click", () => {
  errorNode.textContent = "";
  void (async () => {
    if (!latestState.destination) {
      errorNode.textContent = "Load a destination first.";
      return;
    }
    if (latestState.hasArrived) {
      errorNode.textContent = "Tap Complete to acknowledge this arrival, then you can start monitoring again.";
      return;
    }
    if (watchId !== null) {
      return;
    }
    await startWatchIfNeeded();
  })();
});

stopNode.addEventListener("click", () => {
  errorNode.textContent = "";
  stopWatching();
  renderState();
});

refreshNode.addEventListener("click", () => {
  errorNode.textContent = "";
  refreshStateFromStorage();
});

stopAlarmSoundNode.addEventListener("click", () => {
  errorNode.textContent = "";
  stopArrivalAlarmLoop();
  stopArrivalVibration();
});

arrivalCompleteNode.addEventListener("click", () => {
  errorNode.textContent = "";
  stopArrivalAlarmLoop();
  stopArrivalVibration();
  latestState = { ...latestState, hasArrived: false, isActive: false };
  arrivalNotified = false;
  saveState(latestState);
  renderState();
});

clearNode.addEventListener("click", () => {
  stopArrivalAlarmLoop();
  stopArrivalVibration();
  stopWatching();
  latestState = {
    ...defaultState(),
    radiusMetres: loadRadius()
  };
  arrivalNotified = false;
  saveState(latestState);
  mapsUrlNode.value = "";
  labelOverrideNode.value = "";
  errorNode.textContent = "";
  distanceNode.textContent = "";
  setAccuracyBadge(null);
  renderState();
});

radiusNode.addEventListener("input", () => {
  const value = Number(radiusNode.value);
  if (!Number.isFinite(value)) {
    return;
  }
  radiusValueNode.textContent = String(value);
  if (radiusDebounce !== null) {
    window.clearTimeout(radiusDebounce);
  }
  radiusDebounce = window.setTimeout(() => {
    radiusDebounce = null;
    const clamped = Math.min(RADIUS_MAX_M, Math.max(RADIUS_MIN_M, Math.round(value)));
    saveRadius(clamped);
    latestState = { ...latestState, radiusMetres: clamped };
    saveState(latestState);
    radiusNode.value = String(clamped);
    radiusValueNode.textContent = String(clamped);
  }, 100);
});

window.addEventListener("beforeunload", () => {
  stopArrivalAlarmLoop();
  stopArrivalVibration();
  stopWatching();
});

latestState = loadState();
if (latestState.isActive) {
  latestState = { ...latestState, isActive: false };
  saveState(latestState);
}
renderHistory(loadHistory());
renderState();
