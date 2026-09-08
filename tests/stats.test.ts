import { describe, expect, it } from "vitest";
import { CHART_BOX, chartGeometry, niceTick } from "../src/chart";
import { buildDaySeries, extremes, integrate, startOfToday } from "../src/stats";
import { sunTimes } from "../src/sun";

const NOW = new Date("2026-09-07T13:45:00+02:00");
const MIDNIGHT = startOfToday(NOW).getTime();
/** Minutes before now, so the fixtures hold in any timezone. */
const ago = (minutes: number) => NOW.getTime() - minutes * 60 * 1000;
const bucket = (minutes: number) => MIDNIGHT + minutes * 60 * 1000;

describe("buildDaySeries", () => {
  // An hour apart, because buildDaySeries takes its resampling step from the
  // gap between the first two rows.
  const solar = [
    { start: ago(190), mean: 0, max: 0 },
    { start: ago(130), mean: 1200, max: 1500 },
    { start: ago(70), mean: 8000, max: 9931 },
    { start: ago(10), mean: 5141, max: 6000 }
  ];
  const house = [
    { start: ago(190), mean: 400, max: 600 },
    { start: ago(130), mean: 900, max: 1200 },
    { start: ago(70), mean: 2000, max: 2500 },
    { start: ago(10), mean: 2723, max: 3000 }
  ];

  it("converts watts to kilowatts", () => {
    const series = buildDaySeries(solar, house, 1000, NOW);
    expect(Math.max(...series.solar)).toBeCloseTo(8, 1);
    expect(series.solarPeak).toBeCloseTo(9.931, 3);
  });

  it("averages only the requested window", () => {
    // Thirty minutes back reaches the newest row and no further.
    const series = buildDaySeries(solar, house, 1000, NOW, 30);
    expect(series.houseAverage).toBeCloseTo(2.723, 3);
    expect(series.houseSpread).toBeCloseTo(0, 5);
  });

  it("widens the average as the window grows", () => {
    const series = buildDaySeries(solar, house, 1000, NOW, 90);
    expect(series.houseAverage).toBeCloseTo((2.0 + 2.723) / 2, 3);
    expect(series.houseSpread).toBeGreaterThan(0);
  });

  it("starts at midnight and ends now", () => {
    const series = buildDaySeries(solar, house, 1000, NOW);
    expect(series.timestamps[0]).toBe(MIDNIGHT);
    expect(series.timestamps.at(-1)).toBe(NOW.getTime());
  });

  it("survives a sensor with no rows at all", () => {
    const series = buildDaySeries([], house, 1000, NOW);
    expect(series.solar.every((value) => value === 0)).toBe(true);
    expect(series.solarPeak).toBeUndefined();
  });
});

describe("integrate", () => {
  it("turns a flat kilowatt line into kilowatt hours", () => {
    const hours = [0, 1, 2].map((h) => MIDNIGHT + h * 3600000);
    expect(integrate(hours, [2, 2, 2])).toBeCloseTo(4, 6);
  });
});

describe("chartGeometry", () => {
  const DAY = { start: bucket(6 * 60), end: bucket(19 * 60) };

  it("draws both lines on one scale", () => {
    const stamps = [bucket(6 * 60), bucket(12 * 60), bucket(19 * 60)];
    const geometry = chartGeometry(stamps, [0, 5, 10], [0, 1, 2], DAY);
    expect(geometry.solar.startsWith("M")).toBe(true);
    expect(geometry.house.startsWith("M")).toBe(true);
    expect(geometry.area.endsWith("Z")).toBe(true);
  });

  it("stops the line where the data stops, not at the edge", () => {
    const stamps = [bucket(6 * 60), bucket(12 * 60)];
    const geometry = chartGeometry(stamps, [0, 4], [], DAY);
    const full = chartGeometry([DAY.start, DAY.end], [0, 4], [], DAY);
    expect(geometry.nowX).toBeLessThan(full.nowX!);
    expect(geometry.house).toBe("");
  });

  it("places midday halfway across a symmetric day", () => {
    const stamps = [DAY.start, bucket(12.5 * 60), DAY.end];
    const geometry = chartGeometry(stamps, [0, 4, 0], [], DAY);
    expect(geometry.nowX).toBeCloseTo(328, 0);
  });

  it("returns empty paths rather than NaN for no data", () => {
    expect(chartGeometry([], [], [], DAY)).toEqual({ area: "", solar: "", house: "" });
  });
});

describe("sunTimes", () => {
  it("walks a past sunrise back to today", () => {
    const entity = {
      entity_id: "sun.sun",
      state: "above_horizon",
      attributes: {
        next_rising: "2026-09-08T06:29:00+02:00",
        next_setting: "2026-09-07T19:36:00+02:00"
      }
    };
    const times = sunTimes(entity, NOW);
    expect(times.rising?.getDate()).toBe(7);
    expect(times.setting?.getDate()).toBe(7);
  });

  it("copes with a missing entity", () => {
    expect(sunTimes(undefined, NOW)).toEqual({});
  });
});

describe("the reference line", () => {
  it("picks a round value under the tallest thing drawn", () => {
    expect(niceTick(9.4)).toBe(8);
    expect(niceTick(12)).toBe(10);
    expect(niceTick(2.6)).toBe(2);
  });

  it("keeps clear of the top so the line is not the ceiling", () => {
    const tick = niceTick(10)!;
    expect(tick).toBeLessThan(10);
  });

  it("gives none when nothing is tall enough to measure", () => {
    expect(niceTick(0.4)).toBeUndefined();
    expect(niceTick(0)).toBeUndefined();
  });

  it("comes back with the geometry so the card can draw it", () => {
    const stamps = [bucket(6 * 60), bucket(12 * 60), bucket(19 * 60)];
    const domain = { start: bucket(6 * 60), end: bucket(19 * 60) };
    const geometry = chartGeometry(stamps, [0, 9.4, 2], [], domain);
    expect(geometry.tick?.value).toBe(8);
    expect(geometry.tick!.y).toBeGreaterThan(0);
    expect(geometry.tick!.y).toBeLessThan(CHART_BOX.height);
  });
});

describe("extremes", () => {
  const row = (value: number | null) => ({ start: MIDNIGHT, mean: value, max: value });

  it("finds the lowest and the highest of the day", () => {
    expect(extremes([row(40), row(12), row(97), row(55)])).toEqual({ low: 12, high: 97 });
  });

  it("ignores readings that are not numbers", () => {
    expect(extremes([row(null), row(30), row(NaN)])).toEqual({ low: 30, high: 30 });
  });

  it("has nothing to report without readings", () => {
    expect(extremes([])).toBeUndefined();
    expect(extremes([row(null)])).toBeUndefined();
  });
});
