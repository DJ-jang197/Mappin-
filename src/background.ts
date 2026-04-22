import { AlarmState, ExtensionMessage } from "./utils/types";

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
      await setSessionState({ ...state, hasArrived: true, isActive: false });
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
