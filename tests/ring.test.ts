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

describe("the ring's views", () => {
  const charging = SCENARIOS.find((s) => s.name === "charging")!;
  const text = (root: ShadowRoot) => (root.textContent ?? "").replace(/\s+/g, " ");

  it("stands the four powers around the ring, each with its direction as a word, and no columns", async () => {
    const { root } = await render(config({ ring: { view: "corners" } }), charging);
    expect(root.querySelectorAll(".rc").length).toBe(4);
    expect(root.querySelector(".meter-block")).toBeNull();
    const words = text(root);
    expect(words).toMatch(/PV.*erzeugt/);
    expect(words).toMatch(/Speicher.*lädt · 52 %/);
    expect(words).toMatch(/Netz.*speist ein/);
    expect(words).toContain("Autarkie");
  });

  it("draws the flow instead of the ring: four circles, the words under them", async () => {
    const { root } = await render(config({ ring: { view: "flow" } }), charging);
    expect(root.querySelector(".ring")).toBeNull();
    expect(root.querySelectorAll(".fv-node").length).toBe(4);
    // Nothing is written under the circles; the icons say what, the arrows which way.
    expect(root.querySelectorAll(".fv-verb").length).toBe(0);
    expect(root.querySelectorAll(".fv-icon").length).toBe(4);
    // Exporting and charging: the grid's arrow points away from the house, the battery's towards the store.
    expect(root.querySelectorAll(".fv-arrow").length).toBe(3);
    expect(root.querySelector(".flow-view")?.getAttribute("aria-label")).toContain("speist ein");
    // Charging: the store's dots run away from the house.
    expect(root.querySelector(".fv-line.battery.on.dots.rev")).toBeTruthy();
    // The ring outside the store is filled to its charge.
    expect(root.querySelector(".fv-clock.soc")?.getAttribute("stroke-dasharray")).toBe("52.00 100");
  });

  it("runs the dots toward the house while the battery carries it, and can stand still", async () => {
    const moving = await render(config({ ring: { view: "flow" } }), evening);
    expect(moving.root.querySelector(".fv-line.battery.on.dots:not(.rev)")).toBeTruthy();
    expect(moving.root.querySelector(".flow-view")?.getAttribute("aria-label")).toContain("entlädt");
    const still = await render(config({ ring: { view: "flow", flow_dots: false, flow_gauges: false } }), evening);
    expect(still.root.querySelector(".fv-line.dots")).toBeNull();
    expect(still.root.querySelector(".fv-arc")).toBeNull();
    expect(still.root.querySelectorAll(".fv-rim").length).toBe(4);
    // Carrying the house, the battery's arrow points at the house.
    expect(still.root.querySelector(".fv-arrow.battery")).toBeTruthy();
  });

  it("calls a full battery full, not charging, on a trickle", async () => {
    const full: Scenario = { ...charging, name: "full", soc: 100, battery: -27 };
    const { root } = await render(config({ ring: { view: "flow" } }), full);
    const aria = root.querySelector(".flow-view")?.getAttribute("aria-label") ?? "";
    expect(aria).toContain("100 %");
    expect(aria).toContain("voll");
    expect(aria).not.toContain("lädt");
  });

  it("can run today's share around each circle, and the day's clock at the house", async () => {
    const day = await render(config({ ring: { view: "flow", flow_outer: "day" } }), charging);
    // Three thin day rings; the battery wears its charge as a thick one instead.
    expect(day.root.querySelectorAll(".fv-track.thin").length).toBe(3);
    expect(day.root.querySelectorAll(".fv-track.soc").length).toBe(1);
    expect(day.root.querySelectorAll(".fv-clock.solar").length).toBeGreaterThan(0);
    const house = await render(config({ ring: { view: "flow", flow_clock: "house" } }), charging);
    expect(house.root.querySelectorAll(".fv-clock.big").length).toBe(24);
    expect(house.root.querySelectorAll(".fv-tick").length).toBe(2);
    expect(house.root.querySelectorAll(".clock-mark").length).toBe(2);
    expect(house.root.querySelectorAll(".fv-hand").length).toBe(1);
    expect(house.root.querySelector(".fv-strip")).toBeNull();
    const strip = await render(config({ ring: { view: "flow", flow_clock: "strip" } }), charging);
    expect(strip.root.querySelectorAll(".fv-strip .cell").length).toBe(24);
    expect(strip.root.querySelectorAll(".fv-hand").length).toBe(1);
    const ring = await render(config({ ring: { view: "flow", flow_clock: "ring" } }), charging);
    expect(ring.root.querySelectorAll(".fv-clock.ring").length).toBe(24);
    expect(ring.root.querySelector(".fv-node.house.big")).toBeTruthy();
    const none = await render(config({ ring: { view: "flow", flow_outer: "none" } }), charging);
    expect(none.root.querySelector(".fv-clock")).toBeNull();
  });

  it("reads the older clock values as the clock at the house", async () => {
    const outer = await render(config({ ring: { view: "flow", flow_outer: "clock" } }), charging);
    expect(outer.root.querySelectorAll(".fv-clock.big").length).toBe(24);
    expect(outer.root.querySelectorAll(".fv-track.thin").length).toBe(0);
    const inner = await render(config({ ring: { view: "flow", flow_house: "clock" } }), charging);
    expect(inner.root.querySelectorAll(".fv-clock.big").length).toBe(24);
  });

  it("lets each circle wear today's share, the gauge or nothing", async () => {
    const mixed = await render(config({ ring: { view: "flow", flow_house: "day", flow_battery: "day", flow_pv: "none", flow_grid: "gauge" } }), charging);
    expect(mixed.root.querySelectorAll(".fv-clock.in").length).toBeGreaterThan(0);
    expect(mixed.root.querySelectorAll(".fv-node.solar .fv-rim").length).toBe(1);
    expect(mixed.root.querySelectorAll(".fv-node.battery .fv-track").length).toBe(1);
    expect(mixed.root.querySelectorAll(".fv-node.grid .fv-arc").length).toBe(1);
  });

  it("lays the column flat as a bar when asked, stretching the drawing to it", async () => {
    const { root } = await render(config({ ring: { meter_layout: "flat" } }), day);
    expect(root.querySelector(".ring-group")?.classList.contains("flat")).toBe(true);
    expect(root.querySelector("svg.meter")?.getAttribute("preserveAspectRatio")).toBe("none");
    const upright = await render(config(), day);
    expect(upright.root.querySelector("svg.meter")?.getAttribute("preserveAspectRatio")).toBe("xMidYMid meet");
  });

  it("stands the column on the ring's right when asked", async () => {
    const { root } = await render(config({ ring: { meter_side: "right" } }), day);
    expect(root.querySelector(".ring-group")?.classList.contains("meter-right")).toBe(true);
    const plain = await render(config(), day);
    expect(plain.root.querySelector(".ring-group")?.classList.contains("meter-right")).toBe(false);
  });

  it("lets the battery bar take the full width, the percentage moving to the heading", async () => {
    const wide = await render(config({ battery: { wide: true, percent: true } }), day);
    expect(wide.root.querySelector(".bat-pct")).toBeNull();
    expect(wide.root.querySelector(".row-pct")).toBeTruthy();
    const usual = await render(config({ battery: { percent: true } }), day);
    expect(usual.root.querySelector(".bat-pct")).toBeTruthy();
  });

  it("keeps the compact ring a ring whatever the view", async () => {
    const { root } = await render(config({ shape: "compact", ring: { view: "flow" } }), charging);
    expect(root.querySelector(".ring")).toBeTruthy();
    expect(root.querySelector(".flow-view")).toBeNull();
  });
});

