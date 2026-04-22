import { parseDestinationFromMapsPage } from "./utils/parseCoords";
import { Destination, ExtensionMessage } from "./utils/types";

const RECHECK_DEBOUNCE_MS = 500;

let lastHref = window.location.href;
let lastSentDestinationKey: string | null = null;
let debounceTimer: number | null = null;

function destinationKey(destination: Destination): string {
  return `${destination.coords.lat.toFixed(6)},${destination.coords.lng.toFixed(6)}|${destination.label}`;
}

async function sendDestinationIfChanged(): Promise<void> {
  const destination = parseDestinationFromMapsPage(window.location.href, document);
  if (!destination) {
    console.info("[location-alarm] No destination extracted from Maps page.");
    return;
  }

  const nextKey = destinationKey(destination);
  if (lastSentDestinationKey === nextKey) {
    return;
  }

  const message: ExtensionMessage = { type: "SET_DESTINATION", payload: destination };
  await chrome.runtime.sendMessage(message);
  lastSentDestinationKey = nextKey;
  console.info("[location-alarm] Destination sent.", destination);
}

function scheduleParse(reason: string): void {
  if (debounceTimer !== null) {
    window.clearTimeout(debounceTimer);
  }
  debounceTimer = window.setTimeout(() => {
    debounceTimer = null;
    void sendDestinationIfChanged();
    console.info(`[location-alarm] Destination re-check: ${reason}`);
  }, RECHECK_DEBOUNCE_MS);
}

function checkUrlChange(reason: string): void {
  if (window.location.href === lastHref) {
    return;
  }
  lastHref = window.location.href;
  scheduleParse(reason);
}

function installSpaNavigationHooks(): void {
  const originalPushState = history.pushState.bind(history);
  history.pushState = (...args: Parameters<History["pushState"]>) => {
    originalPushState(...args);
    checkUrlChange("pushState");
  };

  const originalReplaceState = history.replaceState.bind(history);
  history.replaceState = (...args: Parameters<History["replaceState"]>) => {
    originalReplaceState(...args);
    checkUrlChange("replaceState");
  };

  window.addEventListener("popstate", () => checkUrlChange("popstate"));

  // Maps updates portions of the page without full navigations; observe to catch route/title churn.
  const observer = new MutationObserver(() => {
    checkUrlChange("mutation");
  });
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["href"]
  });
}

installSpaNavigationHooks();
scheduleParse("initial");
