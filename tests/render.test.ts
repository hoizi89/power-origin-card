// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from "vitest";
import { CARD_TYPE } from "../src/config";
import type { PowerOriginCardConfig, RingCenter, FactsStyle, BatteryStyle } from "../src/types";
import { clearStatisticsCache } from "../src/stats";
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
  clearStatisticsCache();
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

  it("never hides an import, whatever the mode", async () => {
    // Asserted as a number, not a label: which element carries it is a design
    // decision, that it is on screen at all is not.
    const mixed = SCENARIOS.find((s) => s.name === "little sun, battery helping")!;
    for (const mode of MODES) {
      const { text } = await render(baseConfig({ ring: { center: mode } }), mixed);
      expect(text, `import in ${mode}`).toContain("1,90");
    }
  });

  it("shows the battery carrying the house wherever the ring describes supply", async () => {
    // The production views describe the roof instead, and say so; the supply
    // views must never leave a working battery unmentioned.
    const mixed = SCENARIOS.find((s) => s.name === "little sun, battery helping")!;
    for (const mode of ["power", "autarky"] as const) {
      const { root } = await render(baseConfig({ ring: { center: mode } }), mixed);
      expect(root.querySelectorAll(".seg.battery").length, mode).toBeGreaterThan(0);
    }
  });

  it("still shows both when the value list is switched on as well", async () => {
    const mixed = SCENARIOS.find((s) => s.name === "little sun, battery helping")!;
    const { text } = await render(baseConfig({ ring: { facts: "bars" } }), mixed);
    expect(text).toContain("Aus dem Netz");
    expect(text).toContain("Speicher");
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

  it("leaves the line out with nothing to work from", async () => {
    const config = baseConfig();
    delete config.entities.cost_today;
    delete config.entities.cost_export_today;
    delete config.entities.cost_import_today;
    const { text } = await render(config, SCENARIOS[0]);
    expect(text).not.toContain("verdient");
  });

  it("works the balance out from the two sides when no sensor gives it", async () => {
    const config = baseConfig();
    delete config.entities.cost_today;
    const { text } = await render(config, SCENARIOS[0]);
    // 1.20 earned less 0.02 paid, without a balance sensor anywhere.
    expect(text).toContain("verdient");
    expect(text).toContain("1,18");
  });

  it("works both sides out from the prices when no money sensor gives them", async () => {
    const config = baseConfig({
      entities: {
        house: IDS.house,
        solar: IDS.solar,
        grid_power: IDS.grid_power,
        solar_today: IDS.solar_today,
        house_today: IDS.house_today,
        export_today: IDS.export_today,
        import_today: IDS.import_today,
        price_import: "sensor.price_import",
        price_export: "sensor.price_export"
      },
      today: { breakdown: true }
    });
    const { text } = await render(config, SCENARIOS[0]);
    // 29.4 kWh exported at 0.08, 0.1 kWh drawn at 0.29.
    expect(text).toContain("2,35");
    expect(text).toContain("verdient");
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
    clearStatisticsCache();
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
    expect(text).toContain("Speicher");
  });

  it("says house when several sources share the load", async () => {
    const foggy = SCENARIOS.find((s) => s.name === "foggy morning, three sources")!;
    const { text } = await render(baseConfig({ ring: { center: "power" } }), foggy);
    expect(text).toContain("HAUS");
  });
});

describe("the column", () => {
  it("says nothing rather than name a hundredth of a kilowatt", async () => {
    const trickle = SCENARIOS.find((s) => s.name === "covered, ten watts spare")!;
    const { root, text } = await render(baseConfig(), trickle);
    expect(root.querySelectorAll(".meter-value").length).toBe(0);
    expect(text).toContain("kein Netzaustausch");
    expect(text).not.toContain("0,01");
  });

  it("keeps the battery off the scale unless asked for it", async () => {
    const night = SCENARIOS.find((s) => s.name === "evening on battery")!;

    const grid = await render(baseConfig({ ring: { meter_scope: "grid" } }), night);
    expect(grid.root.querySelectorAll(".meter-on.discharge").length).toBe(0);

    const all = await render(baseConfig({ ring: { meter_scope: "all" } }), night);
    expect(all.root.querySelectorAll(".meter-on.discharge").length).toBeGreaterThan(0);
    expect(all.text).toContain("Aus dem Speicher");
  });
});

