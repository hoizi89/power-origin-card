// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { CARD_TYPE } from "../src/config";
import { clearStatisticsCache } from "../src/stats";
import type { PowerOriginCardConfig } from "../src/types";
import { IDS, SCENARIOS, makeHass, type Scenario } from "./fixtures";

const day = SCENARIOS[0];
const evening = SCENARIOS.find((s) => s.name === "evening on battery")!;

const config = (overrides: Partial<PowerOriginCardConfig> = {}): PowerOriginCardConfig => ({
  type: `custom:${CARD_TYPE}`,
  battery_capacity: 13100,
  entities: { ...IDS, price_export: "sensor.price_export" },
  ...overrides
});

type Card = HTMLElement & {
  setConfig(config: PowerOriginCardConfig): void;
  hass: unknown;
  updateComplete: Promise<unknown>;
};

async function render(cfg: PowerOriginCardConfig, scenario: Scenario) {
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

beforeAll(async () => {
  await import("../src/power-origin-card");
});

afterEach(() => {
  localStorage.clear();
  document.body.innerHTML = "";
});

describe("the centre in money", () => {
  it("prices the hour and says which way it goes", async () => {
    const { text } = await render(config({ ring: { center: "money" } }), day);
    expect(text()).toContain("€/h");
    expect(text()).toContain("VERDIENT");
  });

  it("calls a still hour even", async () => {
    const { text } = await render(config({ ring: { center: "money" } }), evening);
    expect(text()).toContain("AUSGEGLICHEN");
  });

  it("falls back to the house without a price", async () => {
    const { root, text } = await render(
      config({ entities: { ...IDS, price_import: undefined }, ring: { center: "money" } }),
      day
    );
    expect(text()).not.toContain("€/h");
    expect(root.querySelector(".ring-value")?.textContent).toContain("kW");
  });
});

describe("the charge inside the ring", () => {
  it("draws a thin ring as full as the battery", async () => {
    const { root } = await render(config({ ring: { inner: "battery" } }), day);
    const soc = root.querySelector(".ring-soc");
    expect(soc?.getAttribute("stroke-dasharray")).toBe("99.0 100");
    expect(root.querySelector(".ring-mark")).toBeNull();
  });
});

describe("the night around the ring", () => {
  it("fills the outer band as far as the night has come, and counts down", async () => {
    const { root, text } = await render(config({ ring: { night: "countdown" } }), evening);
    expect(root.querySelector(".night-arc")).toBeTruthy();
    expect(text()).toContain("bis Sonne");
    // The moon stands where the night began, outside the band.
    expect(root.querySelector(".ring")?.getAttribute("viewBox")).toContain("-17");
  });

  it("stays out of the day", async () => {
    const { root, text } = await render(config({ ring: { night: "countdown" } }), day);
    expect(root.querySelector(".night-arc")).toBeNull();
    expect(text()).not.toContain("bis Sonne");
  });

  it("leaves the caption to the battery when the centre says how long it lasts", async () => {
    const { text } = await render(
      config({ ring: { night: "countdown", center_dark: "runtime" } }),
      evening
    );
    expect(text()).not.toContain("bis Sonne");
    expect(text()).toMatch(/bis \d/);
  });
});

describe("the day outside, now inside", () => {
  it("keeps the sources in the inner ring under an hourly outer band", async () => {
    const { root } = await render(config({ ring: { rings: "dayclock" } }), day);
    expect(root.querySelectorAll(".clock-hour.out").length).toBeGreaterThan(2);
    expect(root.querySelectorAll(".seg").length).toBeGreaterThan(0);
    expect(root.querySelector(".ring")?.getAttribute("viewBox")).toContain("-17");
  });

  it("gives the band to the night once the countdown is on", async () => {
    const { root } = await render(
      config({ ring: { rings: "dayclock", night: "countdown" } }),
      evening
    );
    expect(root.querySelectorAll(".clock-hour.out").length).toBe(0);
    expect(root.querySelector(".night-arc")).toBeTruthy();
  });
});

describe("tapping the ring", () => {
  it("steps the centre on and marks where it stands", async () => {
    const { element, root, text } = await render(config({ ring: { tap: "cycle" } }), day);
    expect(root.querySelectorAll(".ring-dots circle").length).toBe(5);
    expect(root.querySelector(".ring-dots circle.on")).toBeTruthy();
    expect(text()).toContain("kW");
    (root.querySelector(".ring") as SVGElement).dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await element.updateComplete;
    expect(text()).toContain("AUTARKIE");
    expect(localStorage.getItem(`power-origin:centre:${IDS.house}`)).toBe("autarky");
  });

  it("does not offer the day views at night", async () => {
    const { root } = await render(config({ ring: { tap: "cycle" } }), evening);
    expect(root.querySelectorAll(".ring-dots circle").length).toBe(3);
  });

  it("leaves the figure plain, since the whole ring is the button", async () => {
    const { root } = await render(config({ ring: { tap: "cycle" } }), day);
    expect(root.querySelector(".ring-value.tap")).toBeNull();
  });
});

describe("the charge at sunrise, on the bar", () => {
  it("marks the level with the sun alone and leaves the cells as they are", async () => {
    const { root } = await render(config({ battery: { sunrise_mark: true, capacity: 13100 } }), evening);
    expect(root.querySelector(".bat-sun")).toBeTruthy();
    // A dimmed cell means the reserve, and nothing else.
    expect(root.querySelectorAll(".bat-fill.night").length).toBe(0);
  });

  it("has nothing to say while the battery charges", async () => {
    const { root } = await render(config({ battery: { sunrise_mark: true, capacity: 13100 } }), day);
    expect(root.querySelector(".bat-sun")).toBeNull();
  });
});