describe("the figures' face", () => {
  it("is monospace unless the card is told to wear the dashboard's font", async () => {
    const mono = await render(config(), day);
    expect(mono.root.querySelector("ha-card")?.classList.contains("font-system")).toBe(false);
    const system = await render(config({ font: "system" }), day);
    expect(system.root.querySelector("ha-card")?.classList.contains("font-system")).toBe(true);
  });
});

describe("the ring at dusk", () => {
  const dusk = (pv: number): Scenario => ({ ...day, name: `dusk ${pv}`, house: 900, pv, soc: 60, battery: 0 });
  const centre = (root: ShadowRoot) => root.querySelector(".ring-value")?.textContent?.replace(/\s+/g, " ").trim() ?? "";

  it("keeps the production view through the last watts and lets it go only once they are gone", async () => {
    clearStatisticsCache();
    const element = document.createElement(CARD_TYPE) as Card;
    element.setConfig(config({ ring: { center: "production" } }));
    document.body.append(element);
    const show = async (pv: number) => {
      element.hass = makeHass(dusk(pv));
      await element.updateComplete;
      return centre(element.shadowRoot as ShadowRoot);
    };
    expect(await show(300)).toContain("0,30");
    // Forty watts would be night on a single threshold; the ring remembers the day.
    expect(await show(40)).toContain("0,04");
    // Ten watts is the end of it: the centre falls back to the house.
    expect(await show(10)).toContain("0,90");
    // And from there sixty watts is not enough to bring the day back.
    expect(await show(60)).toContain("0,90");
    expect(await show(200)).toContain("0,20");
  });

  it("is night below the horizon whatever the meter still reads", async () => {
    const { root } = await render(config({ ring: { center: "production" } }), { ...dusk(300), sunDown: true });
    expect(centre(root)).toContain("0,90");
  });
});

describe("the charge at sunrise, on the bar", () => {
  it("marks the level with the sun alone and leaves the cells as they are", async () => {
    const { root } = await render(config({ battery: { sunrise_mark: true, capacity: 13100 } }), evening);
    expect(root.querySelector(".bat-sun")).toBeTruthy();
    // A dimmed cell means the reserve, and nothing else.
    expect(root.querySelectorAll(".bat-fill.night").length).toBe(0);
  });

  it("stays off the bar by day, even while the battery carries the house", async () => {
    const foggy = SCENARIOS.find((s) => s.name === "foggy morning, three sources")!;
    const { root } = await render(config({ battery: { sunrise_mark: true, capacity: 13100 } }), foggy);
    expect(root.querySelector(".bat-sun")).toBeNull();
  });

  it("has nothing to say while the battery charges", async () => {
    const { root } = await render(config({ battery: { sunrise_mark: true, capacity: 13100 } }), day);
    expect(root.querySelector(".bat-sun")).toBeNull();
  });
});