describe("the battery caption", () => {
  it("names the reserve instead of promising a night that is already over", async () => {
    const night = SCENARIOS.find((s) => s.name === "evening on battery")!;
    const { text } = await render(
      baseConfig({ battery_capacity: 13100, battery_reserve: night.soc }),
      night
    );
    expect(text).toContain("Reserve erreicht");
    expect(text).not.toContain("Reicht bis");
  });
});

describe("the ring styles", () => {
  it("draws the day as a second ring", async () => {
    const foggy = SCENARIOS.find((s) => s.name === "foggy morning, three sources")!;
    const { root } = await render(baseConfig({ ring: { rings: "double" } }), foggy);
    expect(root.querySelectorAll(".ring-day").length).toBeGreaterThan(0);
  });

  it("still shows the day bar beside it when that was asked for", async () => {
    // Saying the same thing twice is allowed when both were chosen; what is
    // not allowed is the card deciding it on its own.
    const foggy = SCENARIOS.find((s) => s.name === "foggy morning, three sources")!;
    const { root } = await render(
      baseConfig({ ring: { rings: "double" }, today: { origin_bar: true } }),
      foggy
    );
    expect(root.querySelectorAll(".ring-day").length).toBeGreaterThan(0);
    expect(root.querySelector(".origin-bar")).toBeTruthy();
  });

  it("keeps one ring and the bar by default", async () => {
    const foggy = SCENARIOS.find((s) => s.name === "foggy morning, three sources")!;
    const { root } = await render(baseConfig({ today: { origin_bar: true } }), foggy);
    expect(root.querySelectorAll(".ring-day").length).toBe(0);
    expect(root.querySelector(".origin-bar")).toBeTruthy();
  });

  it("drops the default autarky tile when the ring already prints it", async () => {
    const { root } = await render(baseConfig({ ring: { center: "autarky" } }), SCENARIOS[0]);
    const labels = [...root.querySelectorAll(".stat-k")].map((n) => n.textContent?.trim());
    expect(labels).not.toContain("Autarkie");
  });

  it("keeps it when the list was chosen by hand", async () => {
    const { root } = await render(
      baseConfig({ ring: { center: "autarky" }, today: { stats: ["autarky", "peak"] } }),
      SCENARIOS[0]
    );
    const labels = [...root.querySelectorAll(".stat-k")].map((n) => n.textContent?.trim());
    expect(labels).toContain("Autarkie");
  });
});

describe("the day views", () => {
  it("turns the column into a strip of hours", async () => {
    const foggy = SCENARIOS.find((s) => s.name === "foggy morning, three sources")!;
    const { root } = await render(
      baseConfig({ ring: { meter: true, meter_style: "day" } }),
      foggy
    );
    expect(root.querySelectorAll(".day-band").length).toBeGreaterThan(1);
    expect(root.querySelector(".meter-on")).toBeNull();
  });

  it("puts the day bar on a time axis when asked", async () => {
    const foggy = SCENARIOS.find((s) => s.name === "foggy morning, three sources")!;
    const { root } = await render(
      baseConfig({ today: { origin_bar: true, origin_style: "band" } }),
      foggy
    );
    expect(root.querySelectorAll(".day-cell").length).toBe(24);
    expect(root.querySelector(".origin-hours")).toBeTruthy();
  });

  it("wraps the day around the ring as a clock", async () => {
    const foggy = SCENARIOS.find((s) => s.name === "foggy morning, three sources")!;
    const { root } = await render(baseConfig({ ring: { rings: "clock" } }), foggy);
    expect(root.querySelectorAll(".clock-hour").length).toBeGreaterThan(1);
    expect(root.querySelector(".clock-now")).toBeTruthy();
    // The share segments step aside; the circle now means time, not proportion.
    expect(root.querySelectorAll(".seg").length).toBe(0);
  });
});

describe("the balance column", () => {
  it("draws the roof beside the house and names the shortfall", async () => {
    const foggy = SCENARIOS.find((s) => s.name === "foggy morning, three sources")!;
    const { root, text } = await render(
      baseConfig({ ring: { meter: true, meter_style: "balance" } }),
      foggy
    );
    expect(root.querySelector(".bal-roof")).toBeTruthy();
    expect(root.querySelector(".bal-house")).toBeTruthy();
    // 0.38 kW off the roof against 3.1 kW in the house.
    expect(text).toContain("zugekauft");
  });

  it("names the surplus when the roof is ahead", async () => {
    const { text } = await render(
      baseConfig({ ring: { meter: true, meter_style: "balance" } }),
      SCENARIOS[0]
    );
    expect(text).toContain("Dach");
  });
});

