// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from "vitest";
import { CARD_TYPE } from "../src/config";
import type { PowerOriginCardConfig, RingCenter, FactsStyle, BatteryStyle } from "../src/types";
import { IDS, SCENARIOS, makeHass, type Scenario } from "./fixtures";

const MODES: RingCenter[] = ["power", "production", "surplus", "autarky"];
const FACTS: FactsStyle[] = ["bars", "plain", "inline", "none"];
const BATTERY_STYLES: BatteryStyle[] = ["segments", "solid"];

const baseConfig = (overrides: Partial<PowerOriginCardConfig> = {}): PowerOriginCardConfig => ({
  type: `custom:${CARD_TYPE}`,
  battery_capacity: 13100,
  entities: { ...IDS },
  ...overrides
});

interface Rendered {
  root: ShadowRoot;
  text: string;
}

async function render(
  config: PowerOriginCardConfig,
  scenario: Scenario
): Promise<Rendered> {
  const element = document.createElement(CARD_TYPE) as HTMLElement & {
    setConfig(config: PowerOriginCardConfig): void;
    hass: unknown;
    updateComplete: Promise<unknown>;
  };
  element.setConfig(config);
  document.body.append(element);
  element.hass = makeHass(scenario);

  await element.updateComplete;
  // The statistics request resolves on a later microtask; a second pass picks
  // up the chart and the averaged battery runtime.
  await new Promise((resolve) => setTimeout(resolve, 0));
  element.hass = makeHass(scenario);
  await element.updateComplete;

  const root = element.shadowRoot as ShadowRoot;
  const text = [...root.children]
    .filter((child) => child.tagName !== "STYLE")
    .map((child) => child.textContent ?? "")
    .join(" ");
  element.remove();
  return { root, text };
}

beforeAll(async () => {
  await import("../src/power-origin-card");
});

describe("the whole configuration matrix", () => {
  it("registers the card and its editor", () => {
    expect(customElements.get(CARD_TYPE)).toBeTruthy();
  });

  for (const scenario of SCENARIOS) {
    for (const mode of MODES) {
      it(`renders "${scenario.name}" in ${mode} mode without a broken value`, async () => {
        const { text } = await render(
          baseConfig({ ring: { center: mode } }),
          scenario
        );
        expect(text).not.toMatch(/NaN|undefined|null|Infinity/);
      });
    }
  }

  for (const facts of FACTS) {
    for (const style of BATTERY_STYLES) {
      it(`renders facts "${facts}" with a ${style} battery`, async () => {
        const { root, text } = await render(
          baseConfig({ ring: { facts }, battery: { style } }),
          SCENARIOS[0]
        );
        expect(text).not.toMatch(/NaN|undefined|null/);
        expect(root.querySelectorAll(".facts").length).toBe(facts === "none" ? 0 : 1);
      });
    }
  }
});

describe("bars", () => {
  it("never draws a bar wider than its container", async () => {
    for (const scenario of SCENARIOS) {
      for (const mode of MODES) {
        const { root } = await render(baseConfig({ ring: { center: mode } }), scenario);
        for (const bar of root.querySelectorAll(".bar")) {
          const width = Number.parseFloat((bar as HTMLElement).style.width);
          expect(width, `${scenario.name}/${mode}`).toBeGreaterThanOrEqual(0);
          expect(width, `${scenario.name}/${mode}`).toBeLessThanOrEqual(100.01);
        }
      }
    }
  });

  it("gives no bars at all when the style is plain", async () => {
    const { root } = await render(baseConfig({ ring: { facts: "plain" } }), SCENARIOS[0]);
    expect(root.querySelectorAll(".bar").length).toBe(0);
  });
});

describe("sections", () => {
  it("drops exactly the blocks that are switched off", async () => {
    const { root } = await render(
      baseConfig({ sections: { ring: true, chart: false, battery: false, today: false } }),
      SCENARIOS[0]
    );
    expect(root.querySelector(".ring-block")).toBeTruthy();
    expect(root.querySelector(".today")).toBeNull();
    expect(root.querySelectorAll(".row").length).toBe(0);
  });

  it("survives every block being switched off", async () => {
    const { root } = await render(
      baseConfig({ sections: { ring: false, chart: false, battery: false, today: false } }),
      SCENARIOS[0]
    );
    expect(root.querySelector("ha-card")).toBeTruthy();
  });
});

