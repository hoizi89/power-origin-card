import { localize } from "./localize";
import type {
  LegacyRingOptions,
  PowerOriginCardConfig,
  ResolvedConfig,
  TodayStat
} from "./types";

export const CARD_TYPE = "power-origin-card";

export const DEFAULTS = {
  text_scale: 1,
  battery_capacity: 0,
  battery_reserve: 0,
  battery_invert: false,
  grid_invert: false,
  sections: { ring: true, chart: true, battery: true, today: true },
  ring: {
    center: "power" as const,
    center_dark: "power" as const,
    layout: "auto" as const,
    caption: true,
    facts: "bars" as const,
    meter: true,
    meter_scale: 0,
    meter_scale_draw: 0,
    meter_target: 0,
    meter_steps: 6
  },
  chart: { style: "area" as const, consumption: true, show_forecast: true, height: 84 },
  battery: {
    style: "segments" as const,
    segments: 0,
    runtime: true,
    runtime_window: 30
  },
  today: {
    money: true,
    origin_bar: false,
    breakdown: false,
    stats: ["peak", "autarky", "export", "import"] as TodayStat[]
  }
};

export function assertConfig(config: PowerOriginCardConfig | undefined, locale?: string): void {
  if (!config?.entities?.house) {
    throw new Error(localize("error.no_house", locale));
  }
}

export function resolveConfig(config: PowerOriginCardConfig): ResolvedConfig {
  return {
    type: config.type,
    title: config.title,
    entities: { ...config.entities },
    text_scale: config.text_scale ?? DEFAULTS.text_scale,
    battery_capacity: config.battery_capacity ?? DEFAULTS.battery_capacity,
    battery_reserve: config.battery_reserve ?? DEFAULTS.battery_reserve,
    battery_invert: config.battery_invert ?? DEFAULTS.battery_invert,
    grid_invert: config.grid_invert ?? DEFAULTS.grid_invert,
    sections: { ...DEFAULTS.sections, ...config.sections },
    ring: {
      ...DEFAULTS.ring,
      ...config.ring,
      // A labelled column already names the grid flow and the battery block
      // names the battery, so the list would repeat both. It stays one switch away.
      facts:
        config.ring?.facts ??
        ((config.ring as LegacyRingOptions | undefined)?.legend === false
          ? "none"
          : (config.ring?.meter ?? DEFAULTS.ring.meter)
            ? "none"
            : (config.sections?.ring ?? DEFAULTS.sections.ring)
              ? "plain"
              : DEFAULTS.ring.facts)
    },
    chart: { ...DEFAULTS.chart, ...config.chart },
    battery: { ...DEFAULTS.battery, ...config.battery },
    today: {
      money: config.today?.money ?? DEFAULTS.today.money,
      origin_bar: config.today?.origin_bar ?? DEFAULTS.today.origin_bar,
      breakdown: config.today?.breakdown ?? DEFAULTS.today.breakdown,
      stats: config.today?.stats?.length ? config.today.stats : DEFAULTS.today.stats
    }
  };
}

/** Guesses entities by name so the card is useful the moment it is added. */
export function stubConfig(entityIds: string[]): PowerOriginCardConfig {
  const find = (...needles: string[]) =>
    entityIds.find((id) => needles.every((needle) => id.includes(needle)));

  return {
    type: `custom:${CARD_TYPE}`,
    entities: {
      house: find("house", "consumption") ?? find("load") ?? entityIds[0] ?? "",
      solar: find("pv", "power") ?? find("solar", "power"),
      battery_power: find("battery", "power"),
      battery_soc: find("battery", "state_of_charge") ?? find("battery", "soc")
    }
  };
}

const STAT_OPTIONS: TodayStat[] = [
  "peak",
  "autarky",
  "export",
  "import",
  "solar",
  "house",
  "forecast",
  "amortisation"
];

const entityField = (name: string, deviceClass?: string) => ({
  name,
  selector: {
    entity: deviceClass
      ? { filter: [{ domain: "sensor", device_class: [deviceClass] }] }
      : { domain: "sensor" }
  }
});

