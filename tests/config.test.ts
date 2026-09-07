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
    expect(resolved.battery.segments).toBe(10);
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

  it("offers every top-level option", () => {
    const found = names();
    for (const key of Object.keys(DEFAULTS)) {
      expect(found, key).toContain(key);
    }
  });

  it("offers every option inside every group", () => {
    const found = names();
    for (const group of ["sections", "ring", "chart", "battery", "today"] as const) {
      for (const key of Object.keys((DEFAULTS as unknown as Record<string, Record<string, unknown>>)[group])) {
        expect(found, group + "." + key).toContain(key);
      }
    }
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
