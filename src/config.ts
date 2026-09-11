import { localize } from "./localize";
import { idsOf } from "./values";
import type {
  BlockName,
  LegacyRingOptions,
  MeterDrawn,
  MeterShows,
  MeterStyle,
  PowerOriginCardConfig,
  ResolvedConfig,
  TodayStat
} from "./types";

export const CARD_TYPE = "power-origin-card";

export const DEFAULTS = {
  text_scale: 1,
  night_dim: 0,
  chip: "always" as const,
  chip_shows: "state" as const,
  chip_alarm: false,
  head_price: false,
  head_sunbar: false,
  shape: "standard" as const,
  wide_from: 640,
  night_layout: "same" as const,
  palette: "standard" as const,
  font: "mono" as const,
  tap_action: { action: "more-info" as const },
  battery_capacity: 0,
  battery_reserve: 0,
  battery_invert: false,
  grid_invert: false,
  sections: { ring: true, chart: true, battery: true, today: true,
    devices: true, week: false,
    order: [] as BlockName[] },
  ring: {
    center: "power" as const,
    center_dark: "power" as const,
    layout: "auto" as const,
    caption: true,
    facts: "bars" as const,
    meter: true,
    columns: "one" as const,
    meter_scale: 0,
    meter_scale_draw: 0,
    meter_target: 0,
    meter_steps: 6,
    meter_shows: "grid" as const,
    meter_style: "blocks" as const,
    meter_today: false,
    meter_marks: true,
    meter_top: true,
    meter_second_top: true,
    meter_second_scale: 0,
    meter_second_scale_draw: 0,
    meter_second_target: 0,
    meter_second_steps: 6,
    meter_second_marks: true,
    meter_second_today: false,
    meter_dark: "same" as const,
    meter_second_dark: "same" as const,
    meter_second_shows: "day" as const,
    meter_second_style: "blocks" as const,
    meter_second: "none" as const,
    meter_second_scope: "all" as const,
    meter_scope: "grid" as const,
    size: "auto" as const,
    rings: "single" as const,
    inner: "icon" as const,
    clock_marks: true,
    import_red: false,
    import_switch: false,
    autarky_colours: false,
    night: "same" as const,
    tap: "entity" as const
  },
  chart: {
    style: "area" as const,
    consumption: true,
    show_forecast: true,
    compare: false,
    height: 84,
    forecast_bars: false,
    layers: false,
    best_day: false
  },
  battery: {
    style: "segments" as const,
    segments: 0,
    runtime: true,
    runtime_window: 30,
    reserve_line: true,
    percent: true,
    capacity: 0,
    reserve: 0,
    extra: "none" as const,
    sunrise_mark: false,
    curve: false,
    animate: false,
    full_from: "rate" as const
  },
  devices: {
    source: "energy" as const,
    list: [] as string[],
    names: {} as Record<string, string>,
    mode: "now" as const,
    window: 15,
    energy: {} as Record<string, string>,
    style: "rows" as const,
    values: true,
    head: true,
    colours: false,
    group: "device" as const,
    limit: 5,
    threshold: 25,
    top: false,
    spark: false
  },
  today: {
    money: true,
    origin_bar: false,
    origin_style: "bar" as const,
    breakdown: false,
    amortisation: false,
    stats: ["peak", "autarky", "export", "import"] as TodayStat[],
    month: false,
    split: false,
    payoff_year: false,
    investment: 0
  }
};

/** Every block the card can stand, in the order it stands them unasked. */
export const BLOCKS: BlockName[] = ["ring", "chart", "week", "battery", "today", "devices"];

/** The blocks top to bottom: the ones named first, in that order, then the rest as usual. */
export function blockOrder(resolved: ResolvedConfig): BlockName[] {
  const chosen = resolved.sections.order;
  return [...chosen, ...BLOCKS.filter((block) => !chosen.includes(block))];
}

export function assertConfig(config: PowerOriginCardConfig | undefined, locale?: string): void {
  if (!config?.entities?.house) {
    throw new Error(localize("error.no_house", locale));
  }
}

/**
 * The count and the two types, kept consistent whichever of them was written.
 * `columns` is the field the editor offers; `meter` and `meter_second` remain
 * the storage, so a card configured before the count existed still reads.
 */
const isDrawn = (value: unknown): value is MeterDrawn =>
  value === "blocks" || value === "bar";

function resolveColumns(config: PowerOriginCardConfig) {
  const ring = config.ring ?? {};
  const second = ring.meter_second ?? DEFAULTS.ring.meter_second;
  const on = ring.meter ?? DEFAULTS.ring.meter;

  const columns =
    ring.columns ??
    (!on ? "none" : second !== "none" || ring.meter_second_shows ? "two" : "one");

  // What a column measures and how it is drawn were one list, which put a
  // needle style and a subject in the same dropdown. They are two questions,
  // and a card written before the split still answers the old one.
  const shows =
    ring.meter_shows ??
    (isDrawn(ring.meter_style ?? DEFAULTS.ring.meter_style)
      ? "grid"
      : (ring.meter_style as MeterShows));
  // A needle is blocks unless told otherwise; a column that fills from one
  // end is one body unless told otherwise, so nothing is redrawn unasked.
  // The editor writes the drawing to its own key; a card written before that
  // carried it in meter_style, which still reads.
  const drawn = isDrawn(ring.meter_drawn)
    ? ring.meter_drawn
    : isDrawn(ring.meter_style)
      ? ring.meter_style
      : shows === "grid"
        ? DEFAULTS.ring.meter_style
        : "bar";

  const secondShows =
    ring.meter_second_shows ??
    (second === "none"
      ? DEFAULTS.ring.meter_second_shows
      : isDrawn(second)
        ? "grid"
        : (second as MeterShows));
  const secondDrawn = isDrawn(ring.meter_second_drawn)
    ? ring.meter_second_drawn
    : isDrawn(ring.meter_second_style)
      ? ring.meter_second_style
      : isDrawn(second)
        ? second
        : secondShows === "grid"
          ? DEFAULTS.ring.meter_second_style
          : "bar";

  return {
    columns,
    // The scale is no column: it stands under the ring, not beside it.
    meter: columns === "one" || columns === "two",
    meter_shows: shows,
    meter_style: shows === "grid" ? drawn : (shows as MeterStyle),
    meter_drawn: drawn,
    meter_second_drawn: secondDrawn,
    meter_second_shows: secondShows,
    meter_second_style: secondDrawn,
    // Asking for two and leaving the right one unset gets the day, which is
    // the one type that says something a needle cannot.
    meter_second:
      columns === "two"
        ? secondShows === "grid"
          ? secondDrawn
          : (secondShows as MeterStyle)
        : ("none" as const)
  };
}

