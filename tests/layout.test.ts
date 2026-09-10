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

async function mount(cfg: PowerOriginCardConfig, scenario: Scenario, width = 900) {
  clearStatisticsCache();
  const element = document.createElement(CARD_TYPE) as Card;
  // A test document has no width of its own; the card measures what it is told.
  Object.defineProperty(element, "clientWidth", { value: width, configurable: true });
  element.setConfig(cfg);
  document.body.append(element);
  element.hass = makeHass(scenario);
  await element.updateComplete;
  await new Promise((resolve) => setTimeout(resolve, 0));
  element.hass = makeHass(scenario);
  await element.updateComplete;
  return { element, root: element.shadowRoot as ShadowRoot };
}

describe("the chip and the foot", () => {
  it("rides in the ring's corner when the head would hold nothing else", async () => {
    const bare = await mount(
      config({ title: undefined, ring: { facts: "none", columns: "one", meter_shows: "grid" } }),
      day
    );
    expect(bare.root.querySelector(".ring-block.chipped > .chip")).toBeTruthy();
    expect(bare.root.querySelector(".head")).toBeNull();

    const titled = await mount(
      config({ ring: { facts: "none", columns: "one", meter_shows: "grid" } }),
      day
    );
    expect(titled.root.querySelector(".head .chip")).toBeTruthy();
    expect(titled.root.querySelector(".ring-block.chipped")).toBeNull();
  });

  it("lets the day reach the card edges only where it stands last", async () => {
    const last = await mount(config({ sections: { devices: false } }), day);
    expect(last.root.querySelector(".today.foot")).toBeTruthy();
    // Moved up the order it keeps its panel but stops being the foot.
    const middle = await mount(config({ sections: { order: ["today"] as never } }), day);
    expect(middle.root.querySelector(".today")).toBeTruthy();
    expect(middle.root.querySelector(".today.foot")).toBeNull();
  });
});

describe("the order of the blocks", () => {
  it("puts the named ones first and lets the rest follow", async () => {
    const { blockOrder, resolveConfig } = await import("../src/config");
    const resolved = resolveConfig({
      type: "custom:power-origin-card",
      entities: { house: "sensor.h" },
      sections: { week: false, order: ["devices", "week", "ring", "devices"] as never }
    });
    // The list keeps what was chosen, once each, and only blocks that are on.
    expect(resolved.sections.order).toEqual(["devices", "ring"]);
    expect(blockOrder(resolved)).toEqual(["devices", "ring", "chart", "week", "battery", "today"]);
  });
});

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

  it("never goes wide in a card too narrow for two columns, whatever is asked", async () => {
    const { root } = await mount(config({ shape: "wide", wide_from: 0 }), day, 420);
    expect(root.querySelector("ha-card")?.classList.contains("wide")).toBe(false);
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