describe("what fills the empty space", () => {
  it("lets the outer ring follow the question the centre asks", async () => {
    // A ring about the roof gets the roof's day, not the house's.
    const { root } = await render(
      baseConfig({ ring: { rings: "double", center: "production" } }),
      SCENARIOS[0]
    );
    expect(root.querySelectorAll(".ring-day").length).toBeGreaterThan(0);
    expect(root.querySelectorAll(".ring-day.faint").length).toBeGreaterThan(0);
  });

  it("draws no forecast arc without a forecast sensor", async () => {
    const config = baseConfig({ ring: { rings: "double", center: "production" } });
    delete config.entities.forecast;
    const { root } = await render(config, SCENARIOS[0]);
    expect(root.querySelectorAll(".ring-day.faint").length).toBe(0);
  });

  it("puts the day's consumption curve behind the number", async () => {
    const { root } = await render(baseConfig({ ring: { inner: "load" } }), SCENARIOS[0]);
    const curve = root.querySelector(".ring-curve");
    expect(curve).toBeTruthy();
    expect(curve!.getAttribute("d")!.length).toBeGreaterThan(20);
    expect(root.querySelector(".ring-mark")).toBeNull();
  });

  it("leaves the middle bare when asked to", async () => {
    const { root } = await render(baseConfig({ ring: { inner: "none" } }), SCENARIOS[0]);
    expect(root.querySelector(".ring-curve")).toBeNull();
    expect(root.querySelector(".ring-mark")).toBeNull();
  });

  it("keeps the day's swing behind the needle", async () => {
    const foggy = SCENARIOS.find((s) => s.name === "foggy morning, three sources")!;
    const { root } = await render(
      baseConfig({ ring: { meter: true, meter_today: true } }),
      foggy
    );
    expect(root.querySelectorAll(".meter-swing").length).toBeGreaterThan(0);
  });
});

describe("the chart before the day has a shape", () => {
  it("drops the empty frame but keeps the sentence under it", async () => {
    const dark = SCENARIOS.find((s) => s.name === "nothing produced, empty battery")!;
    const { root, text } = await render(baseConfig(), dark);
    expect(root.querySelector("svg.chart")).toBeNull();
    expect(text).toContain("erzeugt");
  });

  it("draws it as soon as there is one", async () => {
    const { root } = await render(baseConfig(), SCENARIOS[0]);
    expect(root.querySelector("svg.chart")).toBeTruthy();
  });
});

describe("the second column", () => {
  it("draws a different type on the other side of the ring", async () => {
    const foggy = SCENARIOS.find((s) => s.name === "foggy morning, three sources")!;
    const { root } = await render(
      baseConfig({ ring: { meter: true, meter_style: "blocks", meter_second: "day" } }),
      foggy
    );
    expect(root.querySelectorAll(".meter-block").length).toBe(2);
    expect(root.querySelectorAll(".day-band").length).toBeGreaterThan(1);
    expect(root.querySelectorAll(".meter-off").length).toBeGreaterThan(0);
  });

  it("stays at one column by default", async () => {
    const { root } = await render(baseConfig({ ring: { meter: true } }), SCENARIOS[0]);
    expect(root.querySelectorAll(".meter-block").length).toBe(1);
  });

  it("draws none when the column is switched off entirely", async () => {
    const { root } = await render(
      baseConfig({ ring: { meter: false, meter_second: "day" } }),
      SCENARIOS[0]
    );
    expect(root.querySelectorAll(".meter-block").length).toBe(0);
  });
});

describe("the clock face", () => {
  it("puts noon at the top rather than at the bottom", async () => {
    const foggy = SCENARIOS.find((s) => s.name === "foggy morning, three sources")!;
    const { root } = await render(baseConfig({ ring: { rings: "clock" } }), foggy);
    const hour = root.querySelector(".clock-hour")!;
    expect(hour.getAttribute("transform")).toBe("rotate(90 100 100)");
  });

  it("marks which way round it reads, and lets that be turned off", async () => {
    const foggy = SCENARIOS.find((s) => s.name === "foggy morning, three sources")!;
    const on = await render(baseConfig({ ring: { rings: "clock" } }), foggy);
    expect(on.root.querySelector(".clock-mark.sun")).toBeTruthy();
    expect(on.root.querySelector(".clock-mark.moon")).toBeTruthy();

    const off = await render(
      baseConfig({ ring: { rings: "clock", clock_marks: false } }),
      foggy
    );
    expect(off.root.querySelector(".clock-mark")).toBeNull();
  });

  it("shows no dial marks on a ring that is not a clock", async () => {
    const { root } = await render(baseConfig({ ring: { rings: "double" } }), SCENARIOS[0]);
    expect(root.querySelector(".clock-mark")).toBeNull();
  });
});

