import { LitElement, html, nothing, svg } from "lit";
import { batteryView, segmentCount, segments, sunriseReach, type BatteryView } from "./battery";
import { chartBars } from "./bars";
import { CHART_BOX, chartGeometry } from "./chart";
import { CARD_TYPE, resolveConfig, stubConfig } from "./config";
import {
  computeFlow,
  productionSegments,
  ringSegments,
  surplusSegments,
  worthNaming,
  type Flow
} from "./flow";
import { pickFromEnergy, type EnergyPrefs } from "./energy";
import { hourlyShares, worthDrawing, type HourShare } from "./hours";
import { localize } from "./localize";
import { moneyView } from "./money";
import { balanceView, METER_HEIGHT, meterGeometry } from "./meter";
import { buildDaySeries, cachedStatistics, extremes, fetchStatistics } from "./stats";
import { cardStyles } from "./styles";
import { sunTimes } from "./sun";
import type {
  DaySeries,
  MeterStyle,
  HomeAssistant,
  ResolvedConfig,
  PowerOriginCardConfig,
  TodayStat
} from "./types";
import {
  energyKwh,
  formatClock,
  formatEnergy,
  formatMoney,
  formatNumber,
  formatPower,
  localeOf,
  numberOf,
  powerKw,
  stateOf,
  unitOf
} from "./values";

let gradientSeq = 0;

/** Which side of the meter the reading is about, so the column needs no legend. */
const PYLON = html`<svg class="meter-glyph" viewBox="0 0 24 24" aria-hidden="true">
  <path d="M12 3 6.5 21M12 3l5.5 18M8.7 14h6.6M7.6 19h8.8M5 6l7-2 7 2" />
</svg>`;
const CELL = html`<svg class="meter-glyph" viewBox="0 0 24 24" aria-hidden="true">
  <path d="M4.5 8.5h13a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 3 14v-4a1.5 1.5 0 0 1 1.5-1.5zM21 10.8v2.4" />
</svg>`;

const REFRESH_MS = 2 * 60 * 1000;

export class PowerOriginCard extends LitElement {
  static properties = {
    _config: { state: true },
    _series: { state: true },
    _hours: { state: true },
    _error: { state: true }
  };

  static styles = cardStyles;

  private _hass?: HomeAssistant;
  private _config?: ResolvedConfig;
  private _series?: DaySeries;
  private _hours?: HourShare[];
  private _swing?: { up: number; down: number };
  private _earlier?: DaySeries;
  private _socRange?: { low: number; high: number };
  private _error?: string;
  private _lastFetch = 0;
  private _pending = false;
  private _yearPeak?: number;
  private _peakFetched = 0;
  private readonly _fillId = `po-fill-${(gradientSeq += 1)}`;
  private readonly _clipId = `po-clip-${gradientSeq}`;

  static async getConfigElement(): Promise<HTMLElement> {
    const { ensureHaFormLoaded } = await import("./editor");
    await ensureHaFormLoaded();
    return document.createElement(`${CARD_TYPE}-editor`);
  }

  /**
   * What the card starts with when it is dropped on a dashboard. The Energy
   * dashboard is asked first, because it is configured knowledge rather than
   * a guess at a name; the guess only fills what it does not cover.
   */
  static async getStubConfig(hass: HomeAssistant): Promise<PowerOriginCardConfig> {
    const guessed = stubConfig(Object.keys(hass?.states ?? {}));
    try {
      const prefs = await hass.callWS<EnergyPrefs>({ type: "energy/get_prefs" });
      const pick = pickFromEnergy(prefs);
      const known = { ...guessed, entities: { ...guessed.entities, ...pick.entities } };
      if (pick.battery_capacity) known.battery_capacity = pick.battery_capacity;
      return known;
    } catch {
      return guessed;
    }
  }

  setConfig(config: PowerOriginCardConfig): void {
    if (!config?.entities?.house) {
      throw new Error(localize("error.no_house", localeOf(this._hass)));
    }
    this._config = resolveConfig(config);
    this._lastFetch = 0;
  }

  set hass(hass: HomeAssistant) {
    this._hass = hass;
    this.requestUpdate();
    void this._maybeFetch();
  }

  get hass(): HomeAssistant | undefined {
    return this._hass;
  }

  connectedCallback(): void {
    super.connectedCallback();
    // hass may have arrived before the element was in the document, and the
    // fetch declines to run while it is not — so it is picked up here.
    void this._maybeFetch();
  }

  getCardSize(): number {
    const sections = this._config?.sections;
    if (!sections) return 8;
    return (
      1 +
      (sections.ring ? 4 : 0) +
      (sections.chart ? 2 : 0) +
      (sections.battery ? 1 : 0) +
      (sections.today ? 2 : 0)
    );
  }

  private async _maybeFetch(): Promise<void> {
    const hass = this._hass;
    const config = this._config;
    if (!hass || !config || this._pending || !this.isConnected) return;
    const meterNeedsScale = config.ring.meter && config.ring.meter_scale === 0;
    if (
      !config.sections.chart &&
      !config.battery.runtime &&
      !meterNeedsScale &&
      !this._needsPeak()
    ) {
      return;
    }
    if (Date.now() - this._lastFetch < REFRESH_MS) return;

    this._pending = true;
    this._lastFetch = Date.now();

    try {
      const solarId = config.entities.solar;
      const houseId = config.entities.house;
      // Grid and battery ride along in the same query: the hourly views need
      // them, and a second request would cost another recorder scan.
      const gridId = this._needsHours() ? config.entities.grid_power : undefined;
      const cellId = this._needsHours() ? config.entities.battery_power : undefined;
      const socId = config.battery.extra === "range" ? config.entities.battery_soc : undefined;
      const ids = [solarId, houseId, gridId, cellId, socId].filter(Boolean) as string[];
      const stats = await cachedStatistics(
        ids,
        REFRESH_MS,
        () => fetchStatistics(hass, ids),
        "day"
      );
      const divisor = unitOf(stateOf(hass, houseId)).toLowerCase() === "kw" ? 1 : 1000;
      this._series = buildDaySeries(
        (solarId && stats[solarId]) || [],
        stats[houseId] ?? [],
        divisor,
        new Date(),
        config.battery.runtime_window
      );
      // A percentage, so it is read as it comes.
      this._socRange = socId ? extremes(stats[socId] ?? []) : undefined;

      if (gridId && stats[gridId]?.length) {
        let up = 0;
        let down = 0;
        for (const row of stats[gridId]) {
          const value = row.mean;
          if (value === null || value === undefined || !Number.isFinite(value)) continue;
          const kw = value / divisor;
          if (kw > down) down = kw;
          if (-kw > up) up = -kw;
        }
        this._swing = { up, down };
      } else {
        this._swing = undefined;
      }
      this._hours =
        gridId || cellId
          ? hourlyShares(
              stats[houseId] ?? [],
              (gridId && stats[gridId]) || [],
              (cellId && stats[cellId]) || [],
              divisor
            )
          : undefined;
      await this._fetchLastWeek(hass, solarId, houseId, divisor);
      await this._fetchYearPeak(hass, solarId, houseId, divisor);
      this._error = undefined;
    } catch (error) {
      this._error = error instanceof Error ? error.message : String(error);
    } finally {
      this._pending = false;
    }
  }

