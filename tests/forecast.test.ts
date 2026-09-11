import { describe, expect, it } from "vitest";
import { hourlyForecastAll } from "../src/forecast";
import type { HassEntity } from "../src/types";

const at = (hour: number) => new Date(2026, 5, 15, hour, 0, 0).getTime();

const face = (id: string, rows: Array<Record<string, unknown>>): HassEntity => ({
  entity_id: id,
  state: "1",
  attributes: { detailedHourly: rows }
});

const hour = (h: number, kw: number, edges?: [number, number]) => ({
  period_start: new Date(at(h)).toISOString(),
  pv_estimate: kw,
  ...(edges ? { pv_estimate10: edges[0], pv_estimate90: edges[1] } : {})
});

describe("several roof faces as one forecast", () => {
  it("adds the hours up, and keeps an hour only one face has", () => {
    const east = face("sensor.east", [hour(8, 2), hour(9, 3)]);
    const west = face("sensor.west", [hour(9, 1), hour(10, 4)]);
    const all = hourlyForecastAll([east, west]);
    expect(all.map((h) => [new Date(h.start).getHours(), h.kw])).toEqual([
      [8, 2],
      [9, 4],
      [10, 4]
    ]);
  });

  it("is the one forecast alone when there is only one, or the others are empty", () => {
    const east = face("sensor.east", [hour(8, 2, [1, 3])]);
    expect(hourlyForecastAll([east, undefined, face("sensor.none", [])])).toEqual(
      hourlyForecastAll([east])
    );
    expect(hourlyForecastAll([east])[0].low).toBe(1);
  });

  it("adds the edges too, and drops them where a face has none", () => {
    const east = face("sensor.east", [hour(8, 2, [1, 3]), hour(9, 2, [1, 3])]);
    const west = face("sensor.west", [hour(8, 1, [0.5, 1.5]), hour(9, 1)]);
    const all = hourlyForecastAll([east, west]);
    expect(all[0].low).toBeCloseTo(1.5, 5);
    expect(all[0].high).toBeCloseTo(4.5, 5);
    expect(all[1].low).toBeUndefined();
    expect(all[1].high).toBeUndefined();
  });
});