describe("opening the entity behind a figure", () => {
  it("asks Home Assistant for the house when the ring shows the house", async () => {
    const { root } = await render(baseConfig(), SCENARIOS[0]);
    const value = root.querySelector(".ring-value") as SVGElement;
    expect(value.getAttribute("class")).toContain("tap");

    let asked: string | undefined;
    root.host.addEventListener("hass-more-info", (event) => {
      asked = (event as CustomEvent).detail.entityId;
    });
    value.dispatchEvent(new Event("click", { bubbles: true, composed: true }));
    expect(asked).toBe(IDS.house);
  });

  it("asks for the roof when the ring shows the roof", async () => {
    const { root } = await render(baseConfig({ ring: { center: "production" } }), SCENARIOS[0]);
    let asked: string | undefined;
    root.host.addEventListener("hass-more-info", (event) => {
      asked = (event as CustomEvent).detail.entityId;
    });
    (root.querySelector(".ring-value") as SVGElement).dispatchEvent(
      new Event("click", { bubbles: true, composed: true })
    );
    expect(asked).toBe(IDS.solar);
  });

  it("leaves a figure it worked out itself alone", async () => {
    const { root } = await render(
      baseConfig({ today: { stats: ["autarky", "export"] } }),
      SCENARIOS[0]
    );
    const tiles = [...root.querySelectorAll(".stat")];
    const autarky = tiles.find((t) => t.textContent?.includes("Autarkie"))!;
    const exported = tiles.find((t) => t.textContent?.includes("Eingespeist"))!;
    expect(autarky.querySelector(".tap")).toBeNull();
    expect(exported.querySelector(".tap")).toBeTruthy();
  });

  it("does not make a figure clickable when its entity is missing", async () => {
    const config = baseConfig({ today: { stats: ["export"] } });
    delete config.entities.export_today;
    const { root } = await render(config, SCENARIOS[0]);
    expect(root.querySelector(".stat .tap")).toBeNull();
  });
});

describe("two needles", () => {
  it("lets each one watch a different boundary", async () => {
    // Evening: the battery carries the house and nothing crosses the meter.
    // Grid-only reads quiet, grid-and-battery reads a draw. Same picture would
    // mean the pair is pointless.
    const night = SCENARIOS.find((s) => s.name === "evening on battery")!;
    const { text } = await render(
      baseConfig({
        ring: {
          meter: true,
          meter_style: "blocks",
          meter_scope: "grid",
          meter_second: "blocks",
          meter_second_scope: "all"
        }
      }),
      night
    );
    expect(text).toContain("kein Netzaustausch");
    expect(text).toContain("Aus dem Speicher");
  });
});

describe("the second column draws itself", () => {
  it("uses its own style, not the first one’s", async () => {
    const foggy = SCENARIOS.find((s) => s.name === "foggy morning, three sources")!;
    const { root } = await render(
      baseConfig({
        ring: { meter: true, meter_style: "bar", meter_second: "blocks" }
      }),
      foggy
    );
    // The first is continuous, the second is stepped: both kinds must appear.
    expect(root.querySelectorAll(".meter-band").length).toBeGreaterThan(0);
    expect(root.querySelectorAll(".meter-off").length).toBeGreaterThan(0);
  });
});

describe("what a tap does", () => {
  const tap = async (config: PowerOriginCardConfig) => {
    const { root } = await render(config, SCENARIOS[0]);
    const events: CustomEvent[] = [];
    for (const name of ["hass-more-info", "ll-custom", "location-changed"]) {
      root.host.addEventListener(name, (event) => events.push(event as CustomEvent));
    }
    (root.querySelector(".ring-value") as SVGElement).dispatchEvent(
      new Event("click", { bubbles: true, composed: true })
    );
    return events;
  };

  it("opens the entity behind the figure by default", async () => {
    const events = await tap(baseConfig());
    expect(events.map((e) => e.type)).toEqual(["hass-more-info"]);
    expect(events[0].detail.entityId).toBe(IDS.house);
  });

  it("opens a different entity when one is named", async () => {
    const events = await tap(
      baseConfig({ tap_action: { action: "more-info", entity: IDS.battery_soc } })
    );
    expect(events[0].detail.entityId).toBe(IDS.battery_soc);
  });

  it("navigates when asked to", async () => {
    const events = await tap(
      baseConfig({ tap_action: { action: "navigate", navigation_path: "/lovelace/energy" } })
    );
    expect(events.map((e) => e.type)).toContain("location-changed");
  });

  it("does nothing at all when told to", async () => {
    const events = await tap(baseConfig({ tap_action: { action: "none" } }));
    expect(events).toEqual([]);
  });
});

