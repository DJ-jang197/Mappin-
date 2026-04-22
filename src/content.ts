import { Destination, ExtensionMessage } from "./utils/types";

function tryExtractDestinationFromUrl(url: URL): Destination | null {
  const pathMatch = url.pathname.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (!pathMatch) {
    return null;
  }

  const lat = Number(pathMatch[1]);
  const lng = Number(pathMatch[2]);

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return null;
  }

  return {
    coords: { lat, lng },
    label: document.title || "Google Maps destination",
    setAt: Date.now()
  };
}

async function sendDestination(): Promise<void> {
  const destination = tryExtractDestinationFromUrl(new URL(window.location.href));
  if (!destination) {
    console.info("[location-alarm] No destination extracted from URL.");
    return;
  }

  const message: ExtensionMessage = { type: "SET_DESTINATION", payload: destination };
  await chrome.runtime.sendMessage(message);
  console.info("[location-alarm] Destination sent.", destination);
}

void sendDestination();
