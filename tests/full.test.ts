// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { batteryView, fullFromForecast, fullVerdict } from "../src/battery";
import { CARD_TYPE } from "../src/config";
import { clearStatisticsCache } from "../src/stats";
import type { PowerOriginCardConfig } from "../src/types";
import { IDS, SCENARIOS, makeHass, type Scenario } from "./fixtures";

const charging = SCENARIOS.find((s) => s.name === "charging")!;
const at = (hours: number, minutes = 0) => new Date(2026, 5, 15, hours, minutes, 0);
const HOUR = 3600 * 1000;

describe("the full time from the forecast", () => {
  const slots = [
    { start: at(13).getTime(), kw: 3 },
    { start: at(14).getTime(), kw: 3 },
    { start: at(15).getTime(), kw: 0.5 }
  ];

  it("lands in the hour the surplus reaches what is missing", () => {
    const found = fullFromForecast(slots, at(13), 3, 1);
    expect(found.at?.getTime()).toBe(at(14, 30).getTime());
    expect(found.reachedKwh).toBe(3);
  });

  it("leaves out the part of this hour already gone", () => {
    const found = fullFromForecast(slots, at(13, 30), 3, 1);
    expect(found.at?.getTime()).toBe(at(15).getTime());
  });

  it("stops at sunset and says how far it got", () => {
    const found = fullFromForecast(slots, at(13), 3, 1, at(14, 15));
    expect(found.at).toBeUndefined();
    expect(found.reachedKwh).toBeCloseTo(2.5, 5);
  });

  it("never counts the house's own draw as charge", () => {
    const found = fullFromForecast(slots, at(13), 3, 3.5);
    expect(found.at).toBeUndefined();
    expect(found.reachedKwh).toBe(0);
  });
});

describe("the full time from the rate, checked against the day", () => {
  const sunset = at(19, 36);

  it("stands when it lands before sunset", () => {
    expect(fullVerdict(at(14, 26), at(13), sunset, true)).toBe("time");
  });

  it("is not today when the line runs past the sunset", () => {
    expect(fullVerdict(at(21), at(13), sunset, true)).toBe("not_today");
  });

  it("is not today when the line runs past a day, even at night from the grid", () => {
    expect(fullVerdict(new Date(at(23).getTime() + 30 * HOUR), at(23), sunset, false)).toBe("not_today");
  });

  it("keeps a night time when the grid is doing the charging", () => {
    expect(fullVerdict(at(23, 50), at(23), sunset, false)).toBe("time");
  });
});

describe("the charge rate", () => {
  it("is the last quarter hour's, not this second's", () => {
    const view = batteryView({ soc: 50, power: -6, averagePower: -3, capacity: 10000 }, at(13));
    expect(view.mode).toBe("charging");
    expect(view.hours).toBeCloseTo(5 / 3, 5);
  });

  it("falls back to the moment when the quarter hour was not charging", () => {
    const view = batteryView({ soc: 50, power: -6, averagePower: 0.4, capacity: 10000 }, at(13));
    expect(view.hours).toBeCloseTo(5 / 6, 5);
  });
});

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
  // The battery's row is the one whose casing is drawn; its head carries the
  // capacity as a note too, so the line under the bar is the last note.
  const note = () => {
    const row = root.querySelector(".bat-shell, .bat-cap")?.closest(".row");
    const notes = row ? [...row.querySelectorAll(".row-note")] : [];
    return notes.at(-1)?.textContent?.replace(/\s+/g, " ").trim() ?? "";
  };
  return { root, note };
}

beforeAll(async () => {
  await import("../src/power-origin-card");
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("what the battery block says while charging", () => {
  it("names a clock time from the rate when that time is still today", async () => {
    const { note } = await mount(config(), charging);
    expect(note()).toMatch(/Voll um 14:2\d/);
  });

  it("names an hour from the forecast when asked, and it is another hour", async () => {
    const { note } = await mount(config({ battery: { full_from: "forecast" } }), charging);
    expect(note()).toMatch(/Voll gegen 14:0\d/);
  });

  it("does not promise a time past the sunset", async () => {
    const trickle: Scenario = { ...charging, name: "trickle", battery: -200 };
    const { note } = await mount(config(), trickle);
    expect(note()).toContain("Heute nicht mehr voll");
    expect(note()).not.toMatch(/Voll um/);
  });

  it("says where the charge will stand at sunset when the forecast cannot fill it", async () => {
    const hungry: Scenario = { ...charging, name: "hungry house", house: 6000 };
    const { note } = await mount(config({ battery: { full_from: "forecast" } }), hungry);
    expect(note()).toContain("Heute nicht mehr voll");
    expect(note()).toMatch(/etwa \d+ % bei Sonnenuntergang/);
  });
});

describe("the traffic-light colours", () => {
  it("are one class on the card, and absent unless asked", async () => {
    const plain = await mount(config(), charging);
    expect(plain.root.querySelector("ha-card")?.classList.contains("palette-traffic")).toBe(false);
    const traffic = await mount(config({ palette: "traffic" }), charging);
    expect(traffic.root.querySelector("ha-card")?.classList.contains("palette-traffic")).toBe(true);
  });
});
