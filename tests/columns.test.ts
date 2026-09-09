// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { CARD_TYPE } from "../src/config";
import { clearStatisticsCache } from "../src/stats";
import type { PowerOriginCardConfig } from "../src/types";
import { IDS, SCENARIOS, makeHass, type Scenario } from "./fixtures";

const day = SCENARIOS[0];
const evening = SCENARIOS.find((s) => s.name === "evening on battery")!;
const foggy = SCENARIOS.find((s) => s.name === "foggy morning, three sources")!;
const DEVICES = ["sensor.desk_power", "sensor.nas_power", "sensor.fridge_power", "sensor.oven_power"];

const config = (overrides: Partial<PowerOriginCardConfig> = {}): PowerOriginCardConfig => ({
  type: `custom:${CARD_TYPE}`,
  battery_capacity: 13100,
  battery_reserve: 15,
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
  const root = element.shadowRoot as ShadowRoot;
  const text = () =>
    [...root.children]
      .filter((child) => child.tagName !== "STYLE")
      .map((child) => child.textContent ?? "")
      .join(" ");
  return { element, root, text };
}

const PINNED = new Date(2026, 5, 15, 13, 0, 0);

beforeAll(async () => {
  await import("../src/power-origin-card");
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.setSystemTime(PINNED);
});

describe("the night as a column", () => {
  it("has nothing to say by day", async () => {
    const { root } = await mount(config({ ring: { meter: true, meter_shows: "night" } }), day);
    expect(root.querySelector(".night-now")).toBeNull();
    expect(root.querySelector(".meter")).toBeNull();
  });

  it("can be drawn in blocks, one per hour, or as one body", async () => {
    const blocks = await mount(config({ ring: { meter: true, meter_shows: "night", meter_style: "blocks" } }), evening);
    expect(blocks.root.querySelectorAll(".meter rect").length).toBeGreaterThan(8);
    const bar = await mount(config({ ring: { meter: true, meter_shows: "night", meter_style: "bar" } }), evening);
    expect(bar.root.querySelector(".night-past")).toBeTruthy();
    expect(bar.root.querySelectorAll(".night-tick").length).toBeGreaterThan(4);
  });

  it("leaves the time to the centre when the centre already says how long", async () => {
    const { text } = await mount(
      config({ ring: { meter: true, meter_shows: "night", center_dark: "runtime" } }),
      evening
    );
    expect(text().match(/bis \d/g)?.length ?? 0).toBe(1);
  });
});

describe("a column that says nothing", () => {
  it("leaves the ring the room", async () => {
    const { root } = await mount(config({ ring: { meter: true, meter_shows: "none" } }), day);
    expect(root.querySelector(".ring")).toBeTruthy();
    expect(root.querySelector(".meter-block")).toBeNull();
  });

  it("can go only at night", async () => {
    const cfg = config({ ring: { meter: true, meter_shows: "roof", meter_dark: "none" } });
    expect((await mount(cfg, day)).root.querySelector(".meter-block")).toBeTruthy();
    expect((await mount(cfg, evening)).root.querySelector(".meter-block")).toBeNull();
  });
});

describe("the devices as a column", () => {
  it("names the three drawing most, and folds the rest", async () => {
    const { root, text } = await mount(
      config({
        sections: { devices: false },
        devices: { list: DEVICES, limit: 5, threshold: 10 },
        ring: { meter: true, meter_shows: "devices" }
      }),
      day
    );
    expect(root.querySelectorAll(".devs .dev-row").length).toBe(3);
    expect(text()).toContain("oven");
    expect(root.querySelector(".wohin")).toBeNull();
  });
});

describe("the scale under the ring", () => {
  it("lays the needle flat: draw left, surplus right", async () => {
    const exporting = await mount(config({ ring: { columns: "scale" } }), day);
    expect(exporting.root.querySelector(".meter-block")).toBeNull();
    expect(exporting.root.querySelector(".scale.up")).toBeTruthy();
    const band = exporting.root.querySelector(".scale-on.grid") as SVGRectElement;
    expect(Number(band.getAttribute("x"))).toBeGreaterThanOrEqual(150);

    const drawing = await mount(config({ ring: { columns: "scale" } }), foggy);
    expect(drawing.root.querySelector(".scale.down")).toBeTruthy();
    const draw = drawing.root.querySelector(".scale-on.import") as SVGRectElement;
    expect(Number(draw.getAttribute("x")) + Number(draw.getAttribute("width"))).toBeLessThanOrEqual(150.5);
  });
});

describe("lasting grid draw", () => {
  const cfg = () => config({ ring: { columns: "two", meter_shows: "roof", meter_second_shows: "day", import_switch: true } });

  it("throws the switch after two minutes and lets go five minutes after the draw ends", async () => {
    const { element, root } = await mount(cfg(), foggy);
    const card = () => root.querySelector("ha-card") as HTMLElement;
    expect(card().classList.contains("import-alarm")).toBe(false);

    vi.setSystemTime(new Date(PINNED.getTime() + 3 * 60 * 1000));
    element.hass = makeHass(foggy);
    await element.updateComplete;
    expect(card().classList.contains("import-alarm")).toBe(true);
    // The right column is the grid now.
    expect(root.querySelectorAll(".meter-off").length).toBeGreaterThan(0);

    vi.setSystemTime(new Date(PINNED.getTime() + 4 * 60 * 1000));
    element.hass = makeHass(day);
    await element.updateComplete;
    expect(card().classList.contains("import-alarm")).toBe(true);

    vi.setSystemTime(new Date(PINNED.getTime() + 10 * 60 * 1000));
    element.hass = makeHass(day);
    await element.updateComplete;
    expect(card().classList.contains("import-alarm")).toBe(false);
    expect(root.querySelectorAll(".meter-off").length).toBe(0);
  });

  it("is never tripped by a kettle", async () => {
    const { element, root } = await mount(cfg(), foggy);
    vi.setSystemTime(new Date(PINNED.getTime() + 60 * 1000));
    element.hass = makeHass(day);
    await element.updateComplete;
    vi.setSystemTime(new Date(PINNED.getTime() + 3 * 60 * 1000));
    element.hass = makeHass(foggy);
    await element.updateComplete;
    expect((root.querySelector("ha-card") as HTMLElement).classList.contains("import-alarm")).toBe(false);
  });
});
