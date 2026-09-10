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

describe("rows", () => {
  it("stand one per device, the biggest first, the rest last with its count", async () => {
    const { root } = await mount(config({}), day);
    const rows = [...root.querySelectorAll(".wr")];
    expect(rows.length).toBeGreaterThan(2);
    expect(rows[0].textContent).toContain("oven");
    expect(rows[0].querySelector(".wr-bar i")).toBeTruthy();
    // The rest stands last when the named devices leave any; a house the
    // devices account for in full has none.
    const rest = root.querySelectorAll(".wr.rest");
    expect(rest.length).toBeLessThanOrEqual(1);
    if (rest.length) {
      expect(rows.at(-1)?.classList.contains("rest")).toBe(true);
      expect(rows.at(-1)?.textContent).toMatch(/Rest/);
    }
  });

  it("give the biggest the widest bar", async () => {
    const { root } = await mount(config({}), day);
    const widths = [...root.querySelectorAll(".wr:not(.rest) .wr-bar i")].map((i) =>
      parseFloat((i as HTMLElement).style.width)
    );
    expect(widths[0]).toBeGreaterThan(widths[1]);
  });
});

describe("the band", () => {
  it("is one strip with a legend keyed by shade", async () => {
    const { root } = await mount(config({ style: "band" }), day);
    expect(root.querySelectorAll(".wohin-band i").length).toBeGreaterThan(2);
    expect(root.querySelectorAll(".wohin-legend .sw").length).toBeGreaterThan(1);
    expect(root.querySelector(".wohin-band ha-icon")).toBeNull();
  });

  it("is what the two old bars and the tiles become", () => {
    for (const legacy of ["bar", "both"] as const) {
      expect(resolveConfig(config({ style: legacy })).devices.style).toBe("band");
    }
    expect(resolveConfig(config({ style: "tiles" })).devices.style).toBe("rows");
  });
});

describe("icons", () => {
  it("sit on a grid, the quiet ones dim, the figure under the ones that draw", async () => {
    const { root } = await mount(config({ style: "icons" }), day);
    expect(root.querySelector(".wohin-strip")).toBeTruthy();
    const devs = [...root.querySelectorAll(".dev")];
    expect(devs.length).toBe(4);
    expect(root.querySelectorAll(".dev.off").length).toBe(1);
    expect(devs[0].querySelector("small")?.textContent).toMatch(/W/);
  });
});

describe("the heading and the colours", () => {
  it("can leave the heading away and start where the line above ends", async () => {
    const { root } = await mount(config({ head: false }), day);
    expect(root.querySelector(".wohin .row-head")).toBeNull();
    expect(root.querySelector(".wohin")?.classList.contains("bare")).toBe(true);
  });

  it("give each device its own colour, fixed to its place in the list", async () => {
    const plain = await mount(config({}), day);
    expect(plain.root.querySelector(".wr")?.getAttribute("style")).not.toContain("--dev-colour");
    const { root } = await mount(config({ colours: true, style: "icons" }), day);
    const styles = [...root.querySelectorAll(".dev")].map((d) => d.getAttribute("style") ?? "");
    expect(styles.every((s) => s.includes("--dev-colour"))).toBe(true);
    expect(new Set(styles).size).toBe(styles.length);
  });
});

describe("the biggest as a row of its own", () => {
  it("leaves the list, and says since when and what it cost", async () => {
    const { root, text } = await mount(config({ top: true }), day);
    expect(root.querySelector(".wohin-top")).toBeTruthy();
    expect(root.querySelector(".wohin-top")?.textContent).toContain("oven");
    expect(text()).toContain("seit");
    expect(text()).toContain("€ heute");
    expect(root.querySelector(".wohin-rows")?.textContent).not.toContain("oven");
  });
});

describe("a line per device", () => {
  it("draws the last hour beside each name", async () => {
    const { root } = await mount(config({ spark: true }), day);
    expect(root.querySelectorAll(".wr").length).toBeGreaterThan(2);
    expect(root.querySelectorAll(".spark polyline").length).toBeGreaterThan(2);
  });
});

describe("rooms", () => {
  it("open on a tap to the devices standing in them", async () => {
    const { element, root } = await mount(config({ group: "area" }), day);
    expect(root.querySelector(".wohin-sub")).toBeNull();
    const room = [...root.querySelectorAll(".wr.room")].find((r) => r.textContent?.includes("Büro")) as HTMLElement;
    room.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await element.updateComplete;
    expect(root.querySelector(".wohin-sub")?.textContent).toContain("desk");
  });
});
