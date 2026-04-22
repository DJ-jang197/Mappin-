import { haversine } from "../src/utils/haversine";

describe("haversine", () => {
  it("returns ~94km for Toronto to Waterloo", () => {
    const toronto = { lat: 43.6532, lng: -79.3832 };
    const waterloo = { lat: 43.4643, lng: -80.5204 };
    const distance = haversine(toronto, waterloo);
    expect(distance).toBeGreaterThan(93_500);
    expect(distance).toBeLessThan(94_500);
  });

  it("returns 0 for the same point", () => {
    const point = { lat: 43.4723, lng: -80.5449 };
    expect(haversine(point, point)).toBe(0);
  });

  it("returns ~20,015,000m for antipodal points", () => {
    const a = { lat: 10, lng: 20 };
    const b = { lat: -10, lng: 200 };
    const distance = haversine(a, b);
    expect(distance).toBeGreaterThan(20_000_000);
    expect(distance).toBeLessThan(20_020_000);
  });

  it("returns ~20,015,000m from North Pole to South Pole", () => {
    const northPole = { lat: 90, lng: 0 };
    const southPole = { lat: -90, lng: 0 };
    const distance = haversine(northPole, southPole);
    expect(distance).toBeGreaterThan(20_014_000);
    expect(distance).toBeLessThan(20_016_000);
  });
});