describe("which end of the column is which", () => {
  it("marks both ends, and makes room for the marks", async () => {
    const { root } = await render(baseConfig({ ring: { meter: true } }), SCENARIOS[0]);
    expect(root.querySelectorAll(".meter-mark").length).toBe(2);
    // The band is added to the window, never taken out of the track. The width
    // must not move with it: the column is drawn to a fixed one, so a wider box
    // shrinks everything in it and the two columns stop matching.
    expect(root.querySelector("svg.meter")!.getAttribute("viewBox")).toBe("0 -18 88 236");
  });

  it("gives the height back when they are switched off", async () => {
    const { root } = await render(
      baseConfig({ ring: { meter: true, meter_marks: false } }),
      SCENARIOS[0]
    );
    expect(root.querySelector(".meter-mark")).toBeNull();
    expect(root.querySelector("svg.meter")!.getAttribute("viewBox")).toBe("0 0 88 200");
  });

  it("leaves the day strip alone, which has no up and down", async () => {
    const foggy = SCENARIOS.find((s) => s.name === "foggy morning, three sources")!;
    const { root } = await render(
      baseConfig({ ring: { meter: true, meter_style: "day" } }),
      foggy
    );
    expect(root.querySelector(".meter-mark")).toBeNull();
  });
});

describe("the battery block", () => {
  it("draws the reserve as power that does not come out", async () => {
    const { root } = await render(
      baseConfig({ battery_capacity: 13100, battery_reserve: 20 }),
      SCENARIOS[0]
    );
    // The blocks inside the reserve are filled but held back, not missing.
    expect(root.querySelectorAll(".bat-fill.held").length).toBeGreaterThan(0);
    expect(root.querySelectorAll(".bat-fill").length).toBeGreaterThan(
      root.querySelectorAll(".bat-fill.held").length
    );
  });

  it("holds nothing back when no reserve is set", async () => {
    const { root } = await render(baseConfig({ battery_capacity: 13100 }), SCENARIOS[0]);
    expect(root.querySelector(".bat-fill.held")).toBeNull();
  });

  it("keeps the full width until a second figure is asked for", async () => {
    const wide = await render(baseConfig({ battery_capacity: 13100 }), SCENARIOS[0]);
    const before = Number(wide.root.querySelector(".bat-shell")!.getAttribute("width"));

    const narrow = await render(
      baseConfig({ battery_capacity: 13100, battery: { extra: "given" } }),
      SCENARIOS[0]
    );
    const after = Number(narrow.root.querySelector(".bat-shell")!.getAttribute("width"));

    expect(after).toBeLessThan(before);
    expect(narrow.root.querySelector(".bat-extra")).toBeTruthy();
  });

  it("works the cycles out of what it already reads", async () => {
    const { text } = await render(
      baseConfig({ battery_capacity: 13100, battery: { extra: "cycles" } }),
      SCENARIOS[0]
    );
    // 4.1 kWh given out of 13.1 usable.
    expect(text).toContain("0,3");
    expect(text).toContain("Zyklen");
  });

  it("says nothing rather than a wrong figure without the price", async () => {
    const config = baseConfig({ battery_capacity: 13100, battery: { extra: "saved" } });
    delete config.entities.price_import;
    const { root } = await render(config, SCENARIOS[0]);
    expect(root.querySelector(".bat-extra")).toBeNull();

    // No figure on the right means the bar keeps that room.
    const withFigure = await render(
      baseConfig({ battery_capacity: 13100, battery: { extra: "given" } }),
      SCENARIOS[0]
    );
    expect(Number(root.querySelector(".bat-shell")!.getAttribute("width"))).toBeGreaterThan(
      Number(withFigure.root.querySelector(".bat-shell")!.getAttribute("width"))
    );
  });
});

