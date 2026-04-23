import { Destination } from "./types";

const PATH_REGEX = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/;
/** Many Maps deep links encode lat/lng as !3dLAT!4dLNG in the URL fragment or path. */
const DATA_3D_4D_REGEX = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/;
const COORDS_QUERY_VALUE_REGEX = /^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/;

interface DocumentLike {
  title: string;
  querySelector(selectors: string): ElementLike | null;
}

interface ElementLike {
  getAttribute(name: string): string | null;
}

interface ParseOptions {
  now?: () => number;
  logger?: Pick<Console, "warn">;
}

function toNumber(raw: string): number | null {
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function isValidLatitude(lat: number): boolean {
  return lat >= -90 && lat <= 90;
}

function isValidLongitude(lng: number): boolean {
  return lng >= -180 && lng <= 180;
}

function areValidCoordinates(lat: number, lng: number): boolean {
  return isValidLatitude(lat) && isValidLongitude(lng);
}

function readLabelFromTitle(title: string): string {
  const cleaned = title.replace(/\s*-\s*Google Maps\s*$/i, "").trim();
  return cleaned || "Google Maps destination";
}

function decodeQueryLabel(queryValue: string): string {
  return queryValue.replace(/\+/g, " ").trim();
}

function isStreetViewUrl(url: URL): boolean {
  return url.searchParams.get("map_action") === "pano" || url.href.includes(",3a,");
}

function parseFromMeta(doc: DocumentLike): { lat: number; lng: number } | null {
  const latMeta = doc.querySelector('meta[itemprop="latitude"]');
  const lngMeta = doc.querySelector('meta[itemprop="longitude"]');
  if (!latMeta || !lngMeta) {
    return null;
  }

  const lat = toNumber(latMeta.getAttribute("content") ?? "");
  const lng = toNumber(lngMeta.getAttribute("content") ?? "");
  if (lat === null || lng === null) {
    return null;
  }
  if (!areValidCoordinates(lat, lng)) {
    return null;
  }

  return { lat, lng };
}

export function parseDestinationFromMapsPage(
  locationHref: string,
  doc: DocumentLike,
  options: ParseOptions = {}
): Destination | null {
  const now = options.now ?? Date.now;
  const logger = options.logger ?? console;

  let url: URL;
  try {
    url = new URL(locationHref);
  } catch {
    logger.warn("[location-alarm] Invalid URL provided to parseDestinationFromMapsPage.");
    return null;
  }

  if (isStreetViewUrl(url)) {
    logger.warn("[location-alarm] Street View detected. Destination parsing skipped.");
    return null;
  }

  const hrefForAt = `${url.pathname}${url.search}${url.hash}`;
  const pathMatch = hrefForAt.match(PATH_REGEX);
  if (pathMatch) {
    const lat = toNumber(pathMatch[1]);
    const lng = toNumber(pathMatch[2]);
    if (lat !== null && lng !== null && areValidCoordinates(lat, lng)) {
      return {
        coords: { lat, lng },
        label: readLabelFromTitle(doc.title),
        setAt: now()
      };
    }
  }

  const dataMatch = url.href.match(DATA_3D_4D_REGEX);
  if (dataMatch) {
    const lat = toNumber(dataMatch[1]);
    const lng = toNumber(dataMatch[2]);
    if (lat !== null && lng !== null && areValidCoordinates(lat, lng)) {
      return {
        coords: { lat, lng },
        label: readLabelFromTitle(doc.title),
        setAt: now()
      };
    }
  }

  const qParam = url.searchParams.get("q");
  if (qParam) {
    const queryCoords = qParam.match(COORDS_QUERY_VALUE_REGEX);
    if (queryCoords) {
      const lat = toNumber(queryCoords[1]);
      const lng = toNumber(queryCoords[2]);
      if (lat !== null && lng !== null && areValidCoordinates(lat, lng)) {
        return {
          coords: { lat, lng },
          label: readLabelFromTitle(doc.title),
          setAt: now()
        };
      }
    }
  }

  const metaCoords = parseFromMeta(doc);
  if (metaCoords) {
    const queryLabel = qParam ? decodeQueryLabel(qParam) : "";
    return {
      coords: metaCoords,
      label: queryLabel || readLabelFromTitle(doc.title),
      setAt: now()
    };
  }

  logger.warn("[location-alarm] Could not extract coordinates from Maps URL or DOM.");
  return null;
}
