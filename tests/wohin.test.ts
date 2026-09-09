// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { CARD_TYPE, resolveConfig } from "../src/config";
import { clearStatisticsCache, runMinutes } from "../src/stats";
import type { PowerOriginCardConfig } from "../src/types";
import { IDS, SCENARIOS, makeHass, type Scenario } from "./fixtures";

const day = SCENARIOS[0];
const DEVICES = ["sensor.desk_power", "sensor.nas_power", "sensor.fridge_power", "sensor.oven_power"];
const ENERGY = { "sensor.desk_power": "sensor.desk_energy", "sensor.oven_power": "sensor.oven_energy" };

const config = (devices: PowerOriginCardConfig["devices"]): PowerOriginCardConfig => ({
  type: `custom:${CARD_TYPE}`,
  entities: { ...IDS },
  sections: { ring: false, chart: false, battery: false, today: false, devices: true },
  devices: { list: DEVICES, energy: ENERGY, threshold: 10, ...devices }
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

beforeAll(async () => {
  await import("../src/power-origin-card");
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("how long a device has been drawing", () => {
  it("counts back from the end while the series stays above the threshold", () => {
    const now = Date.now();
    const series = [0, 0, 300, 400, 380].map((mean, i) => ({ start: now - (5 - i) * 300000, mean }));
    expect(runMinutes(series, 100, now)).toBe(15);
    expect(runMinutes(series, 500, now)).toBeUndefined();
  });
});

describe("icons chosen for devices", () => {
  it("beat the sensor's own and the name", async () => {
    const { root } = await mount(config({ "icon:sensor.desk_power": "mdi:robot" }), day);
    const icons = [...root.querySelectorAll("ha-icon")].map((i) => i.getAttribute("icon"));
    expect(icons).toContain("mdi:robot");
    expect(icons).not.toContain("mdi:desktop-tower-monitor");
  });

  it("are read into one map from the editor's fields", () => {
    const resolved = resolveConfig(config({ "icon:sensor.desk_power": "mdi:robot" }));
    expect(resolved.devices.icons["sensor.desk_power"]).toBe("mdi:robot");
  });
});

describe("tiles", () => {
  it("stand one per device, the biggest first, the quiet ones dim", async () => {
    const { root } = await mount(config({ style: "tiles" }), day);
    const tiles = [...root.querySelectorAll(".tile")];
    expect(tiles.length).toBe(4);
    expect(tiles[0].textContent).toContain("oven");
    expect(root.querySelectorAll(".tile.off").length).toBe(1);
  });
});

describe("the biggest as a row of its own", () => {
  it("leaves the list, and says since when and what it cost", async () => {
    const { root, text } = await mount(config({ top: true }), day);
    expect(root.querySelector(".wohin-top")).toBeTruthy();
    expect(root.querySelector(".wohin-top")?.textContent).toContain("oven");
    expect(text()).toContain("seit");
    expect(text()).toContain("€ heute");
    expect(root.querySelector(".wohin-keys")?.textContent).not.toContain("oven");
  });
});

describe("a line per device", () => {
  it("draws the last hour beside each name", async () => {
    const { root } = await mount(config({ spark: true }), day);
    expect(root.querySelectorAll(".wohin-row").length).toBeGreaterThan(2);
    expect(root.querySelectorAll(".spark polyline").length).toBeGreaterThan(2);
  });
});

describe("rooms", () => {
  it("open on a tap to the devices standing in them", async () => {
    const { element, root } = await mount(config({ group: "area" }), day);
    expect(root.querySelector(".wohin-sub")).toBeNull();
    const room = [...root.querySelectorAll(".wohin-keys .room")].find((r) => r.textContent?.includes("Büro")) as HTMLElement;
    room.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await element.updateComplete;
    expect(root.querySelector(".wohin-sub")?.textContent).toContain("desk");
  });
});