describe("fallbacks", () => {
  it("shows the house ring when nothing is produced, even in production mode", async () => {
    const dark = SCENARIOS.find((s) => s.name === "nothing produced, empty battery")!;
    const { root, text } = await render(
      baseConfig({ ring: { center: "production" } }),
      dark
    );
    expect(text).not.toContain("ERZEUGT");
    expect(root.querySelectorAll(".seg").length).toBeGreaterThan(0);
  });

  it("never hides an import or a discharge, whatever the mode", async () => {
    // Asserted as numbers, not labels: which element carries them is a design
    // decision, that they are on screen at all is not.
    const mixed = SCENARIOS.find((s) => s.name === "little sun, battery helping")!;
    for (const mode of MODES) {
      const { root, text } = await render(baseConfig({ ring: { center: mode } }), mixed);
      expect(text, `import in ${mode}`).toContain("1,90");
      // The discharge is carried by the column's green rather than a figure.
      expect(
        root.querySelectorAll(".meter-on.discharge, .meter-band.discharge").length,
        mode
      ).toBeGreaterThan(0);
    }
  });

  it("still shows both when the value list is switched on as well", async () => {
    const mixed = SCENARIOS.find((s) => s.name === "little sun, battery helping")!;
    const { text } = await render(baseConfig({ ring: { facts: "bars" } }), mixed);
    expect(text).toContain("Aus dem Netz");
    expect(text).toContain("Aus dem Speicher");
  });

  it("keeps the meter scale off the weather", async () => {
    const bright = SCENARIOS.find((s) => s.name === "sunny afternoon")!;
    const { root } = await render(baseConfig(), bright);
    expect(root.querySelector(".meter")).toBeTruthy();
    expect(root.querySelector(".meter-word")?.textContent?.trim().length).toBeGreaterThan(0);
  });

  it("says it has no data rather than showing zeros", async () => {
    const offline = SCENARIOS.find((s) => s.name === "inverter offline")!;
    const { text } = await render(baseConfig(), offline);
    expect(text).toContain("Keine Daten");
  });

  it("draws an empty but valid ring when everything is zero", async () => {
    const idle = SCENARIOS.find((s) => s.name === "everything at zero")!;
    const { root, text } = await render(baseConfig(), idle);
    expect(root.querySelector(".ring-track")).toBeTruthy();
    expect(text).not.toMatch(/NaN|undefined/);
  });
});

describe("the battery block", () => {
  it("prints no time at all when the runtime is switched off", async () => {
    const evening = SCENARIOS.find((s) => s.name === "evening on battery")!;
    const { text } = await render(
      baseConfig({ battery: { runtime: false } }),
      evening
    );
    expect(text).not.toContain("Reicht bis");
  });

  it("prints the time when it is switched on and the battery is delivering", async () => {
    const evening = SCENARIOS.find((s) => s.name === "evening on battery")!;
    const { text } = await render(baseConfig({ battery: { runtime: true } }), evening);
    expect(text).toContain("Reicht bis");
  });

  it("draws the number of segments it was asked for", async () => {
    const { root } = await render(
      baseConfig({ battery: { style: "segments", segments: 6 } }),
      SCENARIOS[0]
    );
    // One background and one fill per lit segment.
    expect(root.querySelectorAll("rect.fill-off").length).toBe(6);
  });

  it("disappears when there is no state of charge", async () => {
    const config = baseConfig();
    delete config.entities.battery_soc;
    const { root } = await render(config, SCENARIOS[0]);
    expect(root.querySelector(".bat-shell")).toBeNull();
  });
});

describe("money", () => {
  it("reads a negative balance as earned", async () => {
    const { text } = await render(baseConfig(), SCENARIOS[0]);
    expect(text).toContain("verdient");
    expect(text).not.toContain("gezahlt");
  });

  it("reads a positive balance as paid", async () => {
    const foggy = SCENARIOS.find((s) => s.name === "foggy morning, three sources")!;
    const { text } = await render(baseConfig(), foggy);
    expect(text).toContain("gezahlt");
  });

  it("leaves the line out when no balance entity is configured", async () => {
    const config = baseConfig();
    delete config.entities.cost_today;
    const { text } = await render(config, SCENARIOS[0]);
    expect(text).not.toContain("verdient");
  });
});

describe("the minimal configuration", () => {
  it("works with nothing but the house sensor", async () => {
    const { root, text } = await render(
      { type: `custom:${CARD_TYPE}`, entities: { house: IDS.house } },
      SCENARIOS[0]
    );
    expect(root.querySelector("ha-card")).toBeTruthy();
    expect(text).not.toMatch(/NaN|undefined/);
  });

  it("refuses a configuration without a house sensor", () => {
    const element = document.createElement(CARD_TYPE) as HTMLElement & {
      setConfig(config: unknown): void;
    };
    expect(() => element.setConfig({ type: "x", entities: {} })).toThrow();
  });
});

describe("the ring caption", () => {
  it("names the source when one carries the whole house", async () => {
    const evening = SCENARIOS.find((s) => s.name === "evening on battery")!;
    const { text } = await render(baseConfig({ ring: { center: "power" } }), evening);
    expect(text).toContain("Aus dem Speicher");
  });

  it("says house when several sources share the load", async () => {
    const foggy = SCENARIOS.find((s) => s.name === "foggy morning, three sources")!;
    const { text } = await render(baseConfig({ ring: { center: "power" } }), foggy);
    expect(text).toContain("HAUS");
  });
});