export function resolveConfig(config: PowerOriginCardConfig): ResolvedConfig {
  return {
    type: config.type,
    title: config.title,
    entities: {
      ...config.entities,
      // One roof face or several: the card reads a list either way.
      forecast: idsOf(config.entities?.forecast),
      forecast_tomorrow: idsOf(config.entities?.forecast_tomorrow),
      forecast_hourly: idsOf(config.entities?.forecast_hourly)
    },
    text_scale: config.text_scale ?? DEFAULTS.text_scale,
    night_dim: config.night_dim ?? DEFAULTS.night_dim,
    chip: config.chip ?? DEFAULTS.chip,
    chip_shows: config.chip_shows ?? DEFAULTS.chip_shows,
    chip_alarm: config.chip_alarm ?? DEFAULTS.chip_alarm,
    head_price: config.head_price ?? DEFAULTS.head_price,
    head_sunbar: config.head_sunbar ?? DEFAULTS.head_sunbar,
    shape: config.shape ?? DEFAULTS.shape,
    wide_from: config.wide_from ?? DEFAULTS.wide_from,
    night_layout: config.night_layout ?? DEFAULTS.night_layout,
    palette: config.palette ?? DEFAULTS.palette,
    font: config.font ?? DEFAULTS.font,
    tap_action: config.tap_action ?? DEFAULTS.tap_action,
    // The two used to sit at the top level. They belong to the battery and
    // live there now; a card written before that still reads.
    battery_capacity:
      config.battery?.capacity ?? config.battery_capacity ?? DEFAULTS.battery_capacity,
    battery_reserve:
      config.battery?.reserve ?? config.battery_reserve ?? DEFAULTS.battery_reserve,
    // The two switches sit with the sensors they reverse, so the editor writes
    // them under entities; a card that set them at the top level still reads.
    battery_invert:
      config.entities?.battery_invert ?? config.battery_invert ?? DEFAULTS.battery_invert,
    grid_invert: config.entities?.grid_invert ?? config.grid_invert ?? DEFAULTS.grid_invert,
    sections: {
      ...DEFAULTS.sections,
      ...config.sections,
      // Only what was chosen, once each, and only blocks that are on: the
      // editor shows this list back, so a block switched off leaves it.
      order: (() => {
        const on = { ...DEFAULTS.sections, ...config.sections };
        return (config.sections?.order ?? []).filter(
          (block, index, list) => BLOCKS.includes(block) && on[block] && list.indexOf(block) === index
        );
      })()
    },
    ring: {
      ...DEFAULTS.ring,
      ...config.ring,
      ...resolveColumns(config),
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
    battery: {
      ...DEFAULTS.battery,
      ...config.battery,
      capacity: config.battery?.capacity ?? config.battery_capacity ?? DEFAULTS.battery.capacity,
      reserve: config.battery?.reserve ?? config.battery_reserve ?? DEFAULTS.battery.reserve
    },
    devices: {
      // The editor writes one field per device; the card reads one map.
      ...Object.fromEntries(
        Object.entries(config.devices ?? {}).filter(([key]) => key.startsWith("icon:"))
      ),
      icons: {
        ...config.devices?.icons,
        ...Object.fromEntries(
          Object.entries(config.devices ?? {})
            .filter(([key, value]) => key.startsWith("icon:") && typeof value === "string" && value)
            .map(([key, value]) => [key.slice(5), value as string])
        )
      },
      top: config.devices?.top ?? DEFAULTS.devices.top,
      spark: config.devices?.spark ?? DEFAULTS.devices.spark,
      // Nobody's own list is overruled: the dashboard is followed only where no list was made.
      source: config.devices?.source ?? (config.devices?.list?.length ? "list" : DEFAULTS.devices.source),
      list: config.devices?.list ?? DEFAULTS.devices.list,
      names: { ...DEFAULTS.devices.names, ...config.devices?.names },
      mode: config.devices?.mode ?? DEFAULTS.devices.mode,
      window: config.devices?.window ?? DEFAULTS.devices.window,
      energy: { ...DEFAULTS.devices.energy, ...config.devices?.energy },
      // The bar and the bar-with-names were two names for one strip; the
      // tiles said what the rows say now. A card written for any of them reads.
      style: (() => {
        const chosen = config.devices?.style;
        if (chosen === "bar" || chosen === "both") return "band" as const;
        if (chosen === "tiles") return "rows" as const;
        return chosen ?? DEFAULTS.devices.style;
      })(),
      values: config.devices?.values ?? DEFAULTS.devices.values,
      head: config.devices?.head ?? DEFAULTS.devices.head,
      colours: config.devices?.colours ?? DEFAULTS.devices.colours,
      group: config.devices?.group ?? DEFAULTS.devices.group,
      limit: config.devices?.limit ?? DEFAULTS.devices.limit,
      threshold: config.devices?.threshold ?? DEFAULTS.devices.threshold
    },
    today: {
      money: config.today?.money ?? DEFAULTS.today.money,
      origin_bar: config.today?.origin_bar ?? DEFAULTS.today.origin_bar,
      origin_style: config.today?.origin_style ?? DEFAULTS.today.origin_style,
      breakdown: config.today?.breakdown ?? DEFAULTS.today.breakdown,
      amortisation: config.today?.amortisation ?? DEFAULTS.today.amortisation,
      stats: config.today?.stats?.length ? config.today.stats : DEFAULTS.today.stats,
      stats_chosen: Boolean(config.today?.stats?.length),
      month: config.today?.month ?? DEFAULTS.today.month,
      split: config.today?.split ?? DEFAULTS.today.split,
      payoff_year: config.today?.payoff_year ?? DEFAULTS.today.payoff_year,
      investment: config.today?.investment ?? DEFAULTS.today.investment
    }
  };
}

/** Guesses entities by name so the card is useful the moment it is added. */
/** One string of an array is not the array; a total is what the card wants. */
const PARTIAL = /(^|[._])(pv|string|mppt|inverter)[ _]?[0-9]/;

export function stubConfig(entityIds: string[]): PowerOriginCardConfig {
  const find = (...needles: string[]) => {
    const all = entityIds.filter((id) =>
      needles.every((needle) => id.toLowerCase().includes(needle))
    );
    return all.find((id) => !PARTIAL.test(id)) ?? all[0];
  };

  return {
    type: `custom:${CARD_TYPE}`,
    entities: {
      house:
        find("house", "consumption") ??
        find("hausverbrauch") ??
        find("load") ??
        entityIds[0] ??
        "",
      solar: find("pv", "power") ?? find("solar", "power") ?? find("erzeugung"),
      forecast_tomorrow: find("forecast", "tomorrow") ?? find("prognose", "morgen"),
      battery_power: find("battery", "power") ?? find("speicher", "leistung"),
      battery_soc:
        find("battery", "state_of_charge") ??
        find("battery", "soc") ??
        find("ladestand"),
      // A grid sensor that reads one direction only cannot carry the sign,
      // so a net reading is looked for before anything else.
      grid_power: find("grid", "net", "power") ?? find("netz", "power") ?? find("grid", "power")
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

const entityField = (name: string, deviceClass?: string, multiple = false) => ({
  name,
  selector: {
    entity: {
      ...(multiple ? { multiple: true } : {}),
      ...(deviceClass
        ? { filter: [{ domain: "sensor", device_class: [deviceClass] }] }
        : { domain: "sensor" })
    }
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

  /** Whether anything can put a price on the day: a sensor, or a price to work it out from. */
  const money = (resolved: ResolvedConfig) =>
    Boolean(
      resolved.entities.cost_today ||
        resolved.entities.cost_export_today ||
        resolved.entities.cost_import_today ||
        resolved.entities.price_import ||
        resolved.entities.price_export
    );

  /** Only a column with a needle has a scale, a direction and a threshold. */
  const gauge = (resolved: ResolvedConfig) =>
    resolved.ring.meter &&
    (resolved.ring.meter_style === "blocks" || resolved.ring.meter_style === "bar");

  /** The right column is a needle of its own, with settings of its own. */
  const secondGauge = (resolved: ResolvedConfig) =>
    resolved.ring.meter &&
    (resolved.ring.meter_second === "blocks" || resolved.ring.meter_second === "bar");

  const scaled = (resolved: ResolvedConfig) =>
    gauge(resolved) || resolved.ring.meter_style === "balance";

  /** A price is what turns a kilowatt into a decision; without one there is no money view. */
  const prices = (resolved: ResolvedConfig) =>
    Boolean(resolved.entities.price_import || resolved.entities.price_export);
  /**
   * Two settings to a row. A group of a dozen single-file boxes reads as a
   * list of everything; in pairs it reads as a handful of decisions. A field
   * that is currently hidden takes no slot, so the rows close up.
   */
  const inPairs = (items: Array<Record<string, unknown>>) => {
    const rows: Array<Record<string, unknown>> = [];
    for (let i = 0; i < items.length; i += 2) rows.push({ type: "grid", schema: items.slice(i, i + 2) });
    return rows;
  };

  const cell = (resolved: ResolvedConfig) => Boolean(resolved.entities.battery_soc);
  const cellTimed = (resolved: ResolvedConfig) =>
    Boolean(resolved.entities.battery_soc && resolved.entities.battery_power);

  const secondScaled = (resolved: ResolvedConfig) =>
    secondGauge(resolved) ||
    (resolved.ring.meter && resolved.ring.meter_second === "balance");

  /* The subjects a column can take. The night is a night subject only; the
     roof and the roof against the house have nothing to say at night, so the
     night list leaves them out. Devices need a list to draw from. */
  const devicesSubject = only((resolved) => resolved.devices.list.length > 0, {
    value: "devices",
    label: t("editor.meter_devices")
  });
  const subjects = [
    { value: "grid", label: t("editor.shows_grid") },
    { value: "day", label: t("editor.meter_day") },
    { value: "balance", label: t("editor.meter_balance") },
    { value: "money", label: t("editor.meter_money") },
    { value: "load", label: t("editor.meter_load") },
    { value: "autarky", label: t("editor.meter_autarky") },
    { value: "roof", label: t("editor.meter_roof") },
    { value: "battery", label: t("editor.meter_battery") },
    ...devicesSubject,
    { value: "none", label: t("editor.meter_none") }
  ];
  const darkSubjects = [
    { value: "same", label: t("editor.same") },
    { value: "night", label: t("editor.meter_night") },
    { value: "grid", label: t("editor.shows_grid") },
    { value: "day", label: t("editor.meter_day") },
    { value: "money", label: t("editor.meter_money") },
    { value: "load", label: t("editor.meter_load") },
    { value: "autarky", label: t("editor.meter_autarky") },
    { value: "battery", label: t("editor.meter_battery") },
    ...devicesSubject,
    { value: "none", label: t("editor.meter_none") }
  ];
  /** A column that fills from one end can be blocks or one body; the rest have one shape. */
  const drawable = (shows: string) =>
    ["grid", "night", "roof", "battery", "autarky"].includes(shows);
  /** A column with a mark above it: the roof's best, or the battery's size. */
  const topped = (shows: string) => shows === "roof" || shows === "battery";

  const leftColumn = [
              ...only((resolved) => resolved.ring.meter, {
                name: "meter_shows",
                selector: { select: { mode: "dropdown", options: subjects } }
              }),
              ...only((resolved) => topped(resolved.ring.meter_shows), {
                name: "meter_top",
                selector: { boolean: {} }
              }),
              ...only((resolved) => resolved.ring.meter && drawable(resolved.ring.meter_shows), {
                name: "meter_drawn",
                selector: {
                  select: {
                    mode: "dropdown",
                    options: [
                      { value: "blocks", label: t("editor.meter_blocks") },
                      { value: "bar", label: t("editor.meter_bar") }
                    ]
                  }
                }
              }),
              ...only(gauge, {
                name: "meter_scope",
                selector: {
                  select: {
                    mode: "dropdown",
                    options: [
                      { value: "grid", label: t("editor.meter_scope_grid") },
                      { value: "all", label: t("editor.meter_scope_all") }
                    ]
                  }
                }
              }),
              ...only(scaled, {
                type: "grid",
                schema: [
                  {
                    name: "meter_scale",
                    selector: { number: { min: 0, max: 50, step: 0.5, mode: "box" } }
                  },
                  ...only(gauge, {
                    name: "meter_scale_draw",
                    selector: { number: { min: 0, max: 50, step: 0.5, mode: "box" } }
                  })
                ]
              }),
              ...only(gauge, {
                type: "grid",
                schema: [
                  {
                    name: "meter_target",
                    selector: { number: { min: 0, max: 50, step: 0.1, mode: "box" } }
                  }
                ]
              }),
              ...only(
                (resolved) =>
                  resolved.ring.meter &&
                  resolved.ring.meter_drawn === "blocks" &&
                  drawable(resolved.ring.meter_shows),
                {
                  name: "meter_steps",
                  selector: { number: { min: 3, max: 14, mode: "box" } }
                }
              ),
              ...only(gauge, {
                type: "grid",
                schema: [
                  { name: "meter_marks", selector: { boolean: {} } },
                  { name: "meter_today", selector: { boolean: {} } }
                ]
              }),
              ...only((resolved) => resolved.ring.meter, {
                name: "meter_dark",
                selector: { select: { mode: "dropdown", options: darkSubjects } }
              })
  ];

  const rightColumn = [
              ...only((resolved) => resolved.ring.meter, {
                name: "meter_second_shows",
                selector: { select: { mode: "dropdown", options: subjects } }
              }),
              ...only((resolved) => topped(resolved.ring.meter_second_shows), {
                name: "meter_second_top",
                selector: { boolean: {} }
              }),
              ...only((resolved) => drawable(resolved.ring.meter_second_shows), {
                name: "meter_second_drawn",
                selector: {
                  select: {
                    mode: "dropdown",
                    options: [
                      { value: "blocks", label: t("editor.meter_blocks") },
                      { value: "bar", label: t("editor.meter_bar") }
                    ]
                  }
                }
              }),

              ...only(
                (resolved) =>
                  resolved.ring.meter &&
                  (resolved.ring.meter_second === "blocks" || resolved.ring.meter_second === "bar"),
                {
                  name: "meter_second_scope",
                  selector: {
                    select: {
                      mode: "dropdown",
                      options: [
                        { value: "grid", label: t("editor.meter_scope_grid") },
                        { value: "all", label: t("editor.meter_scope_all") }
                      ]
                    }
                  }
                }
              ),
              ...only(secondScaled, {
                type: "grid",
                schema: [
                  {
                    name: "meter_second_scale",
                    selector: { number: { min: 0, max: 50, step: 0.5, mode: "box" } }
                  },
                  ...only(secondGauge, {
                    name: "meter_second_scale_draw",
                    selector: { number: { min: 0, max: 50, step: 0.5, mode: "box" } }
                  })
                ]
              }),
              ...only(secondGauge, {
                type: "grid",
                schema: [
                  {
                    name: "meter_second_target",
                    selector: { number: { min: 0, max: 50, step: 0.1, mode: "box" } }
                  }
                ]
              }),
              ...only(
                (resolved) =>
                  resolved.ring.meter &&
                  resolved.ring.meter_second_drawn === "blocks" &&
                  drawable(resolved.ring.meter_second_shows),
                {
                  name: "meter_second_steps",
                  selector: { number: { min: 3, max: 14, mode: "box" } }
                }
              ),
              ...only(secondGauge, {
                type: "grid",
                schema: [
                  { name: "meter_second_marks", selector: { boolean: {} } },
                  { name: "meter_second_today", selector: { boolean: {} } }
                ]
              }),
              ...only((resolved) => resolved.ring.meter, {
                name: "meter_second_dark",
                selector: { select: { mode: "dropdown", options: darkSubjects } }
              })
  ];

  /* The scale under the ring is one needle laid flat, so it keeps the left
     column's scope and deflections and needs nothing else. */
  const scaleSection = [
    {
      name: "meter_scope",
      selector: {
        select: {
          mode: "dropdown",
          options: [
            { value: "grid", label: t("editor.meter_scope_grid") },
            { value: "all", label: t("editor.meter_scope_all") }
          ]
        }
      }
    },
    {
      type: "grid",
      schema: [
        { name: "meter_scale", selector: { number: { min: 0, max: 50, step: 0.5, mode: "box" } } },
        { name: "meter_scale_draw", selector: { number: { min: 0, max: 50, step: 0.5, mode: "box" } } }
      ]
    }
  ];

  /*
   * With two columns each gets a section of its own. The title carries the
   * side, so every field inside can say plainly what it does instead of
   * repeating left or right on each line.
   */
  const paired = !config || config.ring.columns === "two";
  const columnSections = paired
    ? [
        {
          type: "expandable",
          title: t("editor.column_left"),
          icon: "mdi:format-horizontal-align-left",
          schema: leftColumn
        },
        {
          type: "expandable",
          title: t("editor.column_right"),
          icon: "mdi:format-horizontal-align-right",
          schema: rightColumn
        }
      ]
    : leftColumn;

  /* The top of the form is one group like the others, open by default, in
     rows that read as pairs: what the card is called and how big; a tap and
     the shape; the colours and the night. The chip sits with the corner. */
  const schema = [
    {
      type: "expandable",
      title: t("editor.card_settings"),
      icon: "mdi:card-text-outline",
      expanded: true,
      schema: [
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
      type: "grid",
      schema: [
        {
          name: "tap_action",
          selector: { ui_action: { default_action: "more-info" } }
        },
        {
          name: "shape",
          selector: {
            select: {
              mode: "dropdown",
              options: [
                { value: "standard", label: t("editor.layout_standard") },
                { value: "wide", label: t("editor.layout_wide") },
                { value: "compact", label: t("editor.layout_compact") }
              ]
            }
          }
        },
        ...only((resolved) => resolved.shape === "wide", {
          name: "wide_from",
          selector: { number: { min: 0, max: 2000, step: 20, mode: "box", unit_of_measurement: "px" } }
        })
      ]
    },
    // Two dropdowns pair in one row; a slider in half a row leaves its help
    // text four words wide, so it gets the whole width to itself.
    {
      type: "grid",
      schema: [
        {
          name: "palette",
          selector: {
            select: {
              mode: "dropdown",
              options: [
                { value: "standard", label: t("editor.palette_standard") },
                { value: "traffic", label: t("editor.palette_traffic") },
                { value: "safe", label: t("editor.palette_safe") },
                { value: "muted", label: t("editor.palette_muted") }
              ]
            }
          }
        },
        {
          name: "font",
          selector: {
            select: {
              mode: "dropdown",
              options: [
                { value: "mono", label: t("editor.font_mono") },
                { value: "system", label: t("editor.font_system") }
              ]
            }
          }
        },
        {
          name: "night_layout",
          selector: {
            select: {
              mode: "dropdown",
              options: [
                { value: "same", label: t("editor.same") },
                { value: "quiet", label: t("editor.night_quiet") }
              ]
            }
          }
        }
      ]
    },
    { name: "night_dim", selector: { number: { min: 0, max: 50, step: 5, mode: "slider" } } }
      ]
    },
    {
      type: "expandable",
      title: t("editor.head_settings"),
      icon: "mdi:page-layout-header",
      schema: [
        {
          type: "grid",
          schema: [
            {
              name: "chip",
              selector: {
                select: {
                  mode: "dropdown",
                  options: [
                    { value: "always", label: t("editor.chip_always") },
                    { value: "gridfree", label: t("editor.chip_gridfree") },
                    { value: "never", label: t("editor.chip_never") }
                  ]
                }
              }
            },
            ...only((resolved) => resolved.chip !== "never", {
              name: "chip_shows",
              selector: {
                select: {
                  mode: "dropdown",
                  options: [
                    { value: "state", label: t("editor.chip_state") },
                    { value: "autarky", label: t("editor.chip_autarky") }
                  ]
                }
              }
            })
          ]
        },
        {
          type: "grid",
          schema: [
            ...only((resolved) => Boolean(resolved.entities.grid_power), {
              name: "chip_alarm",
              selector: { boolean: {} }
            }),
            ...only((resolved) => Boolean(resolved.entities.price_import), {
              name: "head_price",
              selector: { boolean: {} }
            }),
            // The day chart already draws the sun's day; the line is for a card without it.
            ...only((resolved) => !resolved.sections.chart, {
              name: "head_sunbar",
              selector: { boolean: {} }
            })
          ]
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
        entityField("forecast", "energy", true),
        { type: "grid", schema: [entityField("forecast_tomorrow", "energy", true), entityField("forecast_hourly", "energy", true)] },
        entityField("cost_today", "monetary"),
        {
          type: "grid",
          schema: [
            entityField("cost_export_today", "monetary"),
            entityField("cost_import_today", "monetary")
          ]
        },
        { type: "grid", schema: [entityField("price_import"), entityField("price_export")] },
        {
          type: "grid",
          schema: [entityField("battery_out_today", "energy"), entityField("battery_in_today", "energy")]
        },
        entityField("amortisation"),
        {
          type: "grid",
          schema: [
            { name: "battery_invert", selector: { boolean: {} } },
            { name: "grid_invert", selector: { boolean: {} } }
          ]
        }
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
            { name: "today", selector: { boolean: {} } },
            { name: "devices", selector: { boolean: {} } },
            ...only((resolved) => Boolean(resolved.entities.solar_today), {
              name: "week",
              selector: { boolean: {} }
            })
          ]
        },
        // Picked in the order they should stand, or dragged into it; what is
        // not picked follows. Only blocks that are on are offered.
        {
          name: "order",
          selector: {
            select: {
              multiple: true,
              reorder: true,
              mode: "dropdown",
              options: [
                ...only((r) => r.sections.ring, { value: "ring", label: t("editor.section_ring") }),
                ...only((r) => r.sections.chart, { value: "chart", label: t("editor.section_chart") }),
                ...only((r) => r.sections.battery, { value: "battery", label: t("editor.section_battery") }),
                ...only((r) => r.sections.today, { value: "today", label: t("editor.section_today") }),
                ...only((r) => r.sections.devices, { value: "devices", label: t("editor.section_devices") }),
                ...only((r) => r.sections.week, { value: "week", label: t("editor.section_week") })
              ]
            }
          }
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
      schema: inPairs([
        {
          name: "center",
          selector: {
            select: {
              mode: "dropdown",
              options: [
                { value: "power", label: t("editor.center_power") },
                { value: "production", label: t("editor.center_production") },
                { value: "surplus", label: t("editor.center_surplus") },
                { value: "autarky", label: t("editor.center_autarky") },
                ...only(prices, { value: "money", label: t("editor.center_money") })
              ]
            }
          }
        },
        // The night has answers of its own; house power leaves a day view alone.
        {
          name: "center_dark",
          selector: {
            select: {
              mode: "dropdown",
              options: [
                { value: "power", label: t("editor.center_power") },
                { value: "autarky", label: t("editor.center_autarky") },
                ...only(cellTimed, { value: "runtime", label: t("editor.center_runtime") }),
                ...only(prices, { value: "money", label: t("editor.center_money") })
              ]
            }
          }
        },
        {
          name: "tap",
          selector: {
            select: {
              mode: "dropdown",
              options: [
                { value: "entity", label: t("editor.tap_entity") },
                { value: "cycle", label: t("editor.tap_cycle") }
              ]
            }
          }
        },
        {
          name: "rings",
          selector: {
            select: {
              mode: "dropdown",
              options: [
                { value: "single", label: t("editor.ring_single") },
                { value: "double", label: t("editor.ring_double") },
                { value: "clock", label: t("editor.ring_clock") },
                { value: "dayclock", label: t("editor.ring_dayclock") }
              ]
            }
          }
        },
        ...only(
          (resolved) => resolved.ring.rings === "clock" || resolved.ring.rings === "dayclock",
          {
            name: "clock_marks",
            selector: { boolean: {} }
          }
        ),
        {
          name: "night",
          selector: {
            select: {
              mode: "dropdown",
              options: [
                { value: "same", label: t("editor.same") },
                { value: "countdown", label: t("editor.night_countdown") }
              ]
            }
          }
        },
        { name: "import_red", selector: { boolean: {} } },
        {
          name: "inner",
          selector: {
            select: {
              mode: "dropdown",
              options: [
                { value: "icon", label: t("editor.inner_icon") },
                { value: "load", label: t("editor.inner_load") },
                ...only(cell, { value: "battery", label: t("editor.inner_battery") }),
                { value: "none", label: t("editor.inner_none") }
              ]
            }
          }
        },
        {
          name: "size",
          selector: {
            select: {
              mode: "dropdown",
              options: [
                { value: "auto", label: t("editor.size_auto") },
                { value: "s", label: t("editor.size_s") },
                { value: "m", label: t("editor.size_m") },
                { value: "l", label: t("editor.size_l") }
              ]
            }
          }
        },
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
      ])
    }
    ),
    ...only(
      (resolved) => resolved.sections.ring,
      {
        type: "expandable",
        name: "ring",
        title: t("editor.meter_settings"),
        icon: "mdi:gauge",
        schema: [
          {
            name: "columns",
            selector: {
              select: {
                mode: "dropdown",
                options: [
                  { value: "none", label: t("editor.columns_none") },
                  { value: "one", label: t("editor.columns_one") },
                  { value: "two", label: t("editor.columns_two") },
                  { value: "scale", label: t("editor.columns_scale") }
                ]
              }
            }
          },
          ...only(
            (resolved) => resolved.ring.columns !== "none" && Boolean(resolved.entities.grid_power),
            { name: "import_switch", selector: { boolean: {} } }
          ),
          // Only a column that shows the share, by day or by night, has colours to grade.
          ...only(
            (resolved) =>
              resolved.ring.meter &&
              [
                resolved.ring.meter_shows,
                resolved.ring.meter_second_shows,
                resolved.ring.meter_dark,
                resolved.ring.meter_second_dark
              ].includes("autarky"),
            { name: "autarky_colours", selector: { boolean: {} } }
          ),
          ...(config?.ring.columns === "scale" ? scaleSection : columnSections)
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
            ...only((resolved) => resolved.entities.forecast.length > 0, {
              name: "show_forecast",
              selector: { boolean: {} }
            }),
            ...only((resolved) => Boolean(resolved.entities.solar), {
              name: "compare",
              selector: { boolean: {} }
            })
          ]
        },
        {
          type: "grid",
          schema: [
            ...only(
              (resolved) =>
                resolved.entities.forecast_hourly.length > 0 || resolved.entities.forecast_tomorrow.length > 0,
              { name: "forecast_bars", selector: { boolean: {} } }
            ),
            ...only(
              (resolved) => Boolean(resolved.entities.grid_power || resolved.entities.battery_power),
              { name: "layers", selector: { boolean: {} } }
            ),
            ...only((resolved) => Boolean(resolved.entities.solar), {
              name: "best_day",
              selector: { boolean: {} }
            })
          ]
        },
        {
          name: "height",
          selector: { number: { min: 30, max: 120, step: 5, mode: "slider" } }
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
          type: "grid",
          schema: [
            {
              name: "capacity",
              selector: { number: { min: 0, max: 200000, step: 100, mode: "box" } }
            },
            { name: "reserve", selector: { number: { min: 0, max: 50, mode: "box" } } }
          ]
        },
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
            { name: "percent", selector: { boolean: {} } },
            ...only((resolved) => resolved.battery_reserve > 0, {
              name: "reserve_line",
              selector: { boolean: {} }
            }),
            ...only(
              (resolved) => cellTimed(resolved) && resolved.battery.style !== "solid",
              { name: "animate", selector: { boolean: {} } }
            )
          ]
        },
        // How long it lasts and how long it took to say so belong together.
        {
          type: "grid",
          schema: [
            { name: "runtime", selector: { boolean: {} } },
            ...only((resolved) => resolved.battery.runtime, {
              name: "runtime_window",
              selector: { number: { min: 5, max: 120, step: 5, mode: "box", unit_of_measurement: "min" } }
            })
          ]
        },
        // A forecast can see the evening, which the rate cannot; offered only
        // once there is a forecast by the hour to read.
        ...only(
          (resolved) => cellTimed(resolved) && resolved.battery.runtime && resolved.entities.forecast_hourly.length > 0,
          {
            name: "full_from",
            selector: {
              select: {
                mode: "dropdown",
                options: [
                  { value: "rate", label: t("editor.full_rate") },
                  { value: "forecast", label: t("editor.full_forecast") }
                ]
              }
            }
          }
        ),
        // What the bar says about the night sits together, since it is one thought.
        ...only(cell, {
          type: "expandable",
          title: t("editor.battery_night"),
          icon: "mdi:weather-night",
          schema: [
            {
              type: "grid",
              schema: [
                ...only(
                  (resolved) => cellTimed(resolved) && resolved.battery_capacity > 0,
                  { name: "sunrise_mark", selector: { boolean: {} } }
                ),
                { name: "curve", selector: { boolean: {} } }
              ]
            }
          ]
        }),
        {
          name: "extra",
          selector: {
            select: {
              mode: "dropdown",
              options: [
                { value: "none", label: t("editor.extra_none") },
                { value: "range", label: t("editor.extra_range") },
                { value: "cycles", label: t("editor.extra_cycles") },
                { value: "saved", label: t("editor.extra_saved") },
                { value: "given", label: t("editor.extra_given") },
                { value: "sunrise", label: t("editor.extra_sunrise") },
                ...only(
                  (resolved) =>
                    Boolean(resolved.entities.battery_in_today && resolved.entities.battery_out_today),
                  { value: "flow", label: t("editor.extra_flow") }
                )
              ]
            }
          }
        },
      ]
    }
    ),
    ...only(
      (resolved) => resolved.sections.devices,
      {
        type: "expandable",
        name: "devices",
        title: t("editor.devices_settings"),
        icon: "mdi:power-plug-outline",
        schema: [
          {
            name: "source",
            selector: {
              select: {
                mode: "dropdown",
                options: [
                  { value: "list", label: t("editor.source_list") },
                  { value: "energy", label: t("editor.source_energy") }
                ]
              }
            }
          },
          ...only((resolved) => resolved.devices.source !== "energy", {
            name: "list",
            selector: {
              entity: { multiple: true, filter: { domain: "sensor", device_class: "power" } }
            }
          }),
          // The day's total needs the meters, which only the dashboard knows;
          // until they are known there is one period, and no choice to offer.
          ...only(
            (resolved) =>
              resolved.devices.list.length > 0 && Object.keys(resolved.devices.energy).length > 0,
            {
              name: "mode",
              selector: {
                select: {
                  mode: "dropdown",
                  options: [
                    { value: "now", label: t("editor.mode_now") },
                    { value: "today", label: t("editor.mode_today") }
                  ]
                }
              }
            }
          ),
          ...only(
            (resolved) => resolved.devices.list.length > 0 && resolved.devices.mode === "now",
            { name: "window", selector: { number: { min: 1, max: 180, mode: "box" } } }
          ),
          ...only(
            (resolved) => resolved.devices.list.length > 0,
            {
              name: "style",
              selector: {
                select: {
                  mode: "dropdown",
                  options: [
                    { value: "rows", label: t("editor.devices_rows") },
                    { value: "band", label: t("editor.devices_band") },
                    { value: "icons", label: t("editor.devices_icons") }
                  ]
                }
              }
            },
            {
              type: "grid",
              schema: [
                // The biggest as a row of its own sits above a list; icons are
                // no list. A line each needs a row to sit in.
                ...only(
                  (resolved) => resolved.devices.mode === "now" && resolved.devices.style !== "icons",
                  { name: "top", selector: { boolean: {} } }
                ),
                ...only(
                  (resolved) => resolved.devices.mode === "now" && resolved.devices.style === "rows",
                  { name: "spark", selector: { boolean: {} } }
                )
              ]
            },
            {
              type: "grid",
              schema: [
                { name: "head", selector: { boolean: {} } },
                { name: "colours", selector: { boolean: {} } }
              ]
            },
            {
              type: "grid",
              schema: [
                { name: "values", selector: { boolean: {} } },
                {
                  name: "group",
                  selector: {
                    select: {
                      mode: "dropdown",
                      options: [
                        { value: "device", label: t("editor.group_device") },
                        { value: "area", label: t("editor.group_area") }
                      ]
                    }
                  }
                }
              ]
            },
            {
              type: "grid",
              schema: [
                { name: "limit", selector: { number: { min: 1, max: 12, mode: "box" } } },
                ...only((resolved) => resolved.devices.mode === "now", {
                  name: "threshold",
                  selector: { number: { min: 0, max: 2000, step: 5, mode: "box" } }
                })
              ]
            },
            // One icon field per device, named after the device so the list reads itself.
            {
              type: "expandable",
              title: t("editor.device_icons"),
              icon: "mdi:shape-outline",
              schema: (config?.devices.list ?? []).map((id) => ({
                name: `icon:${id}`,
                title: config?.devices.names[id] ?? id,
                selector: { icon: {} }
              }))
            }
          )
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
            ...only(money, { name: "money", selector: { boolean: {} } }),
            { name: "origin_bar", selector: { boolean: {} } },
            ...only(
              (resolved) =>
                money(resolved) &&
                resolved.today.money &&
                Boolean(
                  resolved.entities.cost_export_today ||
                    resolved.entities.cost_import_today ||
                    resolved.entities.price_import ||
                    resolved.entities.price_export
                ),
              { name: "breakdown", selector: { boolean: {} } }
            ),
            ...only(
              (resolved) =>
                money(resolved) && resolved.today.money && Boolean(resolved.entities.amortisation),
              { name: "amortisation", selector: { boolean: {} } }
            )
          ]
        },
        {
          type: "grid",
          schema: [
            ...only((resolved) => money(resolved) && resolved.today.money, {
              name: "month",
              selector: { boolean: {} }
            }),
            // The split needs what was not bought: the house's day less the grid's, priced.
            ...only(
              (resolved) =>
                money(resolved) &&
                resolved.today.money &&
                Boolean(
                  resolved.entities.house_today &&
                    resolved.entities.import_today &&
                    resolved.entities.price_import
                ),
              { name: "split", selector: { boolean: {} } }
            ),
            ...only(
              (resolved) =>
                money(resolved) && resolved.today.money && Boolean(resolved.entities.amortisation),
              { name: "payoff_year", selector: { boolean: {} } }
            )
          ]
        },
        ...only(
          (resolved) =>
            money(resolved) && resolved.today.money && Boolean(resolved.entities.amortisation),
          {
            name: "investment",
            selector: { number: { min: 0, max: 200000, step: 100, mode: "box" } }
          }
        ),
        ...only(
          (resolved) => resolved.today.origin_bar,
          {
            name: "origin_style",
            selector: {
              select: {
                mode: "dropdown",
                options: [
                  { value: "bar", label: t("editor.origin_shares") },
                  { value: "band", label: t("editor.origin_band") }
                ]
              }
            }
          }
        ),
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
  ];

  const labels: Record<string, string> = {
    title: t("editor.title"),
    text_scale: t("editor.text_scale"),
    chip: t("editor.chip"),
    chip_shows: t("editor.chip_shows"),
    chip_alarm: t("editor.chip_alarm"),
    head_price: t("editor.head_price"),
    head_sunbar: t("editor.head_sunbar"),
    wide_from: t("editor.wide_from"),
    night_layout: t("editor.night_layout"),
    tap_action: t("editor.tap_action"),
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
    forecast_tomorrow: t("editor.forecast_tomorrow"),
    forecast_hourly: t("editor.forecast_hourly"),
    forecast_bars: t("editor.forecast_bars"),
    layers: t("editor.layers"),
    best_day: t("editor.best_day"),
    week: t("editor.section_week"),
    cost_today: t("editor.cost_today"),
    cost_export_today: t("editor.cost_export_today"),
    cost_import_today: t("editor.cost_import_today"),
    price_import: t("editor.price_import"),
    price_export: t("editor.price_export"),
    sections: t("editor.sections"),
    order: t("editor.order"),
    ring: t("editor.section_ring"),
    chart: t("editor.section_chart"),
    battery: t("editor.section_battery"),
    today: t("editor.section_today"),
    center: t("editor.center"),
    center_dark: t("editor.center_dark"),
    facts: t("editor.facts"),
    layout: t("editor.layout"),
    caption: t("editor.caption"),
    columns: t("editor.columns"),
    devices: t("editor.section_devices"),
    list: t("editor.list"),
    source: t("editor.source"),
    mode: t("editor.mode"),
    window: t("editor.window"),
    values: t("editor.values"),
    group: t("editor.group"),
    limit: t("editor.limit"),
    threshold: t("editor.threshold"),
    top: t("editor.top"),
    spark: t("editor.spark"),
    meter_scale: t("editor.meter_scale"),
    meter_scale_draw: t("editor.meter_scale_draw"),
    meter_target: t("editor.meter_target"),
    meter_steps: t("editor.meter_steps"),
    meter_shows: t("editor.meter_shows"),
    meter_dark: t("editor.meter_dark"),
    meter_second_dark: t("editor.meter_dark"),
    night_dim: t("editor.night_dim"),
    meter_style: t("editor.meter_style"),
    meter_drawn: t("editor.meter_style"),
    meter_second_drawn: t("editor.meter_style"),
    meter_today: t("editor.meter_today"),
    meter_marks: t("editor.meter_marks"),
    meter_top: t("editor.meter_top"),
    meter_scope: t("editor.meter_scope"),
    size: t("editor.size"),
    rings: t("editor.ring_style"),
    inner: t("editor.inner"),
    clock_marks: t("editor.clock_marks"),
    import_red: t("editor.import_red"),
    night: t("editor.night"),
    tap: t("editor.tap"),
    sunrise_mark: t("editor.sunrise_mark"),
    import_switch: t("editor.import_switch"),
    autarky_colours: t("editor.autarky_colours"),
    animate: t("editor.animate"),
    full_from: t("editor.full_from"),
    palette: t("editor.palette"),
    font: t("editor.font"),
    head: t("editor.devices_head"),
    colours: t("editor.devices_colours"),
    consumption: t("editor.consumption"),
    show_forecast: t("editor.show_forecast"),
    compare: t("editor.compare"),
    height: t("editor.chart_height"),
    style: t("editor.style"),
    segments: t("editor.segments"),
    runtime: t("editor.runtime"),
    runtime_window: t("editor.runtime_window"),
    reserve_line: t("editor.reserve_line"),
    percent: t("editor.percent"),
    extra: t("editor.extra"),
    money: t("editor.money"),
    breakdown: t("editor.breakdown"),
    month: t("editor.month"),
    split: t("editor.split"),
    payoff_year: t("editor.payoff_year"),
    investment: t("editor.investment"),
    origin_bar: t("editor.origin_bar"),
    origin_style: t("editor.origin_style"),
    battery_out_today: t("editor.battery_out_today"),
    battery_in_today: t("editor.battery_in_today"),
    curve: t("editor.curve"),
    amortisation: t("editor.amortisation"),
    // The entity picker and the today switch share a name; the switch is the
    // one that needs the longer wording, so it wins where both could apply.
    ...(current?.today ? { amortisation: t("editor.amortisation_corner") } : {}),
    shape: t("editor.card_layout"),
    stats: t("editor.stats"),
    battery_capacity: t("editor.capacity"),
    battery_reserve: t("editor.reserve"),
    capacity: t("editor.capacity"),
    reserve: t("editor.reserve"),
    battery_invert: t("editor.battery_invert"),
    grid_invert: t("editor.grid_invert")
  };

  const helpers: Record<string, string> = {
    extra: t("editor.help_extra"),
    compare: t("editor.help_compare"),
    title: t("editor.help_title"),
    text_scale: t("editor.help_text_scale"),
    chip: t("editor.help_chip"),
    chip_alarm: t("editor.help_chip_alarm"),
    head_price: t("editor.help_head_price"),
    head_sunbar: t("editor.help_head_sunbar"),
    wide_from: t("editor.help_wide_from"),
    night_layout: t("editor.help_night_layout"),
    tap_action: t("editor.help_tap_action"),
    cost_today: t("editor.help_cost_today"),
    cost_export_today: t("editor.help_cost_sides"),
    cost_import_today: t("editor.help_cost_sides"),
    price_import: t("editor.help_price"),
    price_export: t("editor.help_price"),
    caption: t("editor.help_caption"),
    center: t("editor.help_center"),
    center_dark: t("editor.help_center_dark"),
    meter_scope: t("editor.help_meter_scope"),
    meter_today: t("editor.help_meter_today"),
    meter_shows: t("editor.help_meter_shows"),
    meter_dark: t("editor.help_meter_dark"),
    meter_second_dark: t("editor.help_meter_dark"),
    night_dim: t("editor.help_night_dim"),
    size: t("editor.help_size"),
    rings: t("editor.help_ring_style"),
    clock_marks: t("editor.help_clock_marks"),
    import_red: t("editor.help_import_red"),
    night: t("editor.help_night"),
    tap: t("editor.help_tap"),
    sunrise_mark: t("editor.help_sunrise_mark"),
    import_switch: t("editor.help_import_switch"),
    autarky_colours: t("editor.help_autarky_colours"),
    animate: t("editor.help_animate"),
    full_from: t("editor.help_full_from"),
    palette: t("editor.help_palette"),
    font: t("editor.help_font"),
    order: t("editor.help_order"),
    limit: t("editor.help_limit"),
    head: t("editor.help_devices_head"),
    colours: t("editor.help_devices_colours"),
    columns: t("editor.help_columns"),
    forecast_hourly: t("editor.help_forecast_hourly"),
    forecast_bars: t("editor.help_forecast_bars"),
    layers: t("editor.help_layers"),
    best_day: t("editor.help_best_day"),
    curve: t("editor.help_curve"),
    month: t("editor.help_month"),
    split: t("editor.help_split"),
    payoff_year: t("editor.help_payoff_year"),
    investment: t("editor.help_investment"),
    meter_marks: t("editor.help_meter_marks"),
    list: t("editor.help_list"),
    source: t("editor.help_source"),
    mode: t("editor.help_mode"),
    window: t("editor.help_window"),
    group: t("editor.help_group"),
    threshold: t("editor.help_threshold"),
    top: t("editor.help_top"),
    spark: t("editor.help_spark"),
    meter_top: t("editor.help_meter_top"),
    meter_scale: t("editor.help_meter_scale"),
    meter_steps: t("editor.help_meter_steps"),
    meter_scale_draw: t("editor.help_meter_scale_draw"),
    meter_target: t("editor.help_meter_target"),
    house: t("editor.help_house"),
    segments: t("editor.help_segments"),
    origin_style: t("editor.help_origin_style"),
    runtime_window: t("editor.help_runtime")
  };

  for (const name of ["scale", "scale_draw", "target", "steps", "marks", "today"]) {
    labels["meter_second_" + name] = labels["meter_" + name];
    const help = helpers["meter_" + name];
    if (help) helpers["meter_second_" + name] = help;
  }
  labels.meter_second_top = labels.meter_top;
  helpers.meter_second_top = helpers.meter_top;
  labels.meter_second_shows = labels.meter_shows;
  labels.meter_second_style = labels.meter_style;
  labels.meter_second_scope = labels.meter_scope;
  helpers.meter_second_shows = helpers.meter_shows;
  helpers.meter_second_scope = helpers.meter_scope;
  helpers.meter_second_style = helpers.meter_style;
  helpers.meter_drawn = helpers.meter_style;
  helpers.meter_second_drawn = helpers.meter_style;

  for (const name of [
    "scale",
    "scale_draw",
    "target",
    "marks",
    "today"
  ]) {
    const help = helpers["meter_" + name];
    if (help) helpers["meter_second_" + name] = help;
  }

  return {
    schema,
    assertConfig: (config: PowerOriginCardConfig | undefined) => assertConfig(config, locale),
    computeLabel: (item: { name?: string; title?: string }) =>
      (item.name && labels[item.name]) ?? item.title ?? item.name ?? "",
    computeHelper: (item: { name?: string }) => (item.name ? helpers[item.name] : undefined)
  };
}
