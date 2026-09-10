// @vitest-environment jsdom
import { describe, expect, it, beforeAll } from "vitest";
import { CARD_TYPE, getConfigForm, resolveConfig } from "../src/config";
import { clearStatisticsCache } from "../src/stats";
import type { PowerOriginCardConfig } from "../src/types";
import { IDS, SCENARIOS, makeHass } from "./fixtures";
import type { Scenario } from "./fixtures";

/*
 * The card promises that no setting is shown which cannot take effect. This
 * turns the promise round and checks it from the other side: every setting the
 * editor offers, flipped, must change what the card draws in at least one
 * ordinary situation. A setting that changes nothing anywhere is either dead
 * or broken, and both are bugs.
 */

type Field = { path: string[]; selector: Record<string, unknown> };

const base = (): PowerOriginCardConfig => ({
  type: `custom:${CARD_TYPE}`,
  title: "Solar",
  entities: { ...IDS, price_export: "sensor.price_export" },
  battery: { capacity: 13100, reserve: 15 },
  ring: {
    columns: "two",
    meter_shows: "grid",
    meter_second_shows: "grid",
    meter_style: "blocks",
    meter_second_style: "blocks"
  },
  today: { money: true, origin_bar: true },
  devices: { list: ["sensor.desk_power", "sensor.nas_power", "sensor.fridge_power", "sensor.oven_power"] }
});

/* The other shape a card takes: a roof by day and the night by night on the
 * left, the battery on the right, the day as a clock outside. */
const baseNight = (): PowerOriginCardConfig => ({
  ...base(),
  ring: {
    columns: "two",
    meter_shows: "roof",
    meter_dark: "night",
    meter_second_shows: "battery",
    rings: "dayclock",
    night: "countdown"
  },
  battery: { capacity: 13100, reserve: 15, sunrise_mark: true, curve: true }
});

function fields(config: PowerOriginCardConfig): Field[] {
  const out: Field[] = [];
  const walk = (items: Array<Record<string, unknown>>, path: string[]) => {
    for (const item of items) {
      if (Array.isArray(item.schema)) {
        walk(
          item.schema as Array<Record<string, unknown>>,
          typeof item.name === "string" ? path.concat(item.name) : path
        );
      } else if (typeof item.name === "string") {
        out.push({ path: path.concat(item.name), selector: item.selector as Record<string, unknown> });
      }
    }
  };
  walk(getConfigForm("de", config).schema as Array<Record<string, unknown>>, []);
  return out;
}

const get = (obj: unknown, path: string[]): unknown =>
  path.reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), obj);

