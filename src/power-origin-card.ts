import { LitElement, html, nothing, svg } from "lit";
import { batteryView, segmentCount, segments, type BatteryView } from "./battery";
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
import { localize } from "./localize";
import { METER_HEIGHT, meterGeometry } from "./meter";
import { buildDaySeries, cachedStatistics, fetchStatistics } from "./stats";
import { cardStyles } from "./styles";
import { sunTimes } from "./sun";
import type {
  DaySeries,
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

const REFRESH_MS = 2 * 60 * 1000;

export class PowerOriginCard extends LitElement {
  static properties = {
    _config: { state: true },
    _series: { state: true },
    _error: { state: true }
  };

  static styles = cardStyles;

  private _hass?: HomeAssistant;
  private _config?: ResolvedConfig;
  private _series?: DaySeries;
  private _error?: string;
  private _lastFetch = 0;
  private _pending = false;
  private _yearPeak?: number;
  private _peakFetched = 0;
  private readonly _fillId = `po-fill-${(gradientSeq += 1)}`;

  static async getConfigElement(): Promise<HTMLElement> {
    const { ensureHaFormLoaded } = await import("./editor");
    await ensureHaFormLoaded();
    return document.createElement(`${CARD_TYPE}-editor`);
  }

  static getStubConfig(hass: HomeAssistant): PowerOriginCardConfig {
    return stubConfig(Object.keys(hass?.states ?? {}));
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
      const ids = [solarId, houseId].filter(Boolean) as string[];
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

    return html`
      <ha-card style="--sst-scale: ${config.text_scale}">
        <div class="head ${config.title ? "" : "bare"}">
          ${config.title ? html`<p class="title">${config.title}</p>` : nothing}
          <span class="chip ${gridfree ? "gridfree" : "importing"}">
            ${localize(gridfree ? "state.gridfree" : "state.importing", locale)}
          </span>
        </div>
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

    const captionKey = showAutarky
      ? "ring.caption_autarky"
      : showSurplus
        ? spare > 0.01
          ? "ring.caption_surplus"
          : "ring.no_surplus"
        : showProduction
          ? "ring.caption_production"
          : "ring.caption_house";

    const caption = config.ring.caption ? localize(captionKey, locale) : undefined;

    return html`
      <div class="ring-block ${config.ring.layout}">
        <div class="ring-group">
        ${this._renderMeter(flow, locale)}
        <svg class="ring ${showSurplus ? "surplus" : ""}" viewBox="0 0 200 200" role="img" aria-label="${value} ${unit}">
          <circle class="ring-track" cx="100" cy="100" r="76" pathLength="100"></circle>
          ${parts.map(
            (part) => svg`
              <circle
                class="seg ${part.key} ${single ? "single" : ""}"
                cx="100" cy="100" r="76" pathLength="100"
                stroke-dasharray="${part.length.toFixed(2)} 100"
                stroke-dashoffset="${(-part.offset).toFixed(2)}"
                transform="rotate(-90 100 100)"
              ></circle>`
          )}
          <path
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
          ></path>
          <text class="ring-value" x="100" y="${caption ? 104 : 112}" text-anchor="middle"
            >${value}<tspan dx="5">${unit}</tspan></text
          >
          ${
            caption
              ? svg`<text class="ring-caption" x="100" y="126" text-anchor="middle">${caption}</text>`
              : nothing
          }

        </svg>
        </div>
        ${this._renderLegend(flow, locale)}
      </div>
    `;
  }

  /**
   * Surplus climbs, grid draw sinks. A ring can show proportions but never a
   * direction, and the direction is what tells you whether to switch something on.
   */
  private _renderMeter(flow: Flow, locale: string) {
    const config = this._config as ResolvedConfig;
    if (!config.ring.meter) return nothing;

    // Without a solar sensor there can never be a surplus, and the draw is the
    // house load the ring already prints. Nothing of its own to say.
    if (!config.entities.solar) return nothing;
    if (flow.toGrid + flow.toBattery <= 0.05 && flow.fromGrid <= 0.05) return nothing;

    const meter = meterGeometry(
      {
        toBattery: flow.toBattery,
        toGrid: flow.toGrid,
        fromGrid: flow.fromGrid,
        fromBattery: flow.fromBattery
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

    const exporting = flow.toGrid > 0.01;
    const charging = flow.toBattery > 0.01;

    // Whichever side is bigger gets named, so the figure agrees with the block
    // the eye lands on. Naming the smaller flow made the column contradict its
    // own caption.
    const gridLeads = flow.fromGrid >= flow.fromBattery;

    const key = meter.deficit > 0.01
      ? gridLeads
        ? "meter.import"
        : "meter.discharging"
      : exporting && charging
        ? "meter.surplus"
        : exporting
          ? "meter.export"
          : charging
            ? "meter.charging"
            : "meter.balanced";

    const word = localize(key, locale);
    const amount = meter.deficit > 0.01
      ? gridLeads
        ? flow.fromGrid
        : flow.fromBattery
      : meter.surplus;
    const tone = meter.deficit > 0.01 ? "down" : meter.surplus > 0.01 ? "up" : "idle";

    return html`
      <div class="meter-block">
      <svg class="meter" viewBox="0 0 88 ${METER_HEIGHT}" role="img" aria-label="${label}">
        <line class="meter-zero" x1="0" y1="${METER_HEIGHT / 2}" x2="88" y2="${METER_HEIGHT / 2}"></line>
        ${
          config.ring.meter_style === "blocks"
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
                <rect class="meter-track" x="4" y="${meter.trackY}" width="80"
                      height="${meter.trackHeight}" rx="9"></rect>
                ${meter.bands.map(
                  (band) => svg`<rect
                    class="meter-band ${band.key} ${
                      meter.belowTarget && band.y < 100 ? "held" : ""
                    }"
                    x="4" y="${band.y}" width="80" height="${band.height}" rx="6"
                  ></rect>`
                )}`
        }
      </svg>
      <div class="meter-label ${tone}">
        <span class="meter-value">${formatPower(amount, locale)} <small>kW</small></span>
        <span class="meter-word">${word}</span>
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
            box
          )
        : undefined;

    const geometry =
      series && !asBars && inDay.length > 1 && dayStart !== undefined && dayEnd !== undefined
        ? chartGeometry(
            inDay.map((point) => point.timestamp),
            inDay.map((point) => series.solar[point.index]),
            config.chart.consumption ? inDay.map((point) => series.house[point.index]) : [],
            { start: dayStart, end: dayEnd },
            box
          )
        : undefined;

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
          ${solarNow !== undefined
            ? html`<span class="row-note key-solar"
                >${formatPower(solarNow, locale)} <span class="unit">kW</span></span
              >`
            : nothing}
        </div>
        ${this._error ? html`<div class="row-note dim">${this._error}</div>` : nothing}
        ${geometry || barGeometry
          ? html`
            <svg class="full" viewBox="0 0 ${box.width} ${box.height + 20}"
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
                      >${formatPower((geometry?.tick ?? barGeometry?.tick)!.value, locale)} kW</text>`
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
          <span class="row-title">${localize("battery.title", locale)}</span>
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

  private _renderBatterySvg(soc: number, tone: string, locale: string) {
    const config = this._config as ResolvedConfig;
    const bare = config.battery.style === "bar";

    // Without a casing the bar may use the width the cap would have taken.
    const shellW = bare ? 259 : 248;
    const innerStart = bare ? 0 : 6;
    const innerWidth = bare ? shellW : shellW - 10;
    const top = bare ? 12 : 10;
    const tall = bare ? 28 : 32;
    const radius = bare ? 4 : 6;

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
            return svg`
              <rect class="fill-off" x="${x}" y="${top}" width="${width}"
                    height="${tall}" rx="${radius}"></rect>
              ${
                segment.fill > 0
                  ? svg`<rect class="bat-fill ${tone}" x="${x}" y="${top}"
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
        <text class="bat-pct" x="340" y="35" text-anchor="end"
          >${formatNumber(soc, locale, 0)}<tspan dx="4">%</tspan></text
        >
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
      const sunrise = sunTimes(stateOf(this._hass, "sun.sun")).rising;
      const pastSunrise = view.at !== undefined && sunrise !== undefined && view.at > sunrise;

      if (pastSunrise) {
        parts.push(localize("battery.until_sunrise", locale));
      } else if (view.at) {
        parts.push(`${localize("battery.lasts_until", locale)} ${formatClock(view.at, locale)}`);
      }

      if (view.availableKwh !== undefined) {
        parts.push(
          `${formatNumber(view.availableKwh, locale, 1)} kWh ${localize("battery.remaining", locale)}`
        );
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
    const stats = config.today.stats
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
  private _renderOriginBar(locale: string) {
    const hass = this._hass as HomeAssistant;
    const config = this._config as ResolvedConfig;

    const used = energyKwh(stateOf(hass, config.entities.house_today));
    const imported = energyKwh(stateOf(hass, config.entities.import_today)) ?? 0;
    if (used === undefined || used <= 0) return nothing;

    const battery = energyKwh(stateOf(hass, config.entities.battery_out_today));
    const fromBattery = Math.min(Math.max(0, battery ?? 0), Math.max(0, used - imported));
    const fromSun = Math.max(0, used - imported - fromBattery);

    const parts = [
      { key: battery === undefined ? "flow.own" : "flow.from_solar", colour: "var(--sst-sun)", value: fromSun },
      { key: "flow.from_battery", colour: "var(--sst-leaf)", value: fromBattery },
      { key: "flow.from_grid", colour: "var(--sst-grid)", value: imported }
    ].filter((part) => part.value >= 0.2 || part.value / used >= 0.05);

    if (parts.length === 0) return nothing;

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
    const balance = numberOf(stateOf(hass, config.entities.cost_today));
    if (balance === undefined) return nothing;

    const earned = balance < 0;
    const exported = numberOf(stateOf(hass, config.entities.cost_export_today));
    const imported = numberOf(stateOf(hass, config.entities.cost_import_today));

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
        <span class="money-v ${earned ? "plus" : "minus"}">
          ${earned ? "+" : "−"}${formatMoney(Math.abs(balance), locale)}
          <small>${localize(earned ? "today.earned" : "today.paid", locale)}</small>
        </span>
        ${breakdown}
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

    return html`
      <div class="stat">
        <span class="stat-k">${localize(`stat.${stat}`, locale)}</span>
        <span class="stat-v">${value} <small>${unit}</small></span>
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
