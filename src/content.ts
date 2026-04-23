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
  try {
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
  } catch (err) {
    console.error("[location-alarm] Failed to send destination to extension:", err);
  }
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

/**
 * Maps often updates the page (title, meta, panels) when you pick a place before or without
 * changing `location.href`. We must re-parse on those DOM changes — not only when the URL string changes.
 */
function syncHrefAndScheduleParse(reason: string): void {
  lastHref = window.location.href;
  scheduleParse(reason);
}

function installSpaNavigationHooks(): void {
  const originalPushState = history.pushState.bind(history);
  history.pushState = (...args: Parameters<History["pushState"]>) => {
    originalPushState(...args);
    syncHrefAndScheduleParse("pushState");
  };

  const originalReplaceState = history.replaceState.bind(history);
  history.replaceState = (...args: Parameters<History["replaceState"]>) => {
    originalReplaceState(...args);
    syncHrefAndScheduleParse("replaceState");
  };

  window.addEventListener("popstate", () => syncHrefAndScheduleParse("popstate"));

  // Maps updates portions of the page without full navigations; observe to catch route/title churn.
  const observer = new MutationObserver(() => {
    syncHrefAndScheduleParse("mutation");
  });
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    // Place pages update `meta[itemprop=latitude|longitude]` via the `content` attribute; href-only misses that.
    attributeFilter: ["href", "content"]
  });
}

installSpaNavigationHooks();
scheduleParse("initial");
