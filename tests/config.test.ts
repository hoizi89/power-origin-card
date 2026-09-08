import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULTS, assertConfig, getConfigForm, resolveConfig, stubConfig } from "../src/config";
import { TRANSLATIONS, localize } from "../src/localize";

const base = { type: "custom:power-origin-card", entities: { house: "sensor.house" } };

describe("assertConfig", () => {
  it("insists on the house sensor", () => {
    expect(() => assertConfig({ type: "x", entities: { house: "" } })).toThrow();
    expect(() => assertConfig(base)).not.toThrow();
  });

  it("complains in the user's language", () => {
    expect(() => assertConfig(undefined, "de")).toThrow(/Hausverbrauch/);
  });
});

describe("resolveConfig", () => {
  it("fills in every default", () => {
    const resolved = resolveConfig(base);
    expect(resolved.sections).toEqual(DEFAULTS.sections);
    expect(resolved.battery.segments).toBe(0);
    expect(resolved.battery.runtime_window).toBe(30);
    expect(resolved.today.stats).toEqual(DEFAULTS.today.stats);
  });

  it("keeps a section switched off", () => {
    const resolved = resolveConfig({ ...base, sections: { chart: false } });
    expect(resolved.sections.chart).toBe(false);
    expect(resolved.sections.ring).toBe(true);
  });

  it("falls back to the default stats when the list is emptied", () => {
    expect(resolveConfig({ ...base, today: { stats: [] } }).today.stats).toEqual(
      DEFAULTS.today.stats
    );
  });
});

describe("stubConfig", () => {
  it("guesses the obvious sensors", () => {
    const config = stubConfig([
      "sensor.house_consumption",
      "sensor.pv_power",
      "sensor.battery_power",
      "sensor.battery_state_of_charge"
    ]);
    expect(config.entities.house).toBe("sensor.house_consumption");
    expect(config.entities.solar).toBe("sensor.pv_power");
    expect(config.entities.battery_power).toBe("sensor.battery_power");
    expect(config.entities.battery_soc).toBe("sensor.battery_state_of_charge");
  });
});

describe("getConfigForm", () => {
  it("labels every named field it renders", () => {
    const form = getConfigForm("de");
    const names: string[] = [];
    const walk = (items: Array<Record<string, unknown>>) => {
      for (const item of items) {
        if (Array.isArray(item.schema)) walk(item.schema as Array<Record<string, unknown>>);
        else if (typeof item.name === "string") names.push(item.name);
      }
    };
    walk(form.schema as Array<Record<string, unknown>>);

    expect(names).toContain("house");
    expect(names).toContain("runtime_window");
    for (const name of names) {
      expect(form.computeLabel({ name }), `label for ${name}`).not.toBe(name);
    }
  });
});

describe("localize", () => {
  it("keeps both tables in step", () => {
    expect(Object.keys(TRANSLATIONS.de).sort()).toEqual(Object.keys(TRANSLATIONS.en).sort());
  });

  it("falls back to English for an unknown language", () => {
    expect(localize("battery.title", "fr")).toBe("Battery");
    expect(localize("battery.title", "de-AT")).toBe("Speicher");
  });
});

