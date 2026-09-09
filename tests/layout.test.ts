// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { CARD_TYPE } from "../src/config";
import { clearStatisticsCache } from "../src/stats";
import type { PowerOriginCardConfig } from "../src/types";
import { IDS, SCENARIOS, makeHass, type Scenario } from "./fixtures";

const day = SCENARIOS[0];
const evening = SCENARIOS.find((s) => s.name === "evening on battery")!;
const DEVICES = ["sensor.desk_power", "sensor.nas_power", "sensor.oven_power"];

const config = (overrides: Partial<PowerOriginCardConfig> = {}): PowerOriginCardConfig => ({
  type: `custom:${CARD_TYPE}`,
  title: "Solar",
  battery_capacity: 13100,
  entities: { ...IDS },
  ring: { columns: "two", meter_shows: "grid", meter_second_shows: "roof" },
  devices: { list: DEVICES },
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
  return { element, root: element.shadowRoot as ShadowRoot };
}

beforeAll(async () => {
  await import("../src/power-origin-card");
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("compact", () => {
  it("is one row: the ring small, three figures, nothing below", async () => {
    const { root } = await mount(config({ shape: "compact" }), day);
    expect(root.querySelector(".compact")).toBeTruthy();
    expect(root.querySelectorAll(".compact-stats .stat").length).toBe(3);
    expect(root.querySelector(".meter-block")).toBeNull();
    expect(root.querySelector(".row")).toBeNull();
    expect(root.querySelector(".today")).toBeNull();
  });
});

describe("wide", () => {
  it("puts the ring on the left and the day on the right once there is room", async () => {
    const { root } = await mount(config({ shape: "wide", wide_from: 0 }), day);
    expect(root.querySelector("ha-card")?.classList.contains("wide")).toBe(true);
    expect(root.querySelector(".side .ring")).toBeTruthy();
    expect(root.querySelector(".main .chart")).toBeTruthy();
    expect(root.querySelector(".main .today")).toBeTruthy();
  });

  it("stacks as usual while it is narrower than asked", async () => {
    const { root } = await mount(config({ shape: "wide", wide_from: 5000 }), day);
    expect(root.querySelector("ha-card")?.classList.contains("wide")).toBe(false);
    expect(root.querySelector(".side")).toBeNull();
  });
});

describe("the quiet night", () => {
  it("keeps the ring, the battery and a line about the day, and lets the rest go", async () => {
    const { root } = await mount(config({ night_layout: "quiet" }), evening);
    expect(root.querySelector(".ring")).toBeTruthy();
    expect(root.querySelector(".meter-block")).toBeNull();
    expect(root.querySelector(".chart")).toBeNull();
    expect(root.querySelector(".row .row-note")?.textContent).toContain("erzeugt");
    expect(root.querySelector(".bat-shell")).toBeTruthy();
    expect(root.querySelector(".today")).toBeNull();
    expect(root.querySelector(".wohin")).toBeNull();
  });

  it("changes nothing by day", async () => {
    const { root } = await mount(config({ night_layout: "quiet" }), day);
    expect(root.querySelectorAll(".meter-block").length).toBe(2);
    expect(root.querySelector(".today")).toBeTruthy();
  });
});
