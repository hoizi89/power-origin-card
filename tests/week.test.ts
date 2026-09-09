// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { chartBars } from "../src/bars";
import { CARD_TYPE } from "../src/config";
import { hourlyForecast } from "../src/forecast";
import { clearStatisticsCache } from "../src/stats";
import type { PowerOriginCardConfig } from "../src/types";
import { IDS, SCENARIOS, makeHass, type Scenario } from "./fixtures";

const day = SCENARIOS[0];

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
  const root = element.shadowRoot as ShadowRoot;
  const text = () =>
    [...root.children]
      .filter((child) => child.tagName !== "STYLE")
      .map((child) => child.textContent ?? "")
      .join(" ");
  return { element, root, text };
}

beforeAll(async () => {
  await import("../src/power-origin-card");
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("reading a forecast by hour", () => {
  it("takes Solcast's hourly rows as they are", () => {
    const rows = hourlyForecast({
      entity_id: "sensor.x",
      state: "1",
      attributes: {
        detailedHourly: [
          { period_start: "2026-06-15T10:00:00+02:00", pv_estimate: 4.2 },
          { period_start: "2026-06-15T11:00:00+02:00", pv_estimate: 5.1 }
        ]
      }
    });
    expect(rows.map((r) => r.kw)).toEqual([4.2, 5.1]);
  });

  it("averages half hours into hours and drops what it cannot read", () => {
    const rows = hourlyForecast({
      entity_id: "sensor.x",
      state: "1",
      attributes: {
        detailedForecast: [
          { period_start: "2026-06-15T10:00:00+02:00", pv_estimate: 4 },
          { period_start: "2026-06-15T10:30:00+02:00", pv_estimate: 6 },
          { period_start: "nonsense", pv_estimate: 9 }
        ]
      }
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].kw).toBe(5);
  });

  it("finds nothing on a sensor without hours", () => {
    expect(hourlyForecast({ entity_id: "sensor.x", state: "3", attributes: {} })).toEqual([]);
  });
});

describe("the hours still expected", () => {
  it("stand as outlines after now, and not before", async () => {
    const { root } = await mount(config({ chart: { style: "bars", forecast_bars: true } }), day);
    const ghosts = [...root.querySelectorAll(".prod-ghost")];
    expect(ghosts.length).toBeGreaterThan(2);
    const bars = [...root.querySelectorAll(".prod-bar")];
    const lastBar = Math.max(...bars.map((b) => Number(b.getAttribute("x"))));
    for (const g of ghosts) expect(Number(g.getAttribute("x"))).toBeGreaterThan(lastBar);
  });

  it("lay tomorrow over the whole day once the sun is down", () => {
    const start = new Date(2026, 5, 15, 6, 0).getTime();
    const end = new Date(2026, 5, 15, 20, 0).getTime();
    const timestamps = [start, start + 3600000, start + 7200000];
    const ghost = Array.from({ length: 14 }, (_, i) => ({ start: start + i * 3600000, kw: 2 }));
    const box = { width: 340, height: 84, padding: 12 };
    const after = chartBars(timestamps, [1, 1, 1], [], { start, end }, box, [], { ghost });
    const whole = chartBars(timestamps, [1, 1, 1], [], { start, end }, box, [], { ghost, ghostAll: true });
    expect(after.ghosts.length).toBeLessThan(whole.ghosts.length);
    expect(whole.ghosts.length).toBe(14);
  });

  it("run as a dashed line on the curve", async () => {
    const { root } = await mount(config({ chart: { style: "area", forecast_bars: true } }), day);
    expect(root.querySelector(".ghost-line")).toBeTruthy();
  });

  it("are not drawn unless asked", async () => {
    const { root } = await mount(config({ chart: { style: "bars" } }), day);
    expect(root.querySelectorAll(".prod-ghost").length).toBe(0);
  });
});

describe("who carried each hour", () => {
  it("draws the grid and the battery as areas under the day", async () => {
    const foggy = SCENARIOS.find((s) => s.name === "foggy morning, three sources")!;
    const { root } = await mount(config({ chart: { layers: true } }), foggy);
    expect(root.querySelector(".layer-grid")).toBeTruthy();
    expect(root.querySelector(".layer-battery")).toBeTruthy();
  });
});

describe("the best day of the year", () => {
  it("stands behind today with its figure", async () => {
    const { root, text } = await mount(config({ chart: { best_day: true } }), day);
    expect(root.querySelector(".best-line")).toBeTruthy();
    expect(text()).toContain("Bestwert");
  });
});

describe("the week", () => {
  it("draws seven days with a dot for the self-supplied share", async () => {
    const { root, text } = await mount(config({ sections: { week: true } }), day);
    expect(root.querySelectorAll(".week-bar").length).toBe(7);
    expect(root.querySelectorAll(".week-dot").length).toBe(7);
    expect(root.querySelector(".week-bar.today")).toBeTruthy();
    expect(text()).toContain("Ø");
  });

  it("puts a tapped day's figures in the heading", async () => {
    const { element, root, text } = await mount(config({ sections: { week: true } }), day);
    const before = text();
    (root.querySelectorAll(".week-bar")[1] as SVGElement).dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await element.updateComplete;
    expect(root.querySelectorAll(".week-bar.picked").length).toBe(1);
    expect(text()).not.toBe(before);
    expect(text()).not.toContain("Ø");
  });

  it("is not there without a daily roof meter", async () => {
    const { root } = await mount(
      config({ sections: { week: true }, entities: { ...IDS, solar_today: undefined } }),
      day
    );
    expect(root.querySelector(".week")).toBeNull();
  });
});