describe("editor coverage", () => {
  const names = (): string[] => {
    const found: string[] = [];
    const walk = (items: Array<Record<string, unknown>>) => {
      for (const item of items) {
        if (Array.isArray(item.schema)) {
          if (typeof item.name === "string") found.push(item.name);
          walk(item.schema as Array<Record<string, unknown>>);
        } else if (typeof item.name === "string") {
          found.push(item.name);
        }
      }
    };
    walk(getConfigForm("de").schema as Array<Record<string, unknown>>);
    return found;
  };

  /**
   * Storage rather than a control. The column count writes meter; meter_second
   * is written from what the right column shows and how it is drawn, which are
   * the two fields the editor does offer. The last two moved into the battery
   * group as battery.capacity and battery.reserve, and stay at the top level
   * only so an older card reads.
   */
  const DERIVED = new Set([
    "meter",
    "meter_second",
    "battery_capacity",
    "battery_reserve"
  ]);

  it("offers every top-level option", () => {
    const found = names();
    for (const key of Object.keys(DEFAULTS)) {
      if (DERIVED.has(key)) continue;
      expect(found, key).toContain(key);
    }
  });

  /**
   * Storage rather than a control: the editor offers the column count, and
   * writes these two from it. Both stay so a card configured before the count
   * existed still reads.
   */
  it("offers every option inside every group", () => {
    const found = names();
    for (const group of ["sections", "ring", "chart", "battery", "today"] as const) {
      for (const key of Object.keys((DEFAULTS as unknown as Record<string, Record<string, unknown>>)[group])) {
        if (DERIVED.has(key)) continue;
        expect(found, group + "." + key).toContain(key);
      }
    }
  });

  it("reads a column type written before the subject and the drawing split", () => {
    // A subject that never had a drawing to choose.
    const priced = resolveConfig({
      type: "custom:power-origin-card",
      entities: { house: "sensor.h" },
      ring: { meter_style: "money" }
    });
    expect(priced.ring.meter_shows).toBe("money");
    expect(priced.ring.meter_style).toBe("money");

    // A drawing of the grid exchange, which is what the old list mixed it with.
    const smooth = resolveConfig({
      type: "custom:power-origin-card",
      entities: { house: "sensor.h" },
      ring: { meter_style: "bar" }
    });
    expect(smooth.ring.meter_shows).toBe("grid");
    expect(smooth.ring.meter_style).toBe("bar");
  });

  it("puts the subject and the drawing back together for the card", () => {
    const roof = resolveConfig({
      type: "custom:power-origin-card",
      entities: { house: "sensor.h" },
      ring: { meter_shows: "roof" }
    });
    expect(roof.ring.meter_style).toBe("roof");

    const smooth = resolveConfig({
      type: "custom:power-origin-card",
      entities: { house: "sensor.h" },
      ring: { meter_shows: "grid", meter_style: "bar" }
    });
    expect(smooth.ring.meter_style).toBe("bar");

    const second = resolveConfig({
      type: "custom:power-origin-card",
      entities: { house: "sensor.h" },
      ring: { columns: "two", meter_second_shows: "grid", meter_second_style: "bar" }
    });
    expect(second.ring.meter_second).toBe("bar");
  });

  it("offers a drawing only for the one subject that has a choice", () => {
    const grid = getConfigForm("de", {
      type: "custom:power-origin-card",
      entities: { house: "sensor.h" },
      ring: { meter_shows: "grid" }
    });
    expect(JSON.stringify(grid.schema)).toContain("meter_style");

    const priced = getConfigForm("de", {
      type: "custom:power-origin-card",
      entities: { house: "sensor.h" },
      ring: { meter_shows: "money" }
    });
    expect(JSON.stringify(priced.schema)).not.toContain("meter_style");
  });

  it("gives each column the settings that shape it, and only those", () => {
    const form = (ring: Record<string, unknown>) =>
      JSON.stringify(
        getConfigForm("de", {
          type: "custom:power-origin-card",
          entities: { house: "sensor.h" },
          ring
        }).schema
      );

    // The needle is on the right, so the right settings appear and the left
    // ones, which would shape a roof column, do not.
    const right = form({ columns: "two", meter_shows: "roof", meter_second_shows: "grid" });
    expect(right).toContain("meter_second_marks");
    expect(right).toContain("meter_second_steps");
    expect(right).not.toContain("\"meter_marks\"");
    expect(right).not.toContain("\"meter_steps\"");

    // And the other way round.
    const left = form({ columns: "two", meter_shows: "grid", meter_second_shows: "roof" });
    expect(left).toContain("\"meter_marks\"");
    expect(left).not.toContain("meter_second_marks");

    // Neither column is a needle, so none of them can do anything.
    const none = form({ columns: "two", meter_shows: "roof", meter_second_shows: "autarky" });
    expect(none).not.toContain("meter_marks");
    expect(none).not.toContain("meter_steps");
  });

  it("says what each switch and box does", () => {
    const form = getConfigForm("de");
    for (const name of ["meter_marks", "meter_today", "meter_scale", "meter_scale_draw"]) {
      expect(form.computeHelper({ name }), name).toBeTruthy();
    }
  });

  it("gives each column a section of its own, and one when there is one", () => {
    const titles = (ring: Record<string, unknown>) => {
      const found: string[] = [];
      const walk = (items: Array<Record<string, unknown>>) => {
        for (const item of items) {
          if (item.type === "expandable" && typeof item.title === "string") {
            found.push(item.title);
          }
          if (Array.isArray(item.schema)) walk(item.schema as Array<Record<string, unknown>>);
        }
      };
      walk(
        getConfigForm("de", {
          type: "custom:power-origin-card",
          entities: { house: "sensor.h" },
          ring
        }).schema as Array<Record<string, unknown>>
      );
      return found;
    };

    const two = titles({ columns: "two", meter_shows: "grid", meter_second_shows: "grid" });
    expect(two).toContain("Die linke Säule");
    expect(two).toContain("Die rechte Säule");

    // One column has no side to distinguish, so it needs no section.
    const one = titles({ columns: "one", meter_shows: "grid" });
    expect(one).not.toContain("Die linke Säule");
  });

  it("asks the same question the same way on both sides", () => {
    const form = getConfigForm("de", {
      type: "custom:power-origin-card",
      entities: { house: "sensor.h" },
      ring: { columns: "two", meter_shows: "grid", meter_second_shows: "grid" }
    });
    for (const [left, right] of [
      ["meter_shows", "meter_second_shows"],
      ["meter_style", "meter_second_style"],
      ["meter_scope", "meter_second_scope"],
      ["meter_scale", "meter_second_scale"],
      ["meter_steps", "meter_second_steps"]
    ]) {
      expect(form.computeLabel({ name: right }), right).toBe(form.computeLabel({ name: left }));
      expect(form.computeHelper({ name: right }), right).toBe(form.computeHelper({ name: left }));
    }
  });

  it("keeps a card written before the column count worked", () => {
    const off = resolveConfig({
      type: "custom:power-origin-card",
      entities: { house: "sensor.h" },
      ring: { meter: false }
    });
    expect(off.ring.columns).toBe("none");

    const two = resolveConfig({
      type: "custom:power-origin-card",
      entities: { house: "sensor.h" },
      ring: { meter_second: "day" }
    });
    expect(two.ring.columns).toBe("two");
    expect(two.ring.meter).toBe(true);

    const chosen = resolveConfig({
      type: "custom:power-origin-card",
      entities: { house: "sensor.h" },
      ring: { columns: "two" }
    });
    // Asking for two without saying what the second one is gets the day.
    expect(chosen.ring.meter_second).toBe("day");

    const none = resolveConfig({
      type: "custom:power-origin-card",
      entities: { house: "sensor.h" },
      ring: { columns: "none", meter_second: "day" }
    });
    expect(none.ring.meter).toBe(false);
    expect(none.ring.meter_second).toBe("none");
  });

  it("offers every entity the card reads", () => {
    const found = names();
    const source = readFileSync(new URL("../src/power-origin-card.ts", import.meta.url), "utf8");
    const used = [...source.matchAll(/config\.entities\.([a-z_]+)/g)].map((match) => match[1]);
    for (const key of new Set(used)) {
      expect(found, "entities." + key).toContain(key);
    }
  });

  it("accepts its own stub configuration", () => {
    const stub = stubConfig(["sensor.house_consumption", "sensor.pv_power"]);
    expect(() => assertConfig(stub)).not.toThrow();
    expect(() => resolveConfig(stub)).not.toThrow();
  });
});

