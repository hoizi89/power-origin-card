// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { CARD_TYPE } from "../src/config";
import { clearStatisticsCache } from "../src/stats";
import type { PowerOriginCardConfig } from "../src/types";
import { IDS, SCENARIOS, makeHass, type Scenario } from "./fixtures";

const evening = SCENARIOS.find((s) => s.name === "evening on battery")!;
const charging = SCENARIOS.find((s) => s.name === "charging")!;

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
  return { root, text };
}

beforeAll(async () => {
  await import("../src/power-origin-card");
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("the charge as a curve", () => {
  it("runs since sunset at night and on, dashed, to sunrise", async () => {
    const { root } = await mount(config({ battery: { curve: true } }), evening);
    expect(root.querySelector(".bat-curve:not(.ahead)")).toBeTruthy();
    expect(root.querySelector(".bat-curve.ahead")).toBeTruthy();
    expect(root.querySelector(".bat-curve-floor")).toBeTruthy();
    expect(root.querySelectorAll(".bat-curve-label").length).toBe(2);
  });

  it("runs since midnight by day and on, dashed, to full while charging", async () => {
    const { root } = await mount(config({ battery: { curve: true } }), charging);
    expect(root.querySelector(".bat-curve.ahead")).toBeTruthy();
    expect(root.querySelector(".bat-curve-label:last-of-type")?.textContent).toContain("100 %");
  });

  it("does not say twice where the charge ends up", async () => {
    const { root } = await mount(config({ battery: { curve: true, extra: "sunrise" } }), evening);
    const right = root.querySelector(".bat-curve-label:last-of-type")?.textContent ?? "";
    expect(right).not.toContain("%");
  });

  it("is not drawn unless asked", async () => {
    const { root } = await mount(config(), evening);
    expect(root.querySelector(".bat-curve")).toBeNull();
  });
});

describe("the day's flow through the battery", () => {
  it("names what went in and out, and the cycles", async () => {
    const { text } = await mount(config({ battery: { extra: "flow" } }), evening);
    expect(text()).toContain("↑7,9");
    expect(text()).toContain("↓4,1");
    expect(text()).toContain("0,3 Zyklen");
  });

  it("says nothing without the input meter", async () => {
    const { text } = await mount(
      config({ battery: { extra: "flow" }, entities: { ...IDS, battery_in_today: undefined } }),
      evening
    );
    expect(text()).not.toContain("↑");
  });
});
