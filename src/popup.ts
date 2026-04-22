import "./styles/popup.css";
import { haversine } from "./utils/haversine";
import { AlarmState, ExtensionMessage } from "./utils/types";

const statusEl = document.getElementById("status");
const destinationEl = document.getElementById("destination");
const distanceEl = document.getElementById("distance");
const accuracyEl = document.getElementById("accuracy");
const errorEl = document.getElementById("error");
const refreshButton = document.getElementById("refresh-state");

const GEO_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 30_000,
  timeout: 10_000
};

if (!statusEl || !destinationEl || !distanceEl || !accuracyEl || !errorEl || !refreshButton) {
  throw new Error("Popup UI missing required elements.");
}

const statusNode = statusEl;
const destinationNode = destinationEl;
const distanceNode = distanceEl;
const accuracyNode = accuracyEl;
const errorNode = errorEl;
const refreshNode = refreshButton;

let watchId: number | null = null;
let latestState: AlarmState | null = null;
let arrivalSent = false;

async function setSessionState(nextState: AlarmState): Promise<void> {
  await chrome.storage.session.set({ alarmState: nextState });
}

async function patchSessionState(
  updater: (current: AlarmState) => AlarmState
): Promise<AlarmState | null> {
  if (!latestState) {
    return null;
  }
  const nextState = updater(latestState);
  latestState = nextState;
  await setSessionState(nextState);
  renderState(nextState);
  return nextState;
}

function renderState(state: AlarmState): void {
  if (!state.destination) {
    statusNode.textContent = "IDLE";
  } else if (state.hasArrived) {
    statusNode.textContent = "ARRIVED";
  } else if (state.isActive) {
    statusNode.textContent = "ACTIVE";
  } else {
    statusNode.textContent = "IDLE";
  }

  destinationNode.textContent = state.destination
    ? `${state.destination.label} (${state.destination.coords.lat.toFixed(5)}, ${state.destination.coords.lng.toFixed(5)})`
    : "No destination set yet.";
  if (!state.destination) {
    distanceNode.textContent = "";
    accuracyNode.textContent = "";
  }
}

function stopWatching(): void {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
}

async function notifyArrivedIfNeeded(): Promise<void> {
  if (arrivalSent) {
    return;
  }
  const message: ExtensionMessage = {
    type: "ARRIVED",
    payload: { arrivedAt: Date.now() }
  };
  await chrome.runtime.sendMessage(message);
  arrivalSent = true;
}

function handleGeoPosition(position: GeolocationPosition): void {
  if (!latestState?.destination) {
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

  distanceNode.textContent = `Distance: ${Math.round(distanceMetres)}m`;
  accuracyNode.textContent =
    accuracyMetres > 500
      ? `GPS accuracy warning: ${Math.round(accuracyMetres)}m`
      : `GPS accuracy: ${Math.round(accuracyMetres)}m`;
  errorNode.textContent = "";

  if (distanceMetres <= radiusMetres && !latestState.hasArrived) {
    void patchSessionState((state) => ({ ...state, hasArrived: true, isActive: false }));
    void notifyArrivedIfNeeded();
    stopWatching();
  }
}

function handleGeoError(error: GeolocationPositionError): void {
  if (error.code === error.PERMISSION_DENIED) {
    errorNode.textContent = "Location permission denied. Enable location access in browser settings.";
    void patchSessionState((state) => ({ ...state, isActive: false }));
    stopWatching();
    return;
  }

  if (error.code === error.POSITION_UNAVAILABLE) {
    errorNode.textContent = "GPS signal unavailable. Keeping watch active and retrying.";
    return;
  }

  if (error.code === error.TIMEOUT) {
    errorNode.textContent = "GPS timeout. Waiting for next position update.";
    return;
  }

  errorNode.textContent = "Unexpected geolocation error occurred.";
}

function startWatchIfNeeded(): void {
  if (!latestState?.destination || latestState.hasArrived || watchId !== null) {
    return;
  }

  if (typeof Notification !== "undefined" && Notification.permission === "default") {
    void Notification.requestPermission();
  }

  watchId = navigator.geolocation.watchPosition(handleGeoPosition, handleGeoError, GEO_OPTIONS);
  void patchSessionState((state) => ({ ...state, isActive: true }));
}

async function fetchAndRenderState(startWatch = true): Promise<void> {
  const message: ExtensionMessage = { type: "GET_STATE" };
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok || !response.state) {
    statusNode.textContent = "Unable to load state";
    return;
  }

  latestState = response.state as AlarmState;
  arrivalSent = latestState.hasArrived;
  renderState(latestState);

  if (!latestState.destination || latestState.hasArrived) {
    stopWatching();
    return;
  }

  if (startWatch) {
    startWatchIfNeeded();
  }
}

refreshNode.addEventListener("click", () => {
  void fetchAndRenderState();
});

window.addEventListener("beforeunload", () => {
  stopWatching();
  // Popup closed: MVP limitation is that background monitoring stops.
  void patchSessionState((state) => ({ ...state, isActive: false }));
});

void fetchAndRenderState();
