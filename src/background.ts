import { AlarmHistoryEntry, AlarmState, ExtensionMessage } from "./utils/types";

const DEFAULT_STATE: AlarmState = {
  destination: null,
  isActive: false,
  hasArrived: false,
  radiusMetres: 200
};

async function getSessionState(): Promise<AlarmState> {
  const result = await chrome.storage.session.get("alarmState");
  return (result.alarmState as AlarmState | undefined) ?? DEFAULT_STATE;
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

chrome.runtime.onInstalled.addListener(async () => {
  await setSessionState(DEFAULT_STATE);
});

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _, sendResponse) => {
  void (async () => {
    const state = await getSessionState();

    if (message.type === "SET_DESTINATION") {
      await setSessionState({
        ...state,
        destination: message.payload,
        isActive: false,
        hasArrived: false
      });
      sendResponse({ ok: true });
      return;
    }

    if (message.type === "CLEAR_ALARM") {
      await setSessionState({ ...DEFAULT_STATE, radiusMetres: state.radiusMetres });
      sendResponse({ ok: true });
      return;
    }

    if (message.type === "ARRIVED") {
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
      sendResponse({ ok: true });
      return;
    }

    if (message.type === "GET_STATE") {
      sendResponse({ ok: true, state });
      return;
    }

    sendResponse({ ok: false, error: "Unknown message type" });
  })();

  return true;
});
