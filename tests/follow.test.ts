// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { CARD_TYPE } from "../src/config";
import { clearStatisticsCache } from "../src/stats";
import type { HomeAssistant, PowerOriginCardConfig } from "../src/types";
import { IDS, SCENARIOS, makeHass } from "./fixtures";

const day = SCENARIOS[0];

/** What the Energy dashboard answers: two devices with a live sensor, one with a meter alone. */
const PREFS = {
  energy_sources: [],
  device_consumption: [
    { stat_consumption: "sensor.desk_energy", stat_rate: "sensor.desk_power", name: "Schreibtisch" },
    { stat_consumption: "sensor.nas_energy", stat_rate: "sensor.nas_power", name: "NAS" },
    { stat_consumption: "sensor.roborock_energy" }
  ]
};

const config = (devices: PowerOriginCardConfig["devices"]): PowerOriginCardConfig => ({
  type: `custom:${CARD_TYPE}`,
  entities: { ...IDS },
  sections: { ring: false, chart: false, battery: false, today: false, devices: true },
  devices: { threshold: 10, ...devices }
});

type Card = HTMLElement & {
  setConfig(config: PowerOriginCardConfig): void;
  hass: unknown;
  updateComplete: Promise<unknown>;
};

function hassWithDashboard(): { hass: HomeAssistant; asked: () => number } {
  const base = makeHass(day);
  let asked = 0;
  const hass: HomeAssistant = {
    ...base,
    async callWS(message: Record<string, unknown>) {
      if (message.type === "energy/get_prefs") {
        asked += 1;
        return PREFS as never;
      }
      return base.callWS(message);
    }
  };
  return { hass, asked: () => asked };
}

async function mount(cfg: PowerOriginCardConfig) {
  clearStatisticsCache();
  const { hass, asked } = hassWithDashboard();
  const element = document.createElement(CARD_TYPE) as Card;
  element.setConfig(cfg);
  document.body.append(element);
  element.hass = hass;
  await element.updateComplete;
  // The dashboard answers, the means are fetched, the block is drawn.
  for (let i = 0; i < 4; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    element.hass = { ...hass };
    await element.updateComplete;
  }
  const root = element.shadowRoot as ShadowRoot;
  const text = () =>
    [...root.children]
      .filter((child) => child.tagName !== "STYLE")
      .map((child) => child.textContent ?? "")
      .join(" ")
      .replace(/\s+/g, " ");
  return { root, text, asked };
}

beforeAll(async () => {
  await import("../src/power-origin-card");
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("following the Energy dashboard's devices", () => {
  it("names the devices the dashboard lists with a live sensor, and no other, without being asked to", async () => {
    const { text, asked } = await mount(config({}));
    expect(asked()).toBe(1);
    expect(text()).toContain("Schreibtisch");
    expect(text()).toContain("NAS");
    expect(text()).not.toContain("roborock");
  });

  it("leaves a list of your own alone", async () => {
    const { text, asked } = await mount(
      config({ list: ["sensor.desk_power"], names: { "sensor.desk_power": "Mein Tisch" } })
    );
    expect(asked()).toBe(0);
    expect(text()).toContain("Mein Tisch");
    expect(text()).not.toContain("NAS");
  });
});
