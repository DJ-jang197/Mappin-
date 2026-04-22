import "./styles/popup.css";
import { AlarmState, ExtensionMessage } from "./utils/types";

const statusEl = document.getElementById("status");
const destinationEl = document.getElementById("destination");
const refreshButton = document.getElementById("refresh-state");

if (!statusEl || !destinationEl || !refreshButton) {
  throw new Error("Popup UI missing required elements.");
}

const statusNode = statusEl;
const destinationNode = destinationEl;
const refreshNode = refreshButton;

function renderState(state: AlarmState): void {
  statusNode.textContent = state.destination ? "Destination detected" : "Idle";
  destinationNode.textContent = state.destination
    ? `${state.destination.label} (${state.destination.coords.lat.toFixed(5)}, ${state.destination.coords.lng.toFixed(5)})`
    : "No destination set yet.";
}

async function fetchAndRenderState(): Promise<void> {
  const message: ExtensionMessage = { type: "GET_STATE" };
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok || !response.state) {
    statusNode.textContent = "Unable to load state";
    return;
  }
  renderState(response.state as AlarmState);
}

refreshNode.addEventListener("click", () => {
  void fetchAndRenderState();
});

void fetchAndRenderState();
