// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { CARD_TYPE } from "../src/config";
import { clearStatisticsCache } from "../src/stats";
import type { PowerOriginCardConfig } from "../src/types";
import { IDS, SCENARIOS, makeHass, type Scenario } from "./fixtures";

const day = SCENARIOS[0];
const evening = SCENARIOS.find((s) => s.name === "evening on battery")!;
const foggy = SCENARIOS.find((s) => s.name === "foggy morning, three sources")!;
const PINNED = new Date(2026, 5, 15, 13, 0, 0);

const config = (overrides: Partial<PowerOriginCardConfig> = {}): PowerOriginCardConfig => ({
  type: `custom:${CARD_TYPE}`,
  title: "Solar",
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
  const root = element.shadowRoot as ShadowRoot;
  return { element, root, chip: () => root.querySelector(".chip") };
}

beforeAll(async () => {
  await import("../src/power-origin-card");
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.setSystemTime(PINNED);
});

describe("the chip", () => {
  it("can say the day's self-supplied share, green from eighty percent", async () => {
    const { chip } = await mount(config({ chip_shows: "autarky" }), day);
    expect(chip()?.textContent).toMatch(/\d+ % autark/);
    expect(chip()?.classList.contains("gridfree")).toBe(true);
    const grey = await mount(config({ chip_shows: "autarky" }), foggy);
    expect(grey.chip()?.classList.contains("importing")).toBe(true);
  });

  it("turns red with the kilowatts after two minutes of draw, and shows even when otherwise hidden", async () => {
    const { element, chip } = await mount(config({ chip: "gridfree", chip_alarm: true }), foggy);
    expect(chip()).toBeNull();
    vi.setSystemTime(new Date(PINNED.getTime() + 3 * 60 * 1000));
    element.hass = makeHass(foggy);
    await element.updateComplete;
    expect(chip()?.classList.contains("alarm")).toBe(true);
    expect(chip()?.textContent).toContain("kW");
    // The card itself stays as it was: the chip's switch is the chip's.
    expect((element.shadowRoot as ShadowRoot).querySelector("ha-card")?.classList.contains("import-alarm")).toBe(false);
  });
});

describe("the price beside the title", () => {
  it("stands beside the title, coloured against the day's mean", async () => {
    const { root } = await mount(config({ head_price: true }), day);
    const price = root.querySelector(".head-price");
    expect(price?.textContent).toContain("€/kWh");
    // The fixture holds the price steady, so this hour is neither cheap nor dear.
    expect(price?.classList.contains("cheap")).toBe(false);
    expect(price?.classList.contains("dear")).toBe(false);
  });
});

describe("the sun line under the heading", () => {
  it("runs from sunrise to sunset by day, and through the night at night", async () => {
    const off = { ring: true, chart: false, battery: false, today: false };
    const dayBar = await mount(config({ head_sunbar: true, sections: off }), day);
    expect(dayBar.root.querySelector(".sunbar")).toBeTruthy();
    expect(dayBar.root.querySelector(".sunbar.night")).toBeNull();
    const nightBar = await mount(config({ head_sunbar: true, sections: off }), evening);
    expect(nightBar.root.querySelector(".sunbar.night")).toBeTruthy();
  });

  it("yields to the day chart, which draws the same day", async () => {
    const { root } = await mount(config({ head_sunbar: true }), day);
    expect(root.querySelector(".sunbar")).toBeNull();
  });
});