export function getConfigForm(locale?: string, current?: PowerOriginCardConfig) {
  const t = (key: string) => localize(key, locale);
  const config = current ? resolveConfig(current) : undefined;

  // A switch that cannot take effect is worse than a missing one: it invites a
  // change and then does nothing. Anything the current setup cannot act on is
  // left out rather than shown dead.
  const on = (able: (resolved: ResolvedConfig) => boolean) => !config || able(config);
  const only = <T>(able: (resolved: ResolvedConfig) => boolean, ...items: T[]): T[] =>
    on(able) ? items : [];

  const schema = [
    {
      type: "grid",
      schema: [
        { name: "title", selector: { text: {} } },
        {
          name: "text_scale",
          selector: { number: { min: 0.8, max: 2, step: 0.05, mode: "box" } }
        }
      ]
    },
    {
      type: "expandable",
      name: "entities",
      title: t("editor.entities"),
      icon: "mdi:database",
      schema: [
        entityField("house", "power"),
        {
          type: "grid",
          schema: [entityField("solar", "power"), entityField("battery_power", "power")]
        },
        {
          type: "grid",
          schema: [entityField("battery_soc", "battery"), entityField("grid_power", "power")]
        },
        {
          type: "grid",
          schema: [entityField("solar_today", "energy"), entityField("house_today", "energy")]
        },
        {
          type: "grid",
          schema: [entityField("export_today", "energy"), entityField("import_today", "energy")]
        },
        entityField("forecast", "energy"),
        entityField("cost_today", "monetary"),
        {
          type: "grid",
          schema: [
            entityField("cost_export_today", "monetary"),
            entityField("cost_import_today", "monetary")
          ]
        },
        { type: "grid", schema: [entityField("price_import"), entityField("price_export")] },
        entityField("battery_out_today", "energy"),
        entityField("amortisation")
      ]
    },
    {
      type: "expandable",
      name: "sections",
      title: t("editor.sections"),
      icon: "mdi:view-dashboard-outline",
      schema: [
        {
          type: "grid",
          schema: [
            { name: "ring", selector: { boolean: {} } },
            { name: "chart", selector: { boolean: {} } },
            { name: "battery", selector: { boolean: {} } },
            { name: "today", selector: { boolean: {} } }
          ]
        }
      ]
    },
    ...only(
      (resolved) => resolved.sections.ring,
      {
      type: "expandable",
      name: "ring",
      title: t("editor.ring_settings"),
      icon: "mdi:circle-slice-8",
      schema: [
        {
          name: "center",
          selector: {
            select: {
              mode: "dropdown",
              options: [
                { value: "power", label: t("editor.center_power") },
                { value: "production", label: t("editor.center_production") },
                { value: "surplus", label: t("editor.center_surplus") },
                { value: "autarky", label: t("editor.center_autarky") }
              ]
            }
          }
        },
        // Only the production views need a stand-in for the night.
        ...only(
          (resolved) =>
            resolved.ring.center === "production" || resolved.ring.center === "surplus",
          {
            name: "center_dark",
            selector: {
              select: {
                mode: "dropdown",
                options: [
                  { value: "power", label: t("editor.center_power") },
                  { value: "autarky", label: t("editor.center_autarky") }
                ]
              }
            }
          }
        ),
        ...only((resolved) => resolved.ring.facts !== "none", {
          name: "layout",
          selector: {
            select: {
              mode: "dropdown",
              options: [
                { value: "auto", label: t("editor.layout_auto") },
                { value: "beside", label: t("editor.layout_beside") },
                { value: "below", label: t("editor.layout_below") }
              ]
            }
          }
        }),
        { name: "caption", selector: { boolean: {} } },
        {
          name: "facts",
          selector: {
            select: {
              mode: "dropdown",
              options: [
                { value: "bars", label: t("editor.facts_bars") },
                { value: "plain", label: t("editor.facts_plain") },
                { value: "inline", label: t("editor.facts_inline") },
                { value: "none", label: t("editor.facts_none") }
              ]
            }
          }
        },
        { name: "meter", selector: { boolean: {} } },
        ...only((resolved) => resolved.ring.meter, {
          type: "grid",
          schema: [
            {
              name: "meter_scale",
              selector: { number: { min: 0, max: 50, step: 0.5, mode: "box" } }
            },
            {
              name: "meter_scale_draw",
              selector: { number: { min: 0, max: 50, step: 0.5, mode: "box" } }
            },
            {
              name: "meter_target",
              selector: { number: { min: 0, max: 50, step: 0.1, mode: "box" } }
            },
            { name: "meter_steps", selector: { number: { min: 3, max: 14, mode: "box" } } }
          ]
        })
      ]
    }
    ),
    ...only(
      (resolved) => resolved.sections.chart,
      {
      type: "expandable",
      name: "chart",
      title: t("editor.chart_settings"),
      icon: "mdi:chart-areaspline",
      schema: [
        {
          name: "style",
          selector: {
            select: {
              mode: "dropdown",
              options: [
                { value: "area", label: t("editor.chart_area") },
                { value: "bars", label: t("editor.chart_bars") }
              ]
            }
          }
        },
        {
          type: "grid",
          schema: [
            { name: "consumption", selector: { boolean: {} } },
            { name: "show_forecast", selector: { boolean: {} } }
          ]
        },
        {
          name: "height",
          selector: { number: { min: 50, max: 200, step: 5, mode: "slider" } }
        }
      ]
    }
    ),
    ...only(
      (resolved) => resolved.sections.battery,
      {
      type: "expandable",
      name: "battery",
      title: t("editor.battery_settings"),
      icon: "mdi:battery-70",
      schema: [
        {
          name: "style",
          selector: {
            select: {
              mode: "dropdown",
              options: [
                { value: "segments", label: t("editor.style_segments") },
                { value: "solid", label: t("editor.style_solid") },
                { value: "bar", label: t("editor.style_bar") }
              ]
            }
          }
        },
        {
          type: "grid",
          schema: [
            ...only((resolved) => resolved.battery.style !== "solid", {
              name: "segments",
              selector: { number: { min: 0, max: 20, mode: "box" } }
            }),
            { name: "runtime", selector: { boolean: {} } }
          ]
        },
        ...only((resolved) => resolved.battery.runtime, {
          name: "runtime_window",
          selector: { number: { min: 5, max: 120, step: 5, unit_of_measurement: "min" } }
        })
      ]
    }
    ),
    ...only(
      (resolved) => resolved.sections.today,
      {
      type: "expandable",
      name: "today",
      title: t("editor.today_settings"),
      icon: "mdi:calendar-today",
      schema: [
        {
          type: "grid",
          schema: [
            { name: "money", selector: { boolean: {} } },
            { name: "origin_bar", selector: { boolean: {} } },
            { name: "breakdown", selector: { boolean: {} } }
          ]
        },
        {
          name: "stats",
          selector: {
            select: {
              multiple: true,
              options: STAT_OPTIONS.map((value) => ({ value, label: t(`stat.${value}`) }))
            }
          }
        }
      ]
    }
    ),
    {
      type: "grid",
      schema: [
        {
          name: "battery_capacity",
          selector: { number: { min: 0, max: 200000, step: 100, mode: "box" } }
        },
        { name: "battery_reserve", selector: { number: { min: 0, max: 50, mode: "box" } } }
      ]
    },
    {
      type: "grid",
      schema: [
        { name: "battery_invert", selector: { boolean: {} } },
        { name: "grid_invert", selector: { boolean: {} } }
      ]
    }
  ];

  const labels: Record<string, string> = {
    title: t("editor.title"),
    text_scale: t("editor.text_scale"),
    entities: t("editor.entities"),
    house: t("editor.house"),
    solar: t("editor.solar"),
    battery_power: t("editor.battery"),
    battery_soc: t("editor.battery_soc"),
    grid_power: t("editor.grid"),
    solar_today: t("editor.solar_today"),
    house_today: t("editor.house_today"),
    export_today: t("editor.export_today"),
    import_today: t("editor.import_today"),
    forecast: t("editor.forecast"),
    cost_today: t("editor.cost_today"),
    cost_export_today: t("editor.cost_export_today"),
    cost_import_today: t("editor.cost_import_today"),
    price_import: t("editor.price_import"),
    price_export: t("editor.price_export"),
    sections: t("editor.sections"),
    ring: t("editor.section_ring"),
    chart: t("editor.section_chart"),
    battery: t("editor.section_battery"),
    today: t("editor.section_today"),
    center: t("editor.center"),
    center_dark: t("editor.center_dark"),
    facts: t("editor.facts"),
    layout: t("editor.layout"),
    caption: t("editor.caption"),
    meter: t("editor.meter"),
    meter_scale: t("editor.meter_scale"),
    meter_scale_draw: t("editor.meter_scale_draw"),
    meter_target: t("editor.meter_target"),
    meter_steps: t("editor.meter_steps"),
    consumption: t("editor.consumption"),
    show_forecast: t("editor.show_forecast"),
    height: t("editor.chart_height"),
    style: t("editor.style"),
    segments: t("editor.segments"),
    runtime: t("editor.runtime"),
    runtime_window: t("editor.runtime_window"),
    money: t("editor.money"),
    breakdown: t("editor.breakdown"),
    origin_bar: t("editor.origin_bar"),
    battery_out_today: t("editor.battery_out_today"),
    amortisation: t("editor.amortisation"),
    stats: t("editor.stats"),
    battery_capacity: t("editor.capacity"),
    battery_reserve: t("editor.reserve"),
    battery_invert: t("editor.battery_invert"),
    grid_invert: t("editor.grid_invert")
  };

  const helpers: Record<string, string> = {
    title: t("editor.help_title"),
    text_scale: t("editor.help_text_scale"),
    caption: t("editor.help_caption"),
    center: t("editor.help_center"),
    center_dark: t("editor.help_center_dark"),
    meter: t("editor.help_meter"),
    meter_scale: t("editor.help_meter_scale"),
    meter_scale_draw: t("editor.help_meter_scale_draw"),
    meter_target: t("editor.help_meter_target"),
    house: t("editor.help_house"),
    battery_capacity: t("editor.help_capacity"),
    segments: t("editor.help_segments"),
    origin_bar: t("editor.help_origin_bar"),
    runtime_window: t("editor.help_runtime")
  };

  return {
    schema,
    assertConfig: (config: PowerOriginCardConfig | undefined) => assertConfig(config, locale),
    computeLabel: (item: { name?: string; title?: string }) =>
      (item.name && labels[item.name]) ?? item.title ?? item.name ?? "",
    computeHelper: (item: { name?: string }) => (item.name ? helpers[item.name] : undefined)
  };
}
