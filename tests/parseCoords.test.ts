import { parseDestinationFromMapsPage } from "../src/utils/parseCoords";

type FakeMetaMap = Partial<Record<'meta[itemprop="latitude"]' | 'meta[itemprop="longitude"]', string>>;

function createFakeDocument(
  title: string,
  metas: FakeMetaMap = {}
): {
  title: string;
  querySelector: (selector: string) => { getAttribute: (name: string) => string | null } | null;
} {
  return {
    title,
    querySelector: (selector: string) => {
      const content = metas[selector as keyof FakeMetaMap];
      if (!content) {
        return null;
      }
      return {
        getAttribute: (name: string) => (name === "content" ? content : null)
      };
    }
  };
}

describe("parseDestinationFromMapsPage", () => {
  const fixedNow = () => 1_700_000_000_000;

  it("parses coordinates from standard @LAT,LNG URL", () => {
    const doc = createFakeDocument("CN Tower - Google Maps");
    const result = parseDestinationFromMapsPage("https://www.google.com/maps/@43.6426,-79.3871,17z", doc, {
      now: fixedNow
    });

    expect(result).toEqual({
      coords: { lat: 43.6426, lng: -79.3871 },
      label: "CN Tower",
      setAt: fixedNow()
    });
  });

  it("parses coordinates from place detail URL path", () => {
    const doc = createFakeDocument("University of Waterloo - Google Maps");
    const result = parseDestinationFromMapsPage(
      "https://www.google.com/maps/place/University+of+Waterloo/@43.4723,-80.5449,15z",
      doc,
      { now: fixedNow }
    );

    expect(result?.coords).toEqual({ lat: 43.4723, lng: -80.5449 });
  });

  it("parses coordinates from q=LAT,LNG", () => {
    const doc = createFakeDocument("Pinned location - Google Maps");
    const result = parseDestinationFromMapsPage("https://www.google.com/maps?q=43.4723,-80.5449", doc, {
      now: fixedNow
    });

    expect(result?.coords).toEqual({ lat: 43.4723, lng: -80.5449 });
  });

  it("falls back to DOM meta when q is place name", () => {
    const doc = createFakeDocument("Ignored title - Google Maps", {
      'meta[itemprop="latitude"]': "43.4723",
      'meta[itemprop="longitude"]': "-80.5449"
    });
    const result = parseDestinationFromMapsPage(
      "https://www.google.com/maps?q=University+of+Waterloo",
      doc,
      { now: fixedNow }
    );

    expect(result).toEqual({
      coords: { lat: 43.4723, lng: -80.5449 },
      label: "University of Waterloo",
      setAt: fixedNow()
    });
  });

  it("returns null for text q= without DOM fallback", () => {
    const doc = createFakeDocument("Google Maps");
    const logger = { warn: jest.fn() };
    const result = parseDestinationFromMapsPage("https://www.google.com/maps?q=Waterloo+Park", doc, {
      now: fixedNow,
      logger
    });

    expect(result).toBeNull();
    expect(logger.warn).toHaveBeenCalled();
  });

  it("returns null for directions URL without coords and meta", () => {
    const doc = createFakeDocument("Directions - Google Maps");
    const logger = { warn: jest.fn() };
    const result = parseDestinationFromMapsPage("https://www.google.com/maps/dir/Home/Work", doc, {
      now: fixedNow,
      logger
    });

    expect(result).toBeNull();
    expect(logger.warn).toHaveBeenCalled();
  });

  it("parses directions pages when DOM meta coordinates are available", () => {
    const doc = createFakeDocument("Directions - Google Maps", {
      'meta[itemprop="latitude"]': "43.4723",
      'meta[itemprop="longitude"]': "-80.5449"
    });

    const result = parseDestinationFromMapsPage(
      "https://www.google.com/maps/dir/Toronto/Waterloo",
      doc,
      {
        now: fixedNow
      }
    );

    expect(result).toEqual({
      coords: { lat: 43.4723, lng: -80.5449 },
      label: "Directions",
      setAt: fixedNow()
    });
  });

  it("returns null for Street View URLs", () => {
    const doc = createFakeDocument("Street View - Google Maps", {
      'meta[itemprop="latitude"]': "43.1",
      'meta[itemprop="longitude"]': "-80.2"
    });
    const logger = { warn: jest.fn() };
    const result = parseDestinationFromMapsPage(
      "https://www.google.com/maps/@43.6426,-79.3871,3a,75y,90t/data=!3m8!1e1",
      doc,
      {
        now: fixedNow,
        logger
      }
    );

    expect(result).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(
      "[location-alarm] Street View detected. Destination parsing skipped."
    );
  });

  it("rejects out-of-range coordinates and warns", () => {
    const doc = createFakeDocument("Invalid coord pin - Google Maps");
    const logger = { warn: jest.fn() };
    const result = parseDestinationFromMapsPage(
      "https://www.google.com/maps?q=123.456,-80.5449",
      doc,
      {
        now: fixedNow,
        logger
      }
    );

    expect(result).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(
      "[location-alarm] Could not extract coordinates from Maps URL or DOM."
    );
  });

  it("returns null and warns on invalid URL (schema drift-safe)", () => {
    const doc = createFakeDocument("Google Maps");
    const logger = { warn: jest.fn() };
    const result = parseDestinationFromMapsPage("not-a-url", doc, {
      now: fixedNow,
      logger
    });

    expect(result).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(
      "[location-alarm] Invalid URL provided to parseDestinationFromMapsPage."
    );
  });
});