function withValue(config: PowerOriginCardConfig, path: string[], value: unknown): PowerOriginCardConfig {
  const copy = JSON.parse(JSON.stringify(config)) as Record<string, unknown>;
  let cursor = copy;
  for (const key of path.slice(0, -1)) {
    cursor[key] = { ...((cursor[key] as Record<string, unknown>) ?? {}) };
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[path[path.length - 1]] = value;
  return copy as unknown as PowerOriginCardConfig;
}

/** Every value worth trying for a field, given what it holds now. */
function alternatives(field: Field, current: unknown): unknown[] {
  const [kind] = Object.keys(field.selector);
  const spec = field.selector[kind] as Record<string, unknown>;
  switch (kind) {
    case "boolean":
      return [!(current ?? false), !!(current ?? false)].filter((v) => v !== current);
    case "select": {
      const options = (spec.options as Array<{ value: unknown }>).map((o) => o.value);
      if (spec.multiple) return [[options[0]], [options[1], options[2]]];
      return options.filter((v) => v !== current);
    }
    case "number": {
      const now = typeof current === "number" ? current : 0;
      const step = typeof spec.step === "number" ? spec.step : 1;
      const min = typeof spec.min === "number" ? spec.min : 0;
      const max = typeof spec.max === "number" ? spec.max : 100;
      return [...new Set([Math.min(max, now + step * 4), Math.max(min, now - step * 4), min, max])].filter(
        (v) => v !== now
      );
    }
    case "text":
      return [String(current ?? "") + " X", ""];
    default:
      return [];
  }
}

async function draw(config: PowerOriginCardConfig, scenario: Scenario): Promise<string> {
  clearStatisticsCache();
  const el = document.createElement(CARD_TYPE) as HTMLElement & {
    setConfig(c: PowerOriginCardConfig): void;
    hass: unknown;
    updateComplete: Promise<unknown>;
  };
  el.setConfig(config);
  document.body.append(el);
  el.hass = makeHass(scenario);
  await el.updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  el.hass = makeHass(scenario);
  await el.updateComplete;
  // Clip paths and gradients carry an id unique to the instance, so two
  // drawings of one configuration never match by text. The ids say nothing
  // about the drawing; the shapes they clip do.
  const html = [...(el.shadowRoot as ShadowRoot).children]
    .filter((c) => c.tagName !== "STYLE")
    .map((c) => c.outerHTML)
    .join("")
    .replace(/po-(fill|clip)-\d+/g, "po-$1-N")
    .replace(/ id="[^"]*"/g, " id=\"#\"")
    .replace(/url\(#[^)]*\)/g, "url(#)")
    .replace(/href="#[^"]*"/g, "href=\"#\"")
    // The now-line follows the clock, not a setting.
    .replace(/(<line class="nowline"[^>]*?)x1="[^"]*" x2="[^"]*"/g, '$1x1="N" x2="N"')
    // A coordinate with a dozen decimals comes from the clock, never from a
    // setting; the card rounds everything it draws on purpose.
    .replace(/="(-?\d+\.\d{4,})"/g, '="F"');
  el.remove();
  return html;
}

/** Settings that pick an entity or an action say nothing to a drawing. */
const NOT_A_DRAWING = new Set(["entity", "ui_action"]);

/**
 * Settings whose effect needs a history that moves. The fixtures hold every
 * reading steady, so a wider or narrower average lands on the same number;
 * battery.test.ts covers the averaging itself.
 */
const NEEDS_A_MOVING_HISTORY = new Set([
  "battery.runtime_window",
  // The switch waits two minutes of draw before it shows; columns.test.ts and
  // head.test.ts move the clock.
  "ring.import_switch",
  "chip_alarm",
  // The wide shape waits for room, which a test document never has;
  // layout.test.ts asks for it from zero pixels and from far too many.
  "shape"
]);

describe("every setting the editor offers changes something", () => {
  beforeAll(async () => {
    await import("../src/power-origin-card");
  });

  it("draws the same thing twice, or the comparison below means nothing", async () => {
    const one = (await draw(base(), SCENARIOS[0])).split(/(?=[<\s])/);
    const two = (await draw(base(), SCENARIOS[0])).split(/(?=[<\s])/);
    const differing: string[] = [];
    for (let i = 0; i < Math.max(one.length, two.length) && differing.length < 12; i++) {
      if (one[i] !== two[i]) differing.push((one[i] ?? "-").trim() + "  !=  " + (two[i] ?? "-").trim());
    }
    expect(differing, "tokens that change between two identical renders:\n" + differing.join("\n")).toEqual([]);
  });

  for (const [name, make] of [
    ["the usual card", base],
    ["a card with roof, night and battery columns", baseNight]
  ] as const)
  it(`in at least one ordinary situation, on ${name}`, async () => {
    const config = make();
    const tried = SCENARIOS.filter((s) =>
      [
        "sunny afternoon",
        "evening on battery",
        "foggy morning, three sources",
        "charging",
        // Ten watts spare: the one moment a small worth-starting threshold bites.
        "covered, ten watts spare"
      ].includes(s.name)
    );
    const baselines = new Map<string, string>();
    for (const s of tried) baselines.set(s.name, await draw(config, s));

    const dead: string[] = [];
    const resolved = resolveConfig(config) as unknown as Record<string, unknown>;
    for (const field of fields(config)) {
      const [kind] = Object.keys(field.selector);
      if (NOT_A_DRAWING.has(kind)) continue;
      if (NEEDS_A_MOVING_HISTORY.has(field.path.join("."))) continue;
      // What the card actually uses, so a default written out again is not
      // mistaken for a change. The two invert switches resolve at the top.
      const current =
        get(config, field.path) ??
        get(resolved, field.path) ??
        get(resolved, field.path.slice(-1));
      // A number is judged as a field: one value that lands between two readings
      // proves nothing, and a limit above the count has nothing to cut.
      // A list picked in order is judged as a field too: its first
      // alternative may well be the order the card already has.
      const perValue = kind !== "number" && !(field.selector[kind] as Record<string, unknown>)?.multiple;
      let anyChanged = false;
      // A night subject equal to the day subject draws the same column twice;
      // that is the value being the same, not the setting being dead.
      const path = field.path.join(".");
      const daySubject =
        path === "ring.meter_dark"
          ? (resolved.ring as Record<string, unknown>).meter_shows
          : path === "ring.meter_second_dark"
            ? (resolved.ring as Record<string, unknown>).meter_second_shows
            : undefined;
      for (const value of alternatives(field, current).filter((v) => v !== daySubject)) {
        let changed = false;
        for (const s of tried) {
          if ((await draw(withValue(config, field.path, value), s)) !== baselines.get(s.name)) {
            changed = true;
            break;
          }
        }
        anyChanged ||= changed;
        if (!changed && perValue) dead.push(field.path.join(".") + " = " + JSON.stringify(value));
      }
      if (!perValue && !anyChanged) dead.push(field.path.join("."));
    }
    expect(dead, "settings that draw nothing different:\n" + dead.join("\n")).toEqual([]);
  }, 120000);
});
