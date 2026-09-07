import { describe, expect, it } from "vitest";
import { chartGeometry } from "../src/chart";
import { buildDaySeries, integrate, startOfToday } from "../src/stats";
import { sunTimes } from "../src/sun";

const NOW = new Date("2026-09-07T13:45:00+02:00");
const MIDNIGHT = startOfToday(NOW).getTime();
const bucket = (minutes: number) => MIDNIGHT + minutes * 60 * 1000;

describe("buildDaySeries", () => {
  const solar = [
    { start: bucket(0), mean: 0, max: 0 },
    { start: bucket(300), mean: 1200, max: 1500 },
    { start: bucket(600), mean: 8000, max: 9931 },
    { start: bucket(800), mean: 5141, max: 6000 }
  ];
  const house = [
    { start: bucket(0), mean: 400, max: 600 },
    { start: bucket(300), mean: 900, max: 1200 },
    { start: bucket(600), mean: 2000, max: 2500 },
    { start: bucket(800), mean: 2723, max: 3000 }
  ];

  it("converts watts to kilowatts", () => {
    const series = buildDaySeries(solar, house, 1000, NOW);
    expect(Math.max(...series.solar)).toBeCloseTo(8, 1);
    expect(series.solarPeak).toBeCloseTo(9.931, 3);
  });

  it("averages only the requested window", () => {
    const series = buildDaySeries(solar, house, 1000, NOW, 120);
    expect(series.houseAverage).toBeCloseTo(2.723, 3);
    expect(series.houseSpread).toBeCloseTo(0, 5);
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
