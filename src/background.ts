import { AlarmHistoryEntry, AlarmState, ExtensionMessage } from "./utils/types";

const DEFAULT_STATE: AlarmState = {
  destination: null,
  isActive: false,
  hasArrived: false,
  radiusMetres: 200
};

const RADIUS_MIN_M = 50;
const RADIUS_MAX_M = 2_000;
const RADIUS_DEFAULT_M = 200;

async function getSessionState(): Promise<AlarmState> {
  const result = await chrome.storage.session.get("alarmState");
  return (result.alarmState as AlarmState | undefined) ?? DEFAULT_STATE;
}

async function getRadiusFromSync(): Promise<number> {
  const result = await chrome.storage.sync.get("radiusMetres");
  const v = result.radiusMetres;
  if (typeof v === "number" && Number.isFinite(v) && v >= RADIUS_MIN_M && v <= RADIUS_MAX_M) {
    return Math.round(v);
  }
  return RADIUS_DEFAULT_M;
}

async function getFullState(): Promise<AlarmState> {
  const session = await getSessionState();
  const radius = await getRadiusFromSync();
  return { ...session, radiusMetres: radius };
}

async function setSessionState(next: AlarmState): Promise<void> {
  await chrome.storage.session.set({ alarmState: next });
}

async function appendArrivalHistory(entry: AlarmHistoryEntry): Promise<void> {
  const result = await chrome.storage.local.get("alarmHistory");
  const current = (result.alarmHistory as AlarmHistoryEntry[] | undefined) ?? [];
  const next = [entry, ...current].slice(0, 5);
  await chrome.storage.local.set({ alarmHistory: next });
}

chrome.runtime.onInstalled.addListener(async (details) => {
  const sync = await chrome.storage.sync.get("radiusMetres");
  if (typeof sync.radiusMetres !== "number") {
    await chrome.storage.sync.set({ radiusMetres: RADIUS_DEFAULT_M });
  }
  if (details.reason === "install") {
    const radius = await getRadiusFromSync();
    await setSessionState({ ...DEFAULT_STATE, radiusMetres: radius });
  }
});

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _, sendResponse) => {
  void (async () => {
    if (message.type === "SET_DESTINATION") {
      const state = await getFullState();
      await setSessionState({
        ...state,
        destination: message.payload,
        isActive: false,
        hasArrived: false
      });
      sendResponse({ ok: true, state: await getFullState() });
      return;
    }

    if (message.type === "CLEAR_ALARM") {
      const state = await getFullState();
      await setSessionState({ ...DEFAULT_STATE, radiusMetres: state.radiusMetres });
      sendResponse({ ok: true, state: await getFullState() });
      return;
    }

    if (message.type === "SET_RADIUS") {
      const raw = message.payload.radiusMetres;
      const r = Math.round(raw);
      if (!Number.isFinite(r) || r < RADIUS_MIN_M || r > RADIUS_MAX_M) {
        sendResponse({ ok: false, error: "Invalid radius" });
        return;
      }
      await chrome.storage.sync.set({ radiusMetres: r });
      const session = await getSessionState();
      await setSessionState({ ...session, radiusMetres: r });
      sendResponse({ ok: true, state: await getFullState() });
      return;
    }

    if (message.type === "ARRIVED") {
      const state = await getFullState();
      if (!state.destination || state.hasArrived) {
        sendResponse({ ok: true, skipped: true });
        return;
      }

      const historyEntry: AlarmHistoryEntry = {
        destination: state.destination,
        arrivedAt: message.payload.arrivedAt
      };
      await setSessionState({ ...state, hasArrived: true, isActive: false });
      await appendArrivalHistory(historyEntry);
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icon-128.png",
        title: "Location reached",
        message: `You arrived at ${state.destination.label || "your destination"}.`
      });
      sendResponse({ ok: true, state: await getFullState() });
      return;
    }

    if (message.type === "GET_STATE") {
      sendResponse({ ok: true, state: await getFullState() });
      return;
    }

    sendResponse({ ok: false, error: "Unknown message type" });
  })();

  return true;
});