describe("the three priced and relative columns", () => {
  it("prices the boundary rather than measuring it", async () => {
    const foggy = SCENARIOS.find((s) => s.name === "foggy morning, three sources")!;
    const { text } = await render(
      baseConfig({ ring: { meter: true, meter_style: "money" } }),
      foggy
    );
    // Drawing 1.9 kW at 29 cents, nothing exported: it is costing.
    expect(text).toContain("Kosten");
  });

  it("says nothing at all without a price to use", async () => {
    const config = baseConfig({ ring: { meter: true, meter_style: "money" } });
    delete config.entities.price_import;
    delete config.entities.price_export;
    const { root } = await render(config, SCENARIOS[0]);
    expect(root.querySelector(".meter-block")).toBeNull();
  });

  it("measures the house against its own day", async () => {
    const { root, text } = await render(
      baseConfig({ ring: { meter: true, meter_style: "load" } }),
      SCENARIOS[0]
    );
    expect(root.querySelector(".meter-block")).toBeTruthy();
    // The fixture holds the house steady, so now is an ordinary hour.
    expect(text).toContain("gewöhnliche Stunde");
  });

  it("fills from nothing to everything, with no middle", async () => {
    const { root, text } = await render(
      baseConfig({ ring: { meter: true, meter_style: "autarky" } }),
      SCENARIOS[0]
    );
    expect(root.querySelector(".meter-zero")).toBeNull();
    expect(text).toContain("Autarkie");
  });

  it("measures the roof against its own best today", async () => {
    const { root, text } = await render(
      baseConfig({ ring: { meter: true, meter_style: "roof" } }),
      SCENARIOS[0]
    );
    expect(root.querySelector(".meter-block")).toBeTruthy();
    expect(text).toContain("Dach jetzt");
  });

  it("can be told to leave the mark off", async () => {
    const shown = await render(
      baseConfig({ ring: { meter: true, meter_shows: "roof" } }),
      SCENARIOS[0]
    );
    expect(shown.root.querySelector(".meter-top")).toBeTruthy();

    const bare = await render(
      baseConfig({ ring: { meter: true, meter_shows: "roof", meter_top: false } }),
      SCENARIOS[0]
    );
    expect(bare.root.querySelector(".meter-top")).toBeNull();
    // The column itself is untouched: only the mark above it goes.
    expect(bare.root.querySelector(".meter-block")).toBeTruthy();
  });

  it("names the roof once, not in the column and the day heading both", async () => {
    const alone = await render(
      baseConfig({ ring: { meter: true, meter_shows: "grid" } }),
      SCENARIOS[0]
    );
    expect(alone.text).toContain("Dach jetzt");

    const inColumn = await render(
      baseConfig({ ring: { meter: true, meter_shows: "roof" } }),
      SCENARIOS[0]
    );
    expect(inColumn.text.match(/Dach jetzt/g)?.length).toBe(1);
  });

  it("draws no roof column without a roof sensor", async () => {
    const config = baseConfig({ ring: { meter: true, meter_style: "roof" } });
    delete config.entities.solar;
    const { root } = await render(config, SCENARIOS[0]);
    expect(root.querySelector(".meter-block")).toBeNull();
  });
});

describe("the charge appears once", () => {
  it("stands beside the bar when nothing else does", async () => {
    const { root } = await render(baseConfig({ battery_capacity: 13100 }), SCENARIOS[0]);
    expect(root.querySelector(".bat-pct")).toBeTruthy();
    expect(root.querySelector(".row-pct")).toBeNull();
  });

  it("moves to the heading when a second figure takes the right", async () => {
    const { root } = await render(
      baseConfig({ battery_capacity: 13100, battery: { extra: "given" } }),
      SCENARIOS[0]
    );
    expect(root.querySelector(".row-pct")).toBeTruthy();
    expect(root.querySelector(".bat-pct")).toBeNull();
  });

  it("does not appear twice when the second figure cannot be worked out", async () => {
    // The setting is on, the price is missing: the right stays free, so the
    // charge must stay there rather than also climbing into the heading.
    const config = baseConfig({ battery_capacity: 13100, battery: { extra: "saved" } });
    delete config.entities.price_import;
    const { root } = await render(config, SCENARIOS[0]);
    expect(root.querySelector(".row-pct")).toBeNull();
    expect(root.querySelector(".bat-pct")).toBeTruthy();
  });

  it("carries its currency", async () => {
    const { text } = await render(
      baseConfig({ battery_capacity: 13100, battery: { extra: "saved" } }),
      SCENARIOS[0]
    );
    // 4.1 kWh out at 29 cents.
    expect(text).toContain("1,19 €");
  });
});
