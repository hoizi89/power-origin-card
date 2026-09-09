// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { CARD_TYPE } from "../src/config";
import { clearStatisticsCache } from "../src/stats";
import type { PowerOriginCardConfig } from "../src/types";
import { IDS, SCENARIOS, makeHass, type Scenario } from "./fixtures";

const day = SCENARIOS[0];
const evening = SCENARIOS.find((s) => s.name === "evening on battery")!;
const foggy = SCENARIOS.find((s) => s.name === "foggy morning, three sources")!;
const charging = SCENARIOS.find((s) => s.name === "charging")!;
const resting = SCENARIOS.find((s) => s.name === "covered, ten watts spare")!;

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
  return element.shadowRoot as ShadowRoot;
}

beforeAll(async () => {
  await import("../src/power-origin-card");
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("the self-supplied column in three colours", () => {
  const cfg = (on: boolean) => config({ ring: { meter: true, meter_shows: "autarky", autarky_colours: on } });

  it("wears the battery's colour when the house is its own, the grid's when it is not", async () => {
    expect((await mount(cfg(true), day)).querySelector(".fill-share-good")).toBeTruthy();
    expect((await mount(cfg(true), foggy)).querySelector(".fill-share-low")).toBeTruthy();
  });

  it("stays one colour unless asked", async () => {
    const root = await mount(cfg(false), foggy);
    expect(root.querySelector(".fill-share-low")).toBeNull();
    expect(root.querySelector(".fill-leaf")).toBeTruthy();
  });
});

describe("the wave through the battery", () => {
  const cfg = config({ battery: { animate: true } });

  it("runs towards the cap while charging and away from it while discharging", async () => {
    expect((await mount(cfg, charging)).querySelector(".bat-flow.charging")).toBeTruthy();
    expect((await mount(cfg, evening)).querySelector(".bat-flow.discharging")).toBeTruthy();
  });

  it("stands still while the battery rests, and unless asked", async () => {
    expect((await mount(cfg, resting)).querySelector(".bat-flow")).toBeNull();
    expect((await mount(config(), charging)).querySelector(".bat-flow")).toBeNull();
  });
});