describe("what the card starts with", () => {
  // Taken from a real installation: eight strings, German sensor names, and a
  // net grid reading buried among one-way ones.
  const REAL = [
    "sensor.house_consumption",
    "sensor.pv1_power",
    "sensor.pv2_power",
    "sensor.pv_power",
    "sensor.battery_power",
    "sensor.battery_state_of_charge",
    "sensor.netz_bezug_power",
    "sensor.netz_einspeisung",
    "sensor.energy_grid_net_power"
  ];

  it("prefers the whole array over one of its strings", () => {
    const stub = stubConfig(REAL);
    expect(stub.entities.solar).toBe("sensor.pv_power");
  });

  it("finds the grid, and the reading that carries a direction", () => {
    const stub = stubConfig(REAL);
    expect(stub.entities.grid_power).toBe("sensor.energy_grid_net_power");
  });

  it("understands German sensor names too", () => {
    const stub = stubConfig([
      "sensor.hausverbrauch",
      "sensor.speicher_leistung",
      "sensor.ladestand",
      "sensor.netz_power"
    ]);
    expect(stub.entities.house).toBe("sensor.hausverbrauch");
    expect(stub.entities.battery_power).toBe("sensor.speicher_leistung");
    expect(stub.entities.battery_soc).toBe("sensor.ladestand");
    expect(stub.entities.grid_power).toBe("sensor.netz_power");
  });

  it("takes a single string when that is all there is", () => {
    const stub = stubConfig(["sensor.house_consumption", "sensor.pv1_power"]);
    expect(stub.entities.solar).toBe("sensor.pv1_power");
  });
});

describe("where the capacity lives", () => {
  it("reads a card that still has it at the top level", () => {
    const resolved = resolveConfig({
      type: "custom:power-origin-card",
      entities: { house: "sensor.h" },
      battery_capacity: 9000,
      battery_reserve: 12
    });
    expect(resolved.battery_capacity).toBe(9000);
    expect(resolved.battery.capacity).toBe(9000);
    expect(resolved.battery.reserve).toBe(12);
  });

  it("prefers the battery group when both are written", () => {
    const resolved = resolveConfig({
      type: "custom:power-origin-card",
      entities: { house: "sensor.h" },
      battery_capacity: 9000,
      battery: { capacity: 13100 }
    });
    expect(resolved.battery_capacity).toBe(13100);
  });
});