  /**
   * The meter's full deflection. Taken from the best the roof has managed in a
   * year so the scale is a property of the system, not of today's weather.
   */
  private async _fetchYearPeak(
    hass: HomeAssistant,
    solarId: string | undefined,
    houseId: string,
    divisor: number
  ): Promise<void> {
    if (!this._config?.ring.meter) return;
    if (Date.now() - this._peakFetched < 12 * 60 * 60 * 1000) return;
    this._peakFetched = Date.now();

    const ids = [solarId, houseId].filter(Boolean) as string[];
    if (ids.length === 0) return;

    const response = (await cachedStatistics(
      ids,
      12 * 60 * 60 * 1000,
      () =>
        hass.callWS({
          type: "recorder/statistics_during_period",
          start_time: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
          end_time: new Date().toISOString(),
          statistic_ids: ids,
          period: "month",
          types: ["max"]
        }),
      "year"
    )) as unknown as Record<string, Array<Record<string, unknown>>>;

    const monthlyPeaks = (id: string | undefined) =>
      (id ? (response?.[id] ?? []) : [])
        .map((row) => Number(row.max))
        .filter((value) => Number.isFinite(value) && value > 0);

    const roofPeaks = monthlyPeaks(solarId);
    if (roofPeaks.length > 0) this._yearPeak = Math.max(...roofPeaks) / divisor;

    void houseId;
  }

  private _needsPeak(): boolean {
    return this._config?.today.stats.includes("peak") ?? false;
  }

  private _flow(): Flow | undefined {
    const hass = this._hass;
    const config = this._config;
    if (!hass || !config) return undefined;

    const house = powerKw(stateOf(hass, config.entities.house));
    if (house === undefined) return undefined;

    const rawBattery = powerKw(stateOf(hass, config.entities.battery_power));
    const rawGrid = powerKw(stateOf(hass, config.entities.grid_power));

    return computeFlow({
      house,
      solar: powerKw(stateOf(hass, config.entities.solar)),
      battery:
        rawBattery === undefined ? undefined : config.battery_invert ? -rawBattery : rawBattery,
      grid: rawGrid === undefined ? undefined : config.grid_invert ? -rawGrid : rawGrid
    });
  }

