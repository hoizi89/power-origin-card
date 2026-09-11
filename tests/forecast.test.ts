import { describe, expect, it } from "vitest";
import { hourlyForecastAll, shortfall, snowSeason } from "../src/forecast";
import type { HassEntity } from "../src/types";

const at = (hour: number, minute = 0) => new Date(2026, 5, 15, hour, minute, 0).getTime();

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

describe("the map form of Open-Meteo Solar Forecast", () => {
  const iso = (h: number) => `2026-09-11T${String(h).padStart(2, "0")}:00:00+02:00`;

  it("reads wh_period as the mean power of each hour", () => {
    const entity: HassEntity = {
      entity_id: "sensor.energy_production_today",
      state: "12.4",
      attributes: { wh_period: { [iso(10)]: 2129.25, [iso(11)]: 3056.75, [iso(20)]: 0 } }
    };
    const hours = hourlyForecastAll([entity]);
    expect(hours.map((h) => [new Date(h.start).toISOString(), h.kw])).toEqual([
      [new Date(iso(10)).toISOString(), 2.12925],
      [new Date(iso(11)).toISOString(), 3.05675],
      [new Date(iso(20)).toISOString(), 0]
    ]);
    expect(hours[0].low).toBeUndefined();
  });

  it("averages watts at quarter hours into the hour when wh_period is missing", () => {
    const at = (m: number) => `2026-09-11T12:${String(m).padStart(2, "0")}:00+02:00`;
    const entity: HassEntity = {
      entity_id: "sensor.energy_production_today",
      state: "12.4",
      attributes: { watts: { [at(0)]: 2000, [at(15)]: 2400, [at(30)]: 2800, [at(45)]: 2800 } }
    };
    expect(hourlyForecastAll([entity])[0].kw).toBeCloseTo(2.5, 5);
  });
});

describe("a roof far behind its forecast", () => {
  const sunrise = new Date(at(6));
  const day = [hour(6, 1), hour(7, 2), hour(8, 3), hour(9, 4)];
  const hours = hourlyForecastAll([face("sensor.f", day)]);

  it("is short once two hours in, a kilowatt hour expected, and under a quarter delivered", () => {
    // By nine: 1 + 2 + 3 = 6 kWh expected.
    expect(shortfall(hours, 0.5, sunrise, new Date(at(9))).short).toBe(true);
    expect(shortfall(hours, 2, sunrise, new Date(at(9))).short).toBe(false);
  });

  it("says nothing early in the day, or with little expected, or without a reading", () => {
    expect(shortfall(hours, 0, sunrise, new Date(at(7, 30))).short).toBe(false);
    expect(shortfall(hourlyForecastAll([face("sensor.f", [hour(6, 0.2), hour(7, 0.2)])]), 0, sunrise, new Date(at(9))).short).toBe(false);
    expect(shortfall(hours, undefined, sunrise, new Date(at(9))).short).toBe(false);
    expect(shortfall(hours, 0, undefined, new Date(at(9))).short).toBe(false);
  });

  it("counts only the part of the hours the day has reached", () => {
    expect(shortfall(hours, 0, sunrise, new Date(at(8, 30))).expectedKwh).toBeCloseTo(4.5, 5);
  });

  it("asks about snow from November to March", () => {
    expect(snowSeason(new Date(2026, 0, 15))).toBe(true);
    expect(snowSeason(new Date(2026, 10, 1))).toBe(true);
    expect(snowSeason(new Date(2026, 5, 15))).toBe(false);
  });
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
