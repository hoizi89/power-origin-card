// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { chartBars } from "../src/bars";
import { CARD_TYPE, resolveConfig } from "../src/config";
import { windowEnergy, windowShares } from "../src/hours";
import { clearStatisticsCache } from "../src/stats";
import type { PowerOriginCardConfig, StatisticPoint } from "../src/types";
import { IDS, SCENARIOS, makeHass, type Scenario } from "./fixtures";

const HOUR = 3600_000;

const config = (overrides: Partial<PowerOriginCardConfig> = {}): PowerOriginCardConfig => ({
  type: `custom:${CARD_TYPE}`,
  battery_capacity: 13100,
  entities: { ...IDS },
  ...overrides
});

type Card = HTMLElement & {
  setConfig(config: PowerOriginCardConfig): void;
  hass: unknown;
  updateComplete: Promise<unknown>;
};

async function mount(cfg: PowerOriginCardConfig, scenario: Scenario) {
  clearStatisticsCache();
  const element = document.createElement(CARD_TYPE) as Card;
  element.setConfig(cfg);
  document.body.append(element);
  element.hass = makeHass(scenario);
  await element.updateComplete;
  await new Promise((resolve) => setTimeout(resolve, 0));
  element.hass = makeHass(scenario);
  await element.updateComplete;
  await new Promise((resolve) => setTimeout(resolve, 0));
  await element.updateComplete;
  return element.shadowRoot as ShadowRoot;
}

beforeAll(async () => {
  await import("../src/power-origin-card");
});

afterEach(() => {
  document.body.innerHTML = "";
});

// Ten at night, so the window's last hours lie either side of midnight.
const EVENING = new Date(2026, 8, 16, 22, 0, 0, 0).getTime();
const at = (hoursOn: number, value: number): StatisticPoint => ({ start: EVENING + hoursOn * HOUR + HOUR / 2, mean: value, max: value });

describe("a window that slides with the clock", () => {
  it("splits every hour by its source, straight across midnight", () => {
    const house = [at(0, 1000), at(1, 1000), at(2, 800), at(3, 600)];
    const battery = [at(0, 1000), at(1, 1000), at(2, 300)];
    const grid = [at(2, 500), at(3, 600)];
    const shares = windowShares(house, grid, battery, 1000, EVENING, EVENING + 4 * HOUR);
    expect(shares.map((s) => s.start)).toEqual([0, 1, 2, 3].map((h) => EVENING + h * HOUR));
    expect(shares[1]).toMatchObject({ battery: 1, grid: 0 });
    // Past midnight the battery runs out and the grid takes over; nothing is cut at 00:00.
    expect(shares[2].grid).toBeCloseTo(0.5);
    expect(shares[2].battery).toBeCloseTo(0.3);
    expect(shares[3]).toMatchObject({ battery: 0, grid: 0.6 });
  });

  it("turns a sensor that counts the other way round", () => {
    const shares = windowShares([at(0, 1000)], [at(0, -400)], [at(0, -600)], 1000, EVENING, EVENING + HOUR, { grid: -1, battery: -1 });
    expect(shares[0].grid).toBeCloseTo(0.4);
    expect(shares[0].battery).toBeCloseTo(0.6);
  });

  it("counts the hour in progress for what has passed of it", () => {
    const shares = windowShares([at(0, 2000), at(1, 2000)], [], [at(0, 2000), at(1, 2000)], 1000, EVENING, EVENING + 1.5 * HOUR);
    expect(windowEnergy(shares, EVENING, EVENING + 1.5 * HOUR).battery).toBeCloseTo(3);
  });

  it("stands the battery on the grid, each an hour's bar", () => {
    const timestamps = [0, 1, 2, 3, 4].map((i) => EVENING + i * (HOUR / 2));
    const geometry = chartBars(timestamps, timestamps.map(() => 0), timestamps.map(() => 1), { start: EVENING, end: EVENING + 2 * HOUR }, { width: 340, height: 84, padding: 12 }, [], {
      layers: [{ start: EVENING, grid: 0.4, battery: 0.6 }, { start: EVENING + HOUR, grid: 0, battery: 1 }]
    });
    expect(geometry.originGrid).toHaveLength(1);
    expect(geometry.originBattery).toHaveLength(2);
    const [grid] = geometry.originGrid;
    const [battery] = geometry.originBattery;
    expect(battery.x).toBe(grid.x);
    expect(battery.y + battery.height).toBeCloseTo(grid.y);
  });

  it("is the day unless one of its two lengths is written", () => {
    const base = { type: `custom:${CARD_TYPE}`, entities: { house: "sensor.house" } };
    expect(resolveConfig(base).chart.span).toBe("day");
    expect(resolveConfig({ ...base, chart: { span: "12h" } }).chart.span).toBe("12h");
    expect(resolveConfig({ ...base, chart: { span: "48h" as never } }).chart.span).toBe("day");
  });

  it("draws a night the day's chart would have left out, and says what it took from where", async () => {
    const night = SCENARIOS.find((s) => s.name === "evening on battery")!;
    const daily = await mount(config({ chart: { style: "bars", layers: true } }), night);
    const root = await mount(config({ chart: { style: "bars", span: "24h", layers: true } }), night);
    expect(root.querySelector(".row-title")?.textContent).toContain("Letzte 24 Stunden");
    expect(root.querySelector("svg.chart")).toBeTruthy();
    expect(root.querySelectorAll(".carried-bar").length).toBeGreaterThan(0);
    // Twenty-four whole hours, the one in progress being the last.
    expect(root.querySelectorAll(".prod-bar").length).toBe(24);
    expect(root.querySelectorAll(".prod-bar").length).toBeGreaterThan(daily.querySelectorAll(".prod-bar").length);
    const axis = [...root.querySelectorAll("svg.chart text.axis")].map((t) => t.textContent?.trim());
    expect(axis.at(-1)).toBe("jetzt");
    expect(root.querySelector(".row-note .key-battery, .row-note .key-grid")).toBeTruthy();
  });

  it("keeps to twelve hours when asked, as a curve with areas", async () => {
    const night = SCENARIOS.find((s) => s.name === "evening on battery")!;
    const root = await mount(config({ chart: { style: "area", span: "12h", layers: true } }), night);
    expect(root.querySelector(".row-title")?.textContent).toContain("Letzte 12 Stunden");
    expect(root.querySelector(".cons-line")).toBeTruthy();
    expect(root.querySelector(".carried-bar")).toBeNull();
  });
});
