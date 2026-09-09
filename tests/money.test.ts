// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { CARD_TYPE } from "../src/config";
import { clearStatisticsCache } from "../src/stats";
import type { HomeAssistant, PowerOriginCardConfig } from "../src/types";
import { IDS, SCENARIOS, makeHass, type Scenario } from "./fixtures";

const day = SCENARIOS[0];

const config = (today: PowerOriginCardConfig["today"], extra: Partial<PowerOriginCardConfig> = {}): PowerOriginCardConfig => ({
  type: `custom:${CARD_TYPE}`,
  entities: { ...IDS, price_export: "sensor.price_export", amortisation: "sensor.paid" },
  sections: { ring: false, chart: false, battery: false, today: true },
  today: { money: true, ...today },
  ...extra
});

type Card = HTMLElement & {
  setConfig(config: PowerOriginCardConfig): void;
  hass: unknown;
  updateComplete: Promise<unknown>;
};

function withPaid(hass: HomeAssistant): HomeAssistant {
  return {
    ...hass,
    states: {
      ...hass.states,
      "sensor.paid": { entity_id: "sensor.paid", state: "31", attributes: { unit_of_measurement: "%" } }
    }
  };
}

async function mount(cfg: PowerOriginCardConfig, scenario: Scenario) {
  clearStatisticsCache();
  const element = document.createElement(CARD_TYPE) as Card;
  element.setConfig(cfg);
  document.body.append(element);
  element.hass = withPaid(makeHass(scenario));
  await element.updateComplete;
  await new Promise((resolve) => setTimeout(resolve, 0));
  element.hass = withPaid(makeHass(scenario));
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

describe("the month beside the day", () => {
  it("stands small under the balance with the month's name", async () => {
    const { root } = await mount(config({ month: true }), day);
    const month = root.querySelector(".money-month");
    expect(month).toBeTruthy();
    expect(month?.textContent).toContain("+");
    expect(month?.textContent).toMatch(/Jun/);
  });

  it("is not there unless asked", async () => {
    const { root } = await mount(config({}), day);
    expect(root.querySelector(".money-month")).toBeNull();
  });
});

describe("not bought against sold", () => {
  it("splits the day's money in two colours", async () => {
    const { root, text } = await mount(config({ split: true }), day);
    expect(root.querySelector(".split-bar .saved")).toBeTruthy();
    expect(root.querySelector(".split-bar .sold")).toBeTruthy();
    expect(text()).toContain("nicht gekauft");
    expect(text()).toContain("verkauft");
  });
});

describe("the year it is paid off", () => {
  it("follows the paid-off share and this year's pace", async () => {
    const { root, text } = await mount(config({ payoff_year: true, investment: 13900 }), day);
    expect(root.querySelector(".payoff-bar span")?.getAttribute("style")).toContain("31.0%");
    expect(text()).toMatch(/31 % · 20\d\d/);
    expect(text().replace(/\s+/g, " ")).toContain("von 13.900 €");
    expect(text()).toContain("im Jahr");
  });

  it("gives no year without the cost of the system", async () => {
    const { root, text } = await mount(config({ payoff_year: true }), day);
    expect(root.querySelector(".payoff")).toBeNull();
    expect(text()).not.toMatch(/31 % · 20\d\d/);
  });
});