  protected render() {
    const hass = this._hass;
    const config = this._config;
    if (!hass || !config) return nothing;

    const locale = localeOf(hass);
    const flow = this._flow();

    if (!flow) {
      return html`<ha-card>
        <div class="warn">${localize("state.unknown", locale)}</div>
      </ha-card>`;
    }

    const gridfree = !worthNaming(flow.fromGrid, flow.house);
    const showChip = config.chip === "always" || (config.chip === "gridfree" && gridfree);

    return html`
      <ha-card style="--sst-scale: ${config.text_scale}">
        ${config.title || showChip
          ? html`<div class="head ${config.title ? "" : "bare"} ${
              !config.title && config.ring.facts === "none" && config.sections.ring ? "float" : ""
            }">
              ${config.title ? html`<p class="title">${config.title}</p>` : nothing}
              ${showChip
                ? html`<span class="chip ${gridfree ? "gridfree" : "importing"}">
                    ${localize(gridfree ? "state.gridfree" : "state.importing", locale)}
                  </span>`
                : nothing}
            </div>`
          : nothing}
        ${config.sections.ring ? this._renderRing(flow, locale) : nothing}
        ${config.sections.chart ? this._renderChart(locale) : nothing}
        ${config.sections.battery ? this._renderBattery(locale) : nothing}
        ${config.sections.today ? this._renderToday(flow, locale) : nothing}
      </ha-card>
    `;
  }

  private _renderRing(flow: Flow, locale: string) {
    const config = this._config as ResolvedConfig;
    const mode = config.ring.center;
    // A ring about production says nothing before sunrise, so both production
    // views fall back to the source ring rather than showing an empty circle.
    const producing = flow.production > 0.05;
    const dark = !producing && (mode === "surplus" || mode === "production");
    const showAutarky = dark ? config.ring.center_dark === "autarky" : mode === "autarky";
    const showSurplus = mode === "surplus" && producing;
    const showProduction = mode === "production" && producing;

    const parts = showSurplus
      ? surplusSegments(flow)
      : showProduction
        ? productionSegments(flow)
        : ringSegments(flow);
    const single = parts.length === 1;

    // Charging counts as spare here too: switch something on and the battery
    // simply charges more slowly. Anything else would contradict the meter.
    const spare = flow.toGrid + flow.toBattery;
    const centreValue = showSurplus ? spare : showProduction ? flow.production : flow.house;

    const value = showAutarky
      ? formatNumber(flow.autarky * 100, locale, 0)
      : formatPower(centreValue, locale);
    const unit = showAutarky ? "%" : "kW";

    const soleSource =
      parts.length === 1 && !showSurplus && !showProduction && !showAutarky
        ? parts[0].key
        : undefined;

    const captionKey = showAutarky
      ? "ring.caption_autarky"
      : showSurplus
        ? spare > 0.01
          ? "ring.caption_surplus"
          : "ring.no_surplus"
        : showProduction
          ? "ring.caption_production"
          : soleSource === "battery"
            ? "ring.source_battery"
            : soleSource === "grid"
              ? "ring.source_grid"
              : soleSource === "solar"
                ? "ring.source_solar"
                : "ring.caption_house";

    const caption = config.ring.caption ? localize(captionKey, locale) : undefined;

    // The outer ring answers the same question over the whole day, in the same
    // colours. Only the window differs, so the two cannot contradict each other.
    const clock = config.ring.rings === "clock" ? this._hours : undefined;
    const asClock = clock !== undefined && worthDrawing(clock);

    const wantsOuter = config.ring.rings === "double";
    let outer: Array<{ colour: string; length: number; offset: number; faint?: boolean }> = [];

    if (wantsOuter && (showProduction || showSurplus)) {
      const hass = this._hass as HomeAssistant;
      const produced = energyKwh(stateOf(hass, config.entities.solar_today)) ?? 0;
      const expected = config.chart.show_forecast
        ? (energyKwh(stateOf(hass, config.entities.forecast)) ?? 0)
        : 0;
      const whole = produced + expected;
      if (whole > 0) {
        outer = [
          { colour: "var(--sst-sun)", length: (produced / whole) * 100, offset: 0 },
          {
            colour: "var(--sst-sun)",
            length: (expected / whole) * 100,
            offset: (produced / whole) * 100,
            faint: true
          }
        ].filter((segment) => segment.length > 0.5);
      }
    } else if (wantsOuter) {
      const day = this._dayOrigin();
      if (day) {
        let offset = 0;
        outer = day.parts.map((part) => {
          const length = (part.value / day.used) * 100;
          const segment = { colour: part.colour, length, offset };
          offset += length;
          return segment;
        });
      }
    }

    return html`
      <div class="ring-block ${config.ring.layout}">
        <div class="ring-group size-${config.ring.size} ${config.ring.facts === "none" ? "solo" : ""}">
        ${this._renderMeter(flow, locale)}
        <svg class="ring ${showSurplus ? "surplus" : ""}" viewBox="0 0 200 200" role="img" aria-label="${value} ${unit}">
          ${outer.length
            ? svg`<circle class="ring-day-track" cx="100" cy="100" r="93" pathLength="100"></circle>
                ${outer.map(
                  (segment) => svg`<circle
                    class="ring-day ${segment.faint ? "faint" : ""}"
                    cx="100" cy="100" r="93" pathLength="100"
                    stroke="${segment.colour}"
                    stroke-dasharray="${segment.length.toFixed(2)} 100"
                    stroke-dashoffset="${(-segment.offset).toFixed(2)}"
                    transform="rotate(-90 100 100)"
                  ></circle>`
                )}`
            : nothing}
          <circle class="ring-track" cx="100" cy="100" r="76" pathLength="100"></circle>
          ${asClock
            ? clock!.map(
                (entry) => svg`<circle
                  class="clock-hour ${entry.dominant ?? "empty"}"
                  cx="100" cy="100" r="76" pathLength="100"
                  stroke-dasharray="${(100 / 24 - 0.35).toFixed(2)} 100"
                  stroke-dashoffset="${(-(entry.hour * 100) / 24).toFixed(2)}"
                  transform="rotate(90 100 100)"
                ></circle>`
              )
            : nothing}
          ${asClock ? nothing : parts.map(
            (part) => svg`
              <circle
                class="seg ${part.key} ${single ? "single" : ""}"
                cx="100" cy="100" r="76" pathLength="100"
                stroke-dasharray="${part.length.toFixed(2)} 100"
                stroke-dashoffset="${(-part.offset).toFixed(2)}"
                transform="rotate(-90 100 100)"
              ></circle>`
          )}
          ${asClock
            ? svg`<circle class="clock-now" cx="100" cy="176" r="4.5"
                transform="rotate(${((clock!.at(-1)!.hour + 0.5) * 15).toFixed(1)} 100 100)"
              ></circle>`
            : nothing}
          ${asClock && config.ring.clock_marks
            ? svg`
              <g class="clock-mark sun" transform="translate(100 8.5)">
                <circle cx="0" cy="0" r="2.7"></circle>
                <path d="M0,-6.2 L0,-4.6 M0,4.6 L0,6.2 M-6.2,0 L-4.6,0 M4.6,0 L6.2,0
                         M-4.4,-4.4 L-3.3,-3.3 M3.3,3.3 L4.4,4.4 M4.4,-4.4 L3.3,-3.3
                         M-3.3,3.3 L-4.4,4.4"></path>
              </g>
              <path class="clock-mark moon"
                    d="M100,188 a5.2,5.2 0 1,0 4.7,-3 a4,4 0 1,1 -4.7,3 z"></path>`
            : nothing}
          ${config.ring.inner === "load"
            ? svg`<path class="ring-curve" d="${this._innerCurve() ?? ""}"></path>`
            : nothing}
          ${config.ring.inner !== "icon"
            ? nothing
            : svg`<path
            class="ring-mark"
            transform="${
              showSurplus || showProduction
                ? "translate(40 40) scale(5)"
                : "translate(40 42.5) scale(5)"
            }"
            d="${
              showSurplus
                ? "M7,2V13H10V22L17,10H13L17,2H7Z"
                : showProduction
                  ? "M12,7A5,5 0 0,0 7,12A5,5 0 0,0 12,17A5,5 0 0,0 17,12A5,5 0 0,0 12,7M12,2L14.39,5.42C13.65,5.15 12.84,5 12,5C11.16,5 10.35,5.15 9.61,5.42L12,2M3.34,7L7.5,6.65C6.9,7.16 6.36,7.78 5.94,8.5C5.5,9.24 5.25,10 5.11,10.79L3.34,7M3.36,17L5.12,13.23C5.26,14 5.53,14.77 5.95,15.5C6.37,16.2 6.91,16.81 7.5,17.31L3.36,17M20.65,7L18.88,10.79C18.74,10 18.47,9.23 18.05,8.5C17.63,7.78 17.1,7.15 16.5,6.64L20.65,7M20.64,17L16.5,17.35C17.09,16.85 17.62,16.22 18.04,15.5C18.46,14.77 18.73,14 18.87,13.22L20.64,17M12,22L9.59,18.56C10.33,18.83 11.14,19 12,19C12.82,19 13.63,18.83 14.37,18.56L12,22Z"
                  : "M10,20V14H14V20H19V12H22L12,3L2,12H5V20H10Z"
            }"
          ></path>`}
          ${(() => {
            const source = showSurplus || showProduction
              ? config.entities.solar
              : config.entities.house;
            const on = source && (this._hass as HomeAssistant)?.states?.[source];
            const handlers = on ? this._tap(source!) : undefined;
            return svg`<text class="ring-value ${on ? "tap" : ""}" x="100"
              y="${caption ? 104 : 112}" text-anchor="middle"
              @click=${handlers?.click} @keydown=${handlers?.key}
              tabindex="${on ? 0 : -1}"
              >${value}<tspan dx="5">${unit}</tspan></text>`;
          })()}
          ${
            caption
              ? svg`<text class="ring-caption" x="100" y="126" text-anchor="middle">${caption}</text>`
              : nothing
          }

        </svg>
        ${config.ring.meter_second === "none"
          ? nothing
          : this._renderMeter(flow, locale, config.ring.meter_second)}
        </div>
        ${this._renderLegend(flow, locale)}
      </div>
    `;
  }

  /**
   * Surplus climbs, grid draw sinks. A ring can show proportions but never a
   * direction, and the direction is what tells you whether to switch something on.
   */
  /**
   * The same weekday a week ago. A second query of a recorder that may hold
   * years, so it only runs when the comparison is switched on.
   */
  private async _fetchLastWeek(
    hass: HomeAssistant,
    solarId: string | undefined,
    houseId: string,
    divisor: number
  ): Promise<void> {
    const config = this._config as ResolvedConfig;
    if (!config.chart.compare || !solarId) {
      this._earlier = undefined;
      return;
    }

    const week = 7 * 24 * 60 * 60 * 1000;
    const then = new Date(Date.now() - week);
    const ids = [solarId, houseId];

    const stats = await cachedStatistics(
      ids,
      60 * 60 * 1000,
      () => fetchStatistics(hass, ids, then),
      "week"
    );

    const series = buildDaySeries(stats[solarId] ?? [], stats[houseId] ?? [], divisor, then);
    this._earlier = series;
  }

  /** Whether any of the day views is switched on, and the extra series worth fetching. */
  private _needsHours(): boolean {
    const config = this._config;
    if (!config) return false;
    return (
      config.ring.rings === "clock" ||
      config.ring.meter_style === "day" ||
      config.ring.meter_second === "day" ||
      config.ring.meter_today ||
      (config.today.origin_bar && config.today.origin_style === "band")
    );
  }

  /** The day as a vertical strip: one band per hour, coloured by what carried it. */
  private _renderDayColumn(locale: string) {
    const hours = this._hours;
    if (!hours || !worthDrawing(hours)) return nothing;

    const band = METER_HEIGHT / 24;
    const nowHour = hours.at(-1)!.hour;

    return html`
      <div class="meter-block">
        <svg class="meter" viewBox="0 0 88 ${METER_HEIGHT}" role="img"
             aria-label="${localize("meter.day", locale)}">
          ${hours.map((hour) => {
            const y = hour.hour * band;
            const key = hour.dominant;
            return svg`<rect
              class="day-band ${key ?? "empty"}"
              x="6" y="${(y + 0.7).toFixed(1)}" width="76"
              height="${(band - 1.4).toFixed(1)}" rx="2"
            ></rect>`;
          })}
          <line class="day-now" x1="2" y1="${((nowHour + 1) * band).toFixed(1)}"
                x2="86" y2="${((nowHour + 1) * band).toFixed(1)}"></line>
        </svg>
        <div class="meter-label idle">
          <span class="meter-word">${localize("meter.day", locale)}</span>
        </div>
      </div>
    `;
  }

  /** Roof against house, side by side on one scale. */
  private _renderBalance(flow: Flow, locale: string) {
    const config = this._config as ResolvedConfig;
    const view = balanceView(
      flow.production,
      flow.house,
      config.ring.meter_scale,
      this._yearPeak ?? this._series?.solarPeak ?? 0
    );

    const covered = view.spare >= 0;
    const amount = Math.abs(view.spare);
    const word = localize(covered ? "meter.spare" : "meter.short", locale);
    const bar = (x: number, share: number) => ({
      x,
      y: METER_HEIGHT * (1 - share),
      height: Math.max(1, METER_HEIGHT * share)
    });
    const roof = bar(8, view.production);
    const load = bar(48, view.house);

    return html`
      <div class="meter-block">
        <svg class="meter" viewBox="0 0 88 ${METER_HEIGHT}" role="img"
             aria-label="${localize("meter.balance", locale)}">
          <rect class="bal-track" x="8" y="0" width="32" height="${METER_HEIGHT}" rx="5"></rect>
          <rect class="bal-track" x="48" y="0" width="32" height="${METER_HEIGHT}" rx="5"></rect>
          <rect class="bal-roof" x="8" y="${roof.y.toFixed(1)}" width="32"
                height="${roof.height.toFixed(1)}" rx="5"></rect>
          <rect class="bal-house" x="48" y="${load.y.toFixed(1)}" width="32"
                height="${load.height.toFixed(1)}" rx="5"></rect>
        </svg>
        <div class="meter-label ${covered ? "up" : "down"}">
          <span class="meter-value">${formatPower(amount, locale)} <small>kW</small></span>
          <span class="meter-word">${word}</span>
        </div>
      </div>
    `;
  }

  /** The house's own day, drawn inside the ring where the symbol used to sit. */
  private _innerCurve(): string | undefined {
    const series = this._series;
    if (!series || series.house.length < 4) return undefined;

    const values = series.house.filter((value) => Number.isFinite(value));
    const top = Math.max(...values, 0.001);
    const left = 44;
    const right = 156;
    const base = 132;
    const height = 46;
    const last = series.house.length - 1;

    const points = series.house.map((value, index) => {
      const x = left + ((right - left) * index) / last;
      const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
      return [x, base - (safe / top) * height] as const;
    });

    return points
      .map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
      .join(" ");
  }

  /**
   * Home Assistant's own dialog, opened the way every other card opens it.
   * A figure that comes from one entity should be a way to that entity; a
   * figure the card works out itself is not, and stays plain.
   */
  private _moreInfo(entityId: string): void {
    const action = (this._config as ResolvedConfig).tap_action;

    if (action.action === "none") return;

    if (action.action === "more-info") {
      this.dispatchEvent(new CustomEvent("hass-more-info", {
        detail: { entityId: action.entity ?? entityId },
        bubbles: true,
        composed: true
      }));
      return;
    }

    // Everything else is Lovelace's own vocabulary; the frontend performs it,
    // so a navigation or a service call behaves exactly as on any other card.
    this.dispatchEvent(new CustomEvent("ll-custom", {
      detail: { ...action, entity: action.entity ?? entityId },
      bubbles: true,
      composed: true
    }));

    if (action.action === "navigate" && action.navigation_path) {
      history.pushState(null, "", action.navigation_path);
      this.dispatchEvent(new CustomEvent("location-changed", { bubbles: true, composed: true }));
    }

    if (action.action === "url" && action.url_path) {
      window.open(action.url_path, "_blank", "noreferrer");
    }
  }

  private _tap(entityId: string) {
    return {
      click: (event: Event) => {
        event.stopPropagation();
        this._moreInfo(entityId);
      },
      key: (event: KeyboardEvent) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        this._moreInfo(entityId);
      }
    };
  }

  /** Wraps a figure so it opens its entity, or leaves it alone when it has none. */
  private _linked(entityId: string | undefined, content: unknown) {
    if (!entityId || !(this._hass as HomeAssistant)?.states?.[entityId]) return content;
    const handlers = this._tap(entityId);
    return html`<span class="tap" role="button" tabindex="0"
      @click=${handlers.click} @keydown=${handlers.key}>${content}</span>`;
  }

  private _renderMeter(flow: Flow, locale: string, override?: MeterStyle) {
    const config = this._config as ResolvedConfig;
    if (!config.ring.meter) return nothing;
    const style = override ?? config.ring.meter_style;
    if (style === "day") return this._renderDayColumn(locale);
    if (style === "balance") return this._renderBalance(flow, locale);

    // Without a solar sensor there can never be a surplus, and the draw is the
    // house load the ring already prints. Nothing of its own to say.
    if (!config.entities.solar) return nothing;

    // Grid scope keeps the column on the meter itself, so the ring can name the
    // battery without the two saying the same thing twice.
    const scope = override ? config.ring.meter_second_scope : config.ring.meter_scope;
    const withBattery = scope === "all";
    const meter = meterGeometry(
      {
        toBattery: withBattery ? flow.toBattery : 0,
        toGrid: flow.toGrid,
        fromGrid: flow.fromGrid,
        fromBattery: withBattery ? flow.fromBattery : 0
      },
      config.ring.meter_scale,
      this._yearPeak ?? this._series?.solarPeak ?? 0,
      config.ring.meter_target,
      config.ring.meter_scale_draw,
      0,
      config.ring.meter_steps
    );

    const label = `${localize("flow.to_grid", locale)} ${formatPower(flow.toGrid, locale)} kW, ` +
      `${localize("flow.from_grid", locale)} ${formatPower(flow.fromGrid, locale)} kW`;

    // A hundredth of a kilowatt is the meter breathing, not a flow. Naming it
    // invites a decision about nothing.
    const REAL = 0.05;
    const exporting = flow.toGrid > REAL;
    const charging = withBattery && flow.toBattery > REAL;
    const drawing = meter.deficit > REAL;
    const quiet = !drawing && !exporting && !charging;

    const gridDraw = flow.fromGrid > REAL;
    const cellDraw = withBattery && flow.fromBattery > REAL;

    const key = drawing
      ? gridDraw && cellDraw
        ? "meter.draw"
        : cellDraw
          ? "flow.from_battery"
          : "meter.import"
      : exporting && charging
        ? "meter.surplus"
        : exporting
          ? "meter.export"
          : charging
            ? "meter.charging"
            : withBattery
              ? "meter.balanced"
              : "meter.quiet";

    const word = localize(key, locale);
    const amount = drawing ? meter.deficit : meter.surplus;
    const tone = drawing ? "down" : exporting || charging ? "up" : "idle";

    return html`
      <div class="meter-block">
      <svg class="meter" role="img" aria-label="${label}"
           viewBox="${config.ring.meter_marks ? `-8 -18 104 ${METER_HEIGHT + 36}` : `0 0 88 ${METER_HEIGHT}`}">
        ${config.ring.meter_marks
          ? svg`
            <path class="meter-mark" d="M38,-6 L44,-13 L50,-6"></path>
            <path class="meter-mark" d="M38,${METER_HEIGHT + 6} L44,${METER_HEIGHT + 13} L50,${METER_HEIGHT + 6}"></path>`
          : nothing}
        ${
          style === "blocks"
            ? meter.segments.map(
                (segment) => svg`
                  <rect class="meter-off" x="4" y="${segment.y}" width="80"
                        height="${segment.height}" rx="3"></rect>
                  ${segment.fills.map(
                    (fill) => svg`<rect
                      class="meter-on ${fill.key} ${
                        meter.belowTarget && segment.direction === "up" ? "held" : ""
                      }"
                      x="4"
                      y="${
                        segment.direction === "up"
                          ? segment.y + segment.height * (1 - fill.offset - fill.size)
                          : segment.y + segment.height * fill.offset
                      }"
                      width="80"
                      height="${segment.height * fill.size}"
                      rx="3"
                    ></rect>`
                  )}`
              )
            : svg`
                <defs>
                  ${
                    meter.up
                      ? svg`<clipPath id="${this._clipId}-up">
                          <rect x="4" y="${meter.up.y}" width="80"
                                height="${meter.up.height}" rx="8"></rect>
                        </clipPath>`
                      : nothing
                  }
                  ${
                    meter.down
                      ? svg`<clipPath id="${this._clipId}-down">
                          <rect x="4" y="${meter.down.y}" width="80"
                                height="${meter.down.height}" rx="8"></rect>
                        </clipPath>`
                      : nothing
                  }
                </defs>
                ${["up", "down"].map((side) =>
                  svg`<g clip-path="url(#${this._clipId}-${side})">
                    ${meter.bands
                      .filter((band) => (side === "up") === band.y < 100)
                      .map(
                        (band) => svg`<rect
                          class="meter-band ${band.key} ${
                            meter.belowTarget && side === "up" ? "held" : ""
                          }"
                          x="4" y="${band.y}" width="80" height="${band.height}"
                        ></rect>`
                      )}
                  </g>`
                )}`
        }
        ${config.ring.meter_today && this._swing
          ? svg`
            ${this._swing.up > 0.05
              ? svg`<rect class="meter-swing up" x="4"
                  y="${(METER_HEIGHT / 2 - (Math.min(1, this._swing.up / meter.scale) * METER_HEIGHT) / 2).toFixed(1)}"
                  width="80"
                  height="${((Math.min(1, this._swing.up / meter.scale) * METER_HEIGHT) / 2).toFixed(1)}"
                  rx="6"></rect>`
              : nothing}
            ${this._swing.down > 0.05
              ? svg`<rect class="meter-swing down" x="4" y="${METER_HEIGHT / 2}"
                  width="80"
                  height="${((Math.min(1, this._swing.down / meter.scaleDown) * METER_HEIGHT) / 2).toFixed(1)}"
                  rx="6"></rect>`
              : nothing}`
          : nothing}
        <line class="meter-zero" x1="1" y1="${METER_HEIGHT / 2}" x2="87"
              y2="${METER_HEIGHT / 2}"></line>
      </svg>
      <div class="meter-label ${tone}">
        ${quiet
          ? nothing
          : html`<span class="meter-value">${formatPower(amount, locale)} <small>kW</small></span>`}
        <span class="meter-word">${(charging && !exporting) || (cellDraw && !gridDraw) ? CELL : PYLON}${word}</span>
      </div>
      </div>
    `;
  }

  private _renderLegend(flow: Flow, locale: string) {
    const config = this._config as ResolvedConfig;

    const style = config.ring.facts;
    if (style === "none") return nothing;

    // Everything in motion right now. Inflow and outflow are the same total,
    // so this reduces to the production on a sunny day and to the house load
    // at night — one denominator that never leaves a bar unanchored.
    const whole =
      flow.fromSolar + flow.fromBattery + flow.fromGrid + flow.toBattery + flow.toGrid;

    const rows: Array<{
      colour: string;
      label: string;
      value: string;
      unit: string;
      share?: number;
    }> = [];
    const add = (colour: string, key: string, value: number, unit: string) => {
      if (worthNaming(value, whole)) {
        rows.push({
          colour,
          label: localize(key, locale),
          value: formatPower(value, locale),
          unit,
          share: value
        });
      }
    };

    const mode = config.ring.center;
    const producing = flow.production > 0.05;
    const ringShowsDestinations = producing && (mode === "production" || mode === "surplus");

    if (ringShowsDestinations) {
      // In surplus mode the free part is the centre figure, not a row.
      add("var(--sst-sun)", "flow.to_house", flow.fromSolar, "kW");
      add("var(--sst-leaf)", "flow.to_battery", flow.toBattery, "kW");
      if (mode === "production") {
        add("var(--sst-grid)", "flow.to_grid", flow.toGrid, "kW");
      }
    } else if (producing) {
      add("var(--sst-leaf)", "flow.to_battery", flow.toBattery, "kW");
      add("var(--sst-grid)", "flow.to_grid", flow.toGrid, "kW");
    } else {
      // Nothing is being produced, so the sources are the whole story.
      add("var(--sst-leaf)", "flow.from_battery", flow.fromBattery, "kW");
      add("var(--sst-grid)", "flow.from_grid", flow.fromGrid, "kW");
    }

    // Whatever the mode, a house drawing from the battery or the grid must
    // never be silent about it.
    if (producing) {
      add("var(--sst-leaf)", "flow.from_battery", flow.fromBattery, "kW");
      add("var(--sst-grid)", "flow.from_grid", flow.fromGrid, "kW");
    }

    if (rows.length === 0) return nothing;

    const largest = Math.max(0.001, whole);

    return html`
      <div class="facts ${style === "inline" ? "inline" : ""}">
        ${rows.map(
          (row) => html`
            <div class="fact">
              ${
                style === "bars" && row.share !== undefined
                  ? html`<span
                      class="bar"
                      style="width: ${((row.share / largest) * 100).toFixed(1)}%; background: ${row.colour}"
                    ></span>`
                  : nothing
              }
              <i style="background: ${row.colour}"></i>
              <span class="fact-label">${row.label}</span>
              <span class="fact-value"
                >${row.value} <span class="fact-unit">${row.unit}</span></span
              >
            </div>
          `
        )}
      </div>
    `;
  }

  /** Last week's roof resampled onto as many points as today has so far. */
  private _earlierSolar(points: number): number[] {
    const earlier = this._earlier;
    if (!earlier || points < 2 || earlier.solar.length < 2) return [];
    const out: number[] = [];
    for (let index = 0; index < points; index += 1) {
      const at = Math.round((index / (points - 1)) * (earlier.solar.length - 1));
      const value = earlier.solar[at];
      out.push(Number.isFinite(value) ? value : 0);
    }
    return out;
  }

  private _renderChart(locale: string) {
    const hass = this._hass as HomeAssistant;
    const config = this._config as ResolvedConfig;
    const series = this._series;
    const solarNow = powerKw(stateOf(hass, config.entities.solar));

    const box = { ...CHART_BOX, height: config.chart.height };
    const times = sunTimes(stateOf(hass, "sun.sun"));
    const dayStart = times.rising?.getTime() ?? series?.timestamps[0];
    const dayEnd = times.setting?.getTime() ?? series?.timestamps.at(-1);

    // Clip to the solar day so the axis labels describe what is actually drawn.
    const inDay =
      series && dayStart !== undefined && dayEnd !== undefined
        ? series.timestamps
            .map((timestamp, index) => ({ timestamp, index }))
            .filter((point) => point.timestamp >= dayStart && point.timestamp <= dayEnd)
        : [];

    const asBars = config.chart.style === "bars";

    const barGeometry =
      series && asBars && inDay.length > 1 && dayStart !== undefined && dayEnd !== undefined
        ? chartBars(
            inDay.map((point) => point.timestamp),
            inDay.map((point) => series.solar[point.index]),
            config.chart.consumption ? inDay.map((point) => series.house[point.index]) : [],
            { start: dayStart, end: dayEnd },
            box,
            this._earlierSolar(inDay.length)
          )
        : undefined;

    const geometry =
      series && !asBars && inDay.length > 1 && dayStart !== undefined && dayEnd !== undefined
        ? chartGeometry(
            inDay.map((point) => point.timestamp),
            inDay.map((point) => series.solar[point.index]),
            config.chart.consumption ? inDay.map((point) => series.house[point.index]) : [],
            { start: dayStart, end: dayEnd },
            box,
            this._earlierSolar(inDay.length)
          )
        : undefined;

    const drawn =
      (geometry?.area?.length ?? 0) > 0 ||
      (barGeometry?.bars.length ?? 0) > 0;
    const shapeless =
      !drawn ||
      (geometry === undefined && barGeometry === undefined) ||
      inDay.every((point) => (series?.solar[point.index] ?? 0) < 0.05);

    const nowX = geometry?.nowX ?? barGeometry?.nowX;
    const nowLabel =
      nowX !== undefined && nowX > box.padding + 34 && nowX < box.width - box.padding - 34
        ? nowX
        : undefined;
    const produced = energyKwh(stateOf(hass, config.entities.solar_today));
    const used = energyKwh(stateOf(hass, config.entities.house_today));
    // After sunset "0.0 expected" states the obvious and costs a line.
    const forecastValue = config.chart.show_forecast
      ? energyKwh(stateOf(hass, config.entities.forecast))
      : undefined;
    const forecast = forecastValue !== undefined && forecastValue >= 0.05 ? forecastValue : undefined;

    const note = [
      produced !== undefined
        ? html`<span class="key-solar">${formatEnergy(produced, locale)}
            ${localize("chart.produced", locale)}</span>`
        : nothing,
      used !== undefined
        ? html` · <span class="key-house">${formatEnergy(used, locale)}
            ${localize("chart.consumed", locale)}</span>`
        : nothing,
      forecast !== undefined
        ? html` · ${formatEnergy(forecast, locale)}
            <span class="dim">${localize("chart.forecast", locale)}</span>`
        : nothing
    ];

    return html`
      <div class="row">
        <div class="row-head">
          <span class="row-title">${localize("chart.title", locale)}</span>
          ${solarNow === undefined
            ? nothing
            : this._linked(
                config.entities.solar,
                html`<span class="row-note key-solar"
                  ><span class="dim">${localize("chart.now", locale)}</span>
                  ${formatPower(solarNow, locale)} <span class="unit">kW</span></span
                >`
              )}
        </div>
        ${this._error ? html`<div class="row-note dim">${this._error}</div>` : nothing}
        ${shapeless
          ? nothing
          : geometry || barGeometry
          ? html`
            <svg class="full chart" viewBox="0 0 ${box.width} ${box.height + 20}"
                 role="img" aria-label="${localize("chart.title", locale)}">
              ${
                (geometry?.tick ?? barGeometry?.tick)
                  ? svg`
                    <line class="gridline" x1="${box.padding}"
                          y1="${(geometry?.tick ?? barGeometry?.tick)!.y}"
                          x2="${box.width - box.padding}"
                          y2="${(geometry?.tick ?? barGeometry?.tick)!.y}"></line>
                    <text class="gridlabel" x="0"
                          y="${(geometry?.tick ?? barGeometry?.tick)!.y - 3}"
                      >${formatNumber(
                        (geometry?.tick ?? barGeometry?.tick)!.value,
                        locale,
                        (geometry?.tick ?? barGeometry?.tick)!.value % 1 === 0 ? 0 : 1
                      )} kW</text>`
                  : nothing
              }
              <defs>
                <linearGradient id="${this._fillId}" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="var(--sst-sun)" stop-opacity="0.28"></stop>
                  <stop offset="100%" stop-color="var(--sst-sun)" stop-opacity="0.02"></stop>
                </linearGradient>
              </defs>
              ${
                geometry?.area
                  ? svg`<path class="prod-area graded" fill="url(#${this._fillId})"
                              d="${geometry.area}"></path>`
                  : nothing
              }
              ${(geometry?.earlier ?? barGeometry?.earlier)
                ? svg`<path class="earlier-line" d="${geometry?.earlier ?? barGeometry?.earlier}"></path>`
                : nothing}
              ${geometry?.solar ? svg`<path class="prod-line" d="${geometry.solar}"></path>` : nothing}
              ${
                barGeometry
                  ? barGeometry.bars.map(
                      (bar) => svg`<rect class="prod-bar" x="${bar.x.toFixed(1)}"
                                        y="${bar.y.toFixed(1)}" width="${bar.width.toFixed(1)}"
                                        height="${bar.height.toFixed(1)}" rx="2"></rect>`
                    )
                  : nothing
              }
              ${
                (geometry?.house ?? barGeometry?.house)
                  ? svg`<path class="cons-line" d="${geometry?.house ?? barGeometry?.house}"></path>`
                  : nothing
              }
              ${
                nowX !== undefined
                  ? svg`
                    <line class="nowline" x1="${nowX}" y1="4"
                          x2="${nowX}" y2="${box.height}"></line>
                    ${
                      geometry?.nowY !== undefined
                        ? svg`<circle cx="${nowX}" cy="${geometry.nowY}" r="4.5"
                                     fill="var(--sst-sun)"></circle>`
                        : nothing
                    }`
                  : nothing
              }
              ${
                dayStart !== undefined
                  ? svg`<text class="axis" x="0" y="${box.height + 16}"
                          >${formatClock(new Date(dayStart), locale)}</text>`
                  : nothing
              }
              ${
                nowLabel !== undefined
                  ? svg`<text class="axis" x="${nowLabel}" y="${box.height + 16}"
                              text-anchor="middle">${localize("chart.now", locale)}</text>`
                  : nothing
              }
              ${
                dayEnd !== undefined
                  ? svg`<text class="axis" x="${box.width}" y="${box.height + 16}"
                              text-anchor="end">${formatClock(new Date(dayEnd), locale)}</text>`
                  : nothing
              }
            </svg>`
          : nothing}
        <div class="row-note">${note}</div>
      </div>
    `;
  }

  private _renderBattery(locale: string) {
    const hass = this._hass as HomeAssistant;
    const config = this._config as ResolvedConfig;
    const soc = numberOf(stateOf(hass, config.entities.battery_soc));
    if (soc === undefined) return nothing;

    const rawPower = powerKw(stateOf(hass, config.entities.battery_power));
    const power =
      rawPower === undefined ? undefined : config.battery_invert ? -rawPower : rawPower;

    const view = batteryView({
      soc,
      power,
      capacity: config.battery_capacity || undefined,
      reserve: config.battery_reserve,
      averageLoad: this._series?.houseAverage,
      loadSpread: this._series?.houseSpread
    });

    if (!config.battery.runtime) {
      view.hours = undefined;
      view.at = undefined;
    }

    const tone =
      view.mode === "charging"
        ? "fill-sun"
        : soc <= config.battery_reserve + 5
          ? "fill-grid"
          : "fill-leaf";

    return html`
      <div class="row">
        <div class="row-head">
          <span class="row-title"
            >${localize("battery.title", locale)}${config.battery.percent
              ? html`<span class="row-pct"
                  >${this._linked(
                    config.entities.battery_soc,
                    html`${formatNumber(soc, locale, 0)} %`
                  )}</span
                >`
              : nothing}</span
          >
          ${config.battery_capacity
            ? html`<span class="row-note"
                >${formatNumber(config.battery_capacity / 1000, locale, 1)}
                <span class="dim">kWh</span></span
              >`
            : nothing}
        </div>
        ${this._renderBatterySvg(soc, tone, locale)}
        <div class="row-note">${this._renderBatteryNote(view, locale)}</div>
      </div>
    `;
  }

  /**
   * The second figure beside the bar. Everything but the range is worked out
   * from readings the card already holds, so only that one costs a query.
   */
  private _batteryExtra(locale: string): { value: string; label: string } | undefined {
    const config = this._config as ResolvedConfig;
    const hass = this._hass as HomeAssistant;
    const given = energyKwh(stateOf(hass, config.entities.battery_out_today));

    switch (config.battery.extra) {
      case "range": {
        const range = this._socRange;
        if (!range) return undefined;
        return {
          value: `${formatNumber(range.low, locale, 0)}\u2013${formatNumber(range.high, locale, 0)} %`,
          label: localize("battery.range", locale)
        };
      }
      case "cycles": {
        const usable = config.battery_capacity / 1000;
        if (given === undefined || usable <= 0) return undefined;
        return {
          value: formatNumber(given / usable, locale, 1),
          label: localize("battery.cycles", locale)
        };
      }
      case "saved": {
        const price = numberOf(stateOf(hass, config.entities.price_import));
        if (given === undefined || price === undefined) return undefined;
        return {
          value: formatMoney(given * price, locale),
          label: localize("battery.saved", locale)
        };
      }
      case "given": {
        if (given === undefined) return undefined;
        return {
          value: `${formatEnergy(given, locale)} kWh`,
          label: localize("battery.given", locale)
        };
      }
      default:
        return undefined;
    }
  }

  private _renderBatterySvg(soc: number, tone: string, locale: string) {
    const config = this._config as ResolvedConfig;
    const bare = config.battery.style === "bar";

    const extra = this._batteryExtra(locale);

    // Without a casing the bar may use the width the cap would have taken.
    const shellW = extra ? (bare ? 236 : 228) : bare ? 259 : 248;
    const innerStart = bare ? 0 : 6;
    const innerWidth = bare ? shellW : shellW - 10;
    const top = bare ? 12 : 8;
    const tall = bare ? 28 : 36;
    const radius = bare ? 4 : 6;

    const reserve =
      config.battery.reserve_line && config.battery_reserve > 0 && config.battery_reserve < 100
        ? config.battery_reserve
        : 0;

    const body =
      config.battery.style === "solid"
        ? svg`<rect class="bat-fill ${tone}" x="${innerStart - 1}" y="${top}" rx="8"
                    width="${((innerWidth + 2) * Math.min(100, Math.max(0, soc))) / 100}"
                    height="${tall}"></rect>`
        : segments(soc, segmentCount(config.battery.segments, config.battery_capacity)).map(
            (segment, index, all) => {
            const pitch = innerWidth / all.length;
            const width = pitch - (bare ? 4 : 3.1);
            const x = innerStart + index * pitch;
            // Held back: full of power, none of it available.
            const held = reserve > 0 && ((index + 1) / all.length) * 100 <= reserve;
            return svg`
              <rect class="fill-off" x="${x}" y="${top}" width="${width}"
                    height="${tall}" rx="${radius}"></rect>
              ${
                segment.fill > 0
                  ? svg`<rect class="bat-fill ${tone} ${held ? "held" : ""}" x="${x}" y="${top}"
                              width="${Math.max(3, width * segment.fill)}" height="${tall}"
                              rx="${radius}"></rect>`
                  : nothing
              }`;
            }
          );

    return html`
      <svg class="full" viewBox="0 0 340 54" role="img"
           aria-label="${localize("battery.title", locale)} ${formatNumber(soc, locale, 0)} %">
        ${
          bare
            ? nothing
            : svg`
              <rect class="bat-shell" x="1" y="5" width="${shellW}" height="42" rx="12"></rect>
              <rect class="bat-cap" x="${shellW + 4}" y="18" width="7" height="16" rx="3"></rect>`
        }
        ${body}
        ${reserve > 0 && config.battery.style === "solid"
          ? svg`<rect class="bat-held" x="${innerStart - 1}" y="${top}" rx="8"
                  width="${((innerWidth + 2) * Math.min(reserve, Math.max(0, soc))) / 100}"
                  height="${tall}"></rect>`
          : nothing}
        ${extra
          ? svg`
            <text class="bat-extra" x="340" y="${top + 12}" text-anchor="end"
              >${extra.value}</text>
            <text class="bat-extra-k" x="340" y="${top + 26}" text-anchor="end"
              >${extra.label}</text>`
          : nothing}

      </svg>`;
  }

  private _renderBatteryNote(view: BatteryView, locale: string) {
    const parts: string[] = [];

    const stored =
      view.availableKwh === undefined
        ? undefined
        : `${formatNumber(view.availableKwh, locale, 1)} kWh ${localize("battery.stored", locale)}`;

    if (view.mode === "charging") {
      if (view.at) parts.push(`${localize("battery.full_at", locale)} ${formatClock(view.at, locale)}`);
      if (view.power !== undefined) {
        parts.push(
          `${localize("battery.charging", locale)} ${formatPower(Math.abs(view.power), locale)} kW`
        );
      }
    } else if (view.mode === "discharging") {
      // A clock time and a duration are the same fact twice, and past the next
      // sunrise neither is the answer — the sun takes over long before.
      const sunrise = sunTimes(stateOf(this._hass, "sun.sun")).nextRising;
      const reach = sunriseReach(
        view.hours,
        sunrise === undefined ? undefined : (sunrise.getTime() - Date.now()) / 3600000
      );

      const spent = view.availableKwh !== undefined && view.availableKwh <= 0;

      if (spent) {
        parts.push(localize("battery.at_reserve", locale));
      } else {
        if (reach) {
          parts.push(localize(`battery.sunrise_${reach}`, locale));
        } else if (view.at) {
          parts.push(`${localize("battery.lasts_until", locale)} ${formatClock(view.at, locale)}`);
        }

        if (view.availableKwh !== undefined) {
          parts.push(
            `${formatNumber(view.availableKwh, locale, 1)} kWh ${localize("battery.remaining", locale)}`
          );
        }
      }
    } else {
      parts.push(localize(view.mode === "full" ? "battery.full" : "battery.resting", locale));
      // At the ceiling the stored figure just repeats the capacity in the header.
      if (stored && view.mode !== "full") parts.push(stored);
    }

    if (parts.length === 0) return nothing;
    const [first, ...rest] = parts;
    return html`${first}${rest.length ? html`<span class="dim"> · ${rest.join(" · ")}</span>` : nothing}`;
  }

  private _renderToday(flow: Flow, locale: string) {
    const config = this._config as ResolvedConfig;
    const money = config.today.money ? this._renderMoney(locale) : nothing;
    // In autarky mode the ring already prints this very percentage.
    const ringShowsAutarky =
      !config.today.stats_chosen &&
      config.sections.ring &&
      (config.ring.center === "autarky" ||
        ((config.ring.center === "surplus" || config.ring.center === "production") &&
          flow.production <= 0.05 &&
          config.ring.center_dark === "autarky"));

    const stats = config.today.stats
      .filter((stat) => !(ringShowsAutarky && stat === "autarky"))
      .map((stat) => this._renderStat(stat, flow, locale))
      .filter((item) => item !== nothing);

    if (money === nothing && stats.length === 0) return nothing;

    const earning = (numberOf(stateOf(this._hass, config.entities.cost_today)) ?? 0) < 0;

    return html`
      <div class="today ${earning ? "earning" : ""}">
        ${money}
        ${config.today.origin_bar ? this._renderOriginBar(locale) : nothing}
        ${stats.length ? html`<div class="stats">${stats}</div>` : nothing}
      </div>
    `;
  }

  /**
   * Where the day's consumption came from. Built from the daily counters that
   * are already configured, so it costs no new sensor unless the battery's own
   * output is wanted as a third share.
   */
  /**
   * Where the day's consumption came from, out of the daily counters that are
   * already configured. One computation, drawn twice: as the outer ring and
   * as the bar under the balance.
   */
  private _dayOrigin():
    | { used: number; parts: Array<{ key: string; colour: string; value: number }> }
    | undefined {
    const hass = this._hass as HomeAssistant;
    const config = this._config as ResolvedConfig;

    const used = energyKwh(stateOf(hass, config.entities.house_today));
    const imported = energyKwh(stateOf(hass, config.entities.import_today)) ?? 0;
    if (used === undefined || used <= 0) return undefined;

    const battery = energyKwh(stateOf(hass, config.entities.battery_out_today));
    const fromBattery = Math.min(Math.max(0, battery ?? 0), Math.max(0, used - imported));
    const fromSun = Math.max(0, used - imported - fromBattery);

    const parts = [
      {
        key: battery === undefined ? "flow.own" : "ring.source_solar",
        colour: "var(--sst-sun)",
        value: fromSun
      },
      { key: "ring.source_battery", colour: "var(--sst-leaf)", value: fromBattery },
      { key: "ring.source_grid", colour: "var(--sst-grid)", value: imported }
    ].filter((part) => part.value >= 0.2 || part.value / used >= 0.05);

    return parts.length ? { used, parts } : undefined;
  }

  /** The same day laid out left to right, so the bar carries a time axis. */
  private _renderDayBand() {
    const hours = this._hours;
    if (!hours || !worthDrawing(hours)) return nothing;

    const width = 100 / 24;

    return html`
      <div class="origin">
        <div class="origin-bar band">
          ${Array.from({ length: 24 }, (_, index) => {
            const hour = hours.find((entry) => entry.hour === index);
            return html`<span
              class="day-cell ${hour?.dominant ?? "empty"}"
              style="width: ${width.toFixed(4)}%"
            ></span>`;
          })}
        </div>
        <div class="origin-hours">
          <span>00</span><span>06</span><span>12</span><span>18</span><span>24</span>
        </div>
      </div>
    `;
  }

  private _renderOriginBar(locale: string) {
    if ((this._config as ResolvedConfig).today.origin_style === "band") {
      return this._renderDayBand();
    }
    const day = this._dayOrigin();
    if (day === undefined) return nothing;
    const { used, parts } = day;

    if (parts.length === 1) {
      const only = parts[0];
      return html`<div class="origin single">
        <span class="origin-keys"
          ><span><i style="background: ${only.colour}"></i>${localize(only.key, locale)}
          <b>${formatEnergy(only.value, locale)} kWh</b></span></span
        >
      </div>`;
    }

    return html`
      <div class="origin">
        <div class="origin-bar">
          ${parts.map(
            (part) => html`<span
              style="width: ${((part.value / used) * 100).toFixed(2)}%; background: ${part.colour}"
            ></span>`
          )}
        </div>
        <div class="origin-keys">
          ${parts.map(
            (part) => html`<span
              ><i style="background: ${part.colour}"></i>${localize(part.key, locale)}
              <b>${formatEnergy(part.value, locale)} kWh</b></span
            >`
          )}
        </div>
      </div>
    `;
  }

  private _renderMoney(locale: string) {
    const hass = this._hass as HomeAssistant;
    const config = this._config as ResolvedConfig;
    const money = moneyView({
      balance: numberOf(stateOf(hass, config.entities.cost_today)),
      exported: numberOf(stateOf(hass, config.entities.cost_export_today)),
      imported: numberOf(stateOf(hass, config.entities.cost_import_today)),
      exportKwh: energyKwh(stateOf(hass, config.entities.export_today)),
      importKwh: energyKwh(stateOf(hass, config.entities.import_today)),
      priceImport: numberOf(stateOf(hass, config.entities.price_import)),
      priceExport: numberOf(stateOf(hass, config.entities.price_export))
    });

    const balance = money.balance;
    if (balance === undefined) return nothing;

    const earned = balance < 0;
    const { exported, imported } = money;

    const paidOff = config.today.amortisation
      ? numberOf(stateOf(hass, config.entities.amortisation))
      : undefined;

    const breakdown =
      config.today.breakdown && (exported !== undefined || imported !== undefined)
        ? html`<span class="money-k">
            ${exported !== undefined
              ? html`${formatMoney(exported, locale)} ${localize("today.exported_money", locale)}<br />`
              : nothing}
            ${imported !== undefined
              ? html`${formatMoney(imported, locale)} ${localize("today.imported_money", locale)}`
              : nothing}
          </span>`
        : nothing;

    return html`
      <div class="money">
        ${this._linked(
          config.entities.cost_today,
          html`<span class="money-v ${earned ? "plus" : "minus"}">
            ${earned ? "+" : "−"}${formatMoney(Math.abs(balance), locale)}
            <small>${localize(earned ? "today.earned" : "today.paid", locale)}</small>
          </span>`
        )}
        ${breakdown}
        ${
          paidOff === undefined
            ? nothing
            : this._linked(
                config.entities.amortisation,
                html`<span class="corner"
                  >${formatNumber(paidOff, locale, 0)} %
                  <span class="dim">${localize("stat.amortisation", locale)}</span></span
                >`
              )
        }
      </div>
    `;
  }

  private _renderStat(stat: TodayStat, flow: Flow, locale: string) {
    const hass = this._hass as HomeAssistant;
    const config = this._config as ResolvedConfig;

    const house = energyKwh(stateOf(hass, config.entities.house_today));
    const imported = energyKwh(stateOf(hass, config.entities.import_today));

    let value: string | undefined;
    let unit = "kWh";

    switch (stat) {
      case "peak": {
        const peak = this._series?.solarPeak;
        if (peak !== undefined) {
          value = formatPower(peak, locale);
          unit = "kW";
        }
        break;
      }
      case "autarky": {
        if (house !== undefined && imported !== undefined && house > 0) {
          value = formatNumber(Math.max(0, ((house - imported) / house) * 100), locale, 0);
        } else {
          value = formatNumber(flow.autarky * 100, locale, 0);
        }
        unit = "%";
        break;
      }
      case "export": {
        const exported = energyKwh(stateOf(hass, config.entities.export_today));
        if (exported !== undefined) value = formatEnergy(exported, locale);
        break;
      }
      case "import": {
        if (imported !== undefined) value = formatEnergy(imported, locale);
        break;
      }
      case "solar": {
        const produced = energyKwh(stateOf(hass, config.entities.solar_today));
        if (produced !== undefined) value = formatEnergy(produced, locale);
        break;
      }
      case "house": {
        if (house !== undefined) value = formatEnergy(house, locale);
        break;
      }
      case "forecast": {
        const expected = energyKwh(stateOf(hass, config.entities.forecast));
        if (expected !== undefined) value = formatEnergy(expected, locale);
        break;
      }
      case "amortisation": {
        const paid = numberOf(stateOf(hass, config.entities.amortisation));
        if (paid !== undefined) {
          value = formatNumber(paid, locale, 0);
          unit = "%";
        }
        break;
      }
    }

    if (value === undefined) return nothing;

    // Peak and self-sufficiency are worked out here, so they lead nowhere.
    const behind: Partial<Record<TodayStat, string | undefined>> = {
      export: config.entities.export_today,
      import: config.entities.import_today,
      solar: config.entities.solar_today,
      house: config.entities.house_today,
      forecast: config.entities.forecast,
      amortisation: config.entities.amortisation
    };

    return html`
      <div class="stat">
        <span class="stat-k">${localize(`stat.${stat}`, locale)}</span>
        ${this._linked(
          behind[stat],
          html`<span class="stat-v">${value} <small>${unit}</small></span>`
        )}
      </div>
    `;
  }
}

if (!customElements.get(CARD_TYPE)) {
  customElements.define(CARD_TYPE, PowerOriginCard);
}

void import("./editor").then(({ PowerOriginCardEditor }) => {
  if (!customElements.get(`${CARD_TYPE}-editor`)) {
    customElements.define(`${CARD_TYPE}-editor`, PowerOriginCardEditor);
  }
});

window.customCards = window.customCards ?? [];
window.customCards.push({
  type: CARD_TYPE,
  name: localize("card.name"),
  description: localize("card.description"),
  preview: true,
  documentationURL: "https://github.com/hoizi89/power-origin-card"
});
