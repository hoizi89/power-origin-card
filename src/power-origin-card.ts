import { LitElement, html, nothing, svg } from "lit";
import { batteryView, fullFromForecast, fullSpan, fullVerdict, segmentCount, segments, sunriseReach, type BatteryMode, type BatteryView } from "./battery";
import { chartBars } from "./bars";
import { CHART_BOX, chartGeometry } from "./chart";
import { blockOrder, CARD_TYPE, resolveConfig, stubConfig } from "./config";
import {
  computeFlow,
  productionSegments,
  ringSegments,
  surplusSegments,
  worthNaming,
  type Flow
} from "./flow";
import { pickFromEnergy, type EnergyPrefs } from "./energy";
import { hourlyForecastAll, shortfall, snowSeason, type ForecastHour } from "./forecast";
import { byArea, byIcon, iconFor, rankDevices, type DeviceReading } from "./devices";
import { fetchRecentMeans, fetchRecentSeries, fetchTodayChange, runMinutes } from "./stats";
import { hourlyShares, worthDrawing, type HourShare } from "./hours";
import { localize } from "./localize";
import { moneyView } from "./money";
import { balanceView, METER_HEIGHT, meterGeometry } from "./meter";
import { buildDaySeries, cachedStatistics, dayTotal, extremes, fetchStatistics, recentMean, startOfToday, toMillis } from "./stats";
import { cardStyles } from "./styles";
import { sunTimes } from "./sun";
import type {
  DaySeries,
  MeterStyle, MeterShows,
  HomeAssistant,
  ResolvedConfig,
  PowerOriginCardConfig,
  RingCenter,
  StatisticPoint,
  TodayStat,
  WeekDay
} from "./types";
import {
  energyKwh,
  formatClock,
  formatEnergy, formatEnergyFine, formatDuration,
  formatMoney,
  formatNumber,
  formatPower,
  localeOf,
  numberOf,
  powerKw,
  stateOf,
  unitOf, sumEnergyKwh, priceOf, priceScale } from "./values";

let gradientSeq = 0;

/** Which side of the meter the reading is about, so the column needs no legend. */
const PYLON = html`<svg class="meter-glyph" viewBox="0 0 24 24" aria-hidden="true">
  <path d="M12 3 6.5 21M12 3l5.5 18M8.7 14h6.6M7.6 19h8.8M5 6l7-2 7 2" />
</svg>`;
const CELL = html`<svg class="meter-glyph" viewBox="0 0 24 24" aria-hidden="true">
  <path d="M4.5 8.5h13a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 3 14v-4a1.5 1.5 0 0 1 1.5-1.5zM21 10.8v2.4" />
</svg>`;

const REFRESH_MS = 2 * 60 * 1000;
/** How often the Energy dashboard is asked for its device list. */
const ENERGY_MS = 60 * 60 * 1000;

export class PowerOriginCard extends LitElement {
  static properties = {
    _config: { state: true },
    _series: { state: true },
    _hours: { state: true },
    _error: { state: true },
    _cycleAt: { state: true },
    _weekPick: { state: true },
    _openArea: { state: true },
    _wideOn: { state: true }
  };

  static styles = cardStyles;

  private _hass?: HomeAssistant;
  private _config?: ResolvedConfig;
  private _series?: DaySeries;
  private _hours?: HourShare[];
  private _swing?: { up: number; down: number };
  private _earlier?: DaySeries;
  private _socRange?: { low: number; high: number };
  /** The charge through the day so far, for the curve under the bar. */
  private _socRows?: StatisticPoint[];
  private _error?: string;
  private _lastFetch = 0;
  private _deviceMeans?: Record<string, number | undefined>;
  private _deviceToday?: Record<string, number | undefined>;
  /** Each device's last hours, five minutes at a time, for lines and run times. */
  private _deviceSeries?: Record<string, Array<{ start: number; mean: number }>>;
  /** The room a tap opened in the devices block. */
  private _openArea?: string;
  /** Whether the card is wide enough for the wide layout right now. */
  private _wideOn = false;
  private _resize?: ResizeObserver;
  private _pending = false;
  private _yearPeak?: number;
  /** The best day of the year, one mean per hour in kW, and its yield. */
  private _bestDay?: number[];
  private _bestKwh?: number;
  private _bestFetched = 0;
  /** The battery's power over the last quarter hour, in kW, the sign as the sensor gives it. */
  private _cellMean?: number;
  /** Whether the roof counted as producing last time; the dusk keeps it until the sun settles it. */
  private _producing?: boolean;
  /** What the battery was doing last time, so its word does not flip on a few watts. */
  private _batteryMode?: BatteryMode;
  /** The last seven days, today last. */
  private _week?: WeekDay[];
  private _weekFetched = 0;
  /** The day a tap picked in the week block. */
  private _weekPick?: number;
  /** The import price's mean over the day so far, for colouring this hour's. */
  private _priceMean?: number;
  /** The last twelve months' balances, negative when a month earned, current month last. */
  private _moneyMonths?: Array<{ start: number; balance: number }>;
  private _moneyFetched = 0;
  /** When the current grid draw began, when it was last seen, and whether the switch is thrown. */
  private _importSince?: number;
  private _importLast?: number;
  private _importOn = false;
  private _importTimer?: number;
  /** Set while the ring centre shows the battery’s time left, so the note does not repeat it. */
  private _centreShowsTime = false;
  /** Set while a column shows how long the battery lasts, for the same reason. */
  private _columnShowsTime = false;
  /** Where a tap left the centre; undefined until the ring is tapped. */
  private _cycleAt?: RingCenter;
  /** What the centre shows this render, so the blocks below repeat nothing. */
  private _centreShown: RingCenter | "runtime" = "power";
  private _peakFetched = 0;
  /** When the Energy dashboard's device list was last taken over. */
  private _energyFetched = 0;
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
    // A changed configuration may want figures the last one did not; every
    // slow query is allowed again, or a block switched on shows nothing for an hour.
    this._lastFetch = 0;
    this._peakFetched = 0;
    this._bestFetched = 0;
    this._weekFetched = 0;
    this._moneyFetched = 0;
    this._energyFetched = 0;
    this._cycleAt = undefined;
    this._measure();
    if (this._config.ring.tap === "cycle") {
      try {
        const kept = localStorage.getItem(this._cycleKey());
        if (kept) this._cycleAt = kept as RingCenter;
      } catch {
        // A browser that keeps nothing starts where the configuration says.
      }
    }
    this.requestUpdate();
  }

  private _cycleKey(): string {
    return `power-origin:centre:${this._config?.entities.house ?? ""}`;
  }

  /** The centres a tap can reach now, the configured one first. */
  private _cycleModes(producing: boolean, priced: boolean): RingCenter[] {
    const config = this._config as ResolvedConfig;
    const modes: RingCenter[] = ["power", "autarky"];
    if (priced) modes.push("money");
    if (producing) modes.push("production", "surplus");
    const start = config.ring.center;
    if (modes.includes(start)) {
      modes.splice(modes.indexOf(start), 1);
      modes.unshift(start);
    }
    return modes;
  }

  private _cycle(producing: boolean, priced: boolean, shown: RingCenter | "runtime"): void {
    const modes = this._cycleModes(producing, priced);
    const next = modes[(modes.indexOf(shown as RingCenter) + 1) % modes.length];
    this._cycleAt = next;
    try {
      localStorage.setItem(this._cycleKey(), next);
    } catch {
      // Then it holds for this page only.
    }
  }

  /**
   * What the centre shows. A tap wins over the configuration; the night wins
   * over the day, and a view the moment cannot serve falls back to the house.
   */
  private _centreMode(night: boolean, priced: boolean): RingCenter | "runtime" {
    const config = this._config as ResolvedConfig;
    const producing = !night;
    const allowed = (mode: RingCenter): boolean =>
      mode === "money" ? priced : mode === "production" || mode === "surplus" ? producing : true;
    if (config.ring.tap === "cycle" && this._cycleAt !== undefined) {
      if (this._cycleModes(producing, priced).includes(this._cycleAt)) return this._cycleAt;
    }
    const day = config.ring.center;
    const fallback = allowed(day) ? day : "power";
    if (!night) return fallback;
    const dark = config.ring.center_dark;
    if (dark === "runtime") return this._batteryTime() ? "runtime" : fallback;
    if (dark !== "power" && allowed(dark)) return dark;
    return fallback;
  }

  /** How far the night has come, from the last sunset to the next sunrise. */
  private _nightSoFar(): { done: number; hoursLeft: number } | undefined {
    const times = sunTimes(stateOf(this._hass, "sun.sun"));
    const rise = times.nextRising?.getTime();
    let set = times.setting?.getTime();
    if (rise === undefined || set === undefined) return undefined;
    const now = Date.now();
    // After midnight the day's sunset is the coming one; the night began at the last.
    if (set > now) set -= 24 * 60 * 60 * 1000;
    const length = rise - set;
    if (length <= 0 || rise < now) return undefined;
    return {
      done: Math.min(1, Math.max(0, (now - set) / length)),
      hoursLeft: (rise - now) / 3600000
    };
  }

  set hass(hass: HomeAssistant) {
    const before = this._hass;
    this._hass = hass;
    // Home Assistant hands the card every state change in the house. Only
    // the entities it reads can change what it draws, so only those redraw
    // it - which on a wall panel is most of the work saved.
    if (!before || !this._config || this._watchedChanged(before, hass)) this.requestUpdate();
    void this._maybeFetch();
  }

  private _watchedChanged(before: HomeAssistant, after: HomeAssistant): boolean {
    const config = this._config as ResolvedConfig;
    const ids = [
      ...Object.values(config.entities).filter((v): v is string => typeof v === "string"),
      ...config.devices.list,
      ...Object.values(config.devices.energy),
      "sun.sun"
    ];
    for (const id of ids) if (before.states?.[id] !== after.states?.[id]) return true;
    return before.locale?.language !== after.locale?.language;
  }

  get hass(): HomeAssistant | undefined {
    return this._hass;
  }

  connectedCallback(): void {
    super.connectedCallback();
    // hass may have arrived before the element was in the document, and the
    // fetch declines to run while it is not — so it is picked up here.
    void this._maybeFetch();
    // The wide layout waits for room; the card measures itself for it.
    if (typeof ResizeObserver !== "undefined" && !this._resize) {
      this._resize = new ResizeObserver(() => this._measure());
      this._resize.observe(this);
    }
    this._measure();
  }

  private _measure(): void {
    const config = this._config;
    if (!config || config.shape !== "wide") return;
    // Two columns need room whatever is asked; below this they overlap.
    const FLOOR = 560;
    const on = this.clientWidth >= Math.max(FLOOR, config.wide_from);
    if (on !== this._wideOn) this._wideOn = on;
  }

  getCardSize(): number {
    const sections = this._config?.sections;
    if (!sections) return 8;
    if (this._config?.shape === "compact") return 3;
    return (
      1 +
      (sections.ring ? 4 : 0) +
      (sections.chart ? 2 : 0) +
      (sections.week ? 2 : 0) +
      (sections.battery ? 1 : 0) +
      (sections.today ? 2 : 0)
    );
  }

  /**
   * The devices as the Energy dashboard lists them, taken over once an hour
   * when the card is set to follow it: a device added there is here by the
   * next hour, and nobody keeps two lists. What the dashboard does not know
   * leaves the last list standing.
   */
  private async _followEnergy(hass: HomeAssistant, config: ResolvedConfig): Promise<void> {
    if (config.devices.source !== "energy") return;
    if (Date.now() - this._energyFetched < ENERGY_MS) return;
    this._energyFetched = Date.now();
    try {
      const prefs = await hass.callWS<EnergyPrefs>({ type: "energy/get_prefs" });
      const devices = pickFromEnergy(prefs).devices ?? [];
      const list = devices.map((d) => d.id);
      if (list.join() === config.devices.list.join()) return;
      config.devices.list = list;
      config.devices.names = Object.fromEntries(devices.map((d) => [d.id, d.name]));
      config.devices.energy = Object.fromEntries(
        devices.filter((d) => d.energy).map((d) => [d.id, d.energy as string])
      );
      this._lastFetch = 0;
      this.requestUpdate();
    } catch {
      // No dashboard to follow: the list stays as it was.
    }
  }

  private async _maybeFetch(): Promise<void> {
    const hass = this._hass;
    const config = this._config;
    if (!hass || !config || this._pending || !this.isConnected) return;
    const meterNeedsScale =
      config.ring.meter &&
      (config.ring.meter_scale === 0 ||
        config.ring.meter_second_scale === 0 ||
        config.ring.meter_style === "roof" ||
        config.ring.meter_second === "roof");
    await this._followEnergy(hass, config);
    const devicesNeed = this._wantsDevices();
    if (
      !config.sections.chart &&
      !config.battery.runtime &&
      !(config.sections.battery && config.battery.curve) &&
      !meterNeedsScale &&
      !this._needsPeak() &&
      !this._needsHours() &&
      !config.sections.week &&
      !this._wantsMoneyHistory() &&
      !config.head_price &&
      !devicesNeed
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
      // The runtime reads the battery too, for a rate that a cloud cannot flip.
      const cellId = this._needsHours() || config.battery.runtime ? config.entities.battery_power : undefined;
      const socId =
        config.battery.extra === "range" || (config.sections.battery && config.battery.curve)
          ? config.entities.battery_soc
          : undefined;
      const priceId = config.head_price ? config.entities.price_import : undefined;
      const ids = [solarId, houseId, gridId, cellId, socId, priceId].filter(Boolean) as string[];
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
      this._cellMean = cellId
        ? (() => {
            const mean = recentMean(stats[cellId], 15);
            const perKw = unitOf(stateOf(hass, cellId)).toLowerCase() === "kw" ? 1 : 1000;
            return mean === undefined ? undefined : mean / perKw;
          })()
        : undefined;
      // A percentage, so it is read as it comes.
      this._socRange = socId ? extremes(stats[socId] ?? []) : undefined;
      this._socRows = socId ? stats[socId] : undefined;
      const prices = priceId
        ? (stats[priceId] ?? []).map((row) => row.mean).filter((v): v is number => typeof v === "number" && Number.isFinite(v))
        : [];
      // The recorder keeps the entity's own unit; the mean is compared with a price in €/kWh.
      const scale = priceId ? priceScale(stateOf(hass, priceId)) : 1;
      this._priceMean = prices.length ? (scale * prices.reduce((a, b) => a + b, 0)) / prices.length : undefined;

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
      await this._fetchDevices(hass, config);
      await this._fetchBestDay(hass, solarId, divisor);
      await this._fetchWeek(hass, config);
      await this._fetchMoneyHistory(hass, config);
      this._error = undefined;
    } catch (error) {
      this._error = error instanceof Error ? error.message : String(error);
    } finally {
      this._pending = false;
      // Fetched figures redraw on their own; a watched entity may be slow.
      this.requestUpdate();
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

  /**
   * The best day of the year: the day whose roof averaged most, then that
   * day hour by hour. A memory of the year, so it is refreshed twice a day.
   */
  private async _fetchBestDay(
    hass: HomeAssistant,
    solarId: string | undefined,
    divisor: number
  ): Promise<void> {
    const config = this._config as ResolvedConfig;
    if (!config.chart.best_day || !config.sections.chart || !solarId) {
      this._bestDay = undefined;
      return;
    }
    const HALF_DAY = 12 * 60 * 60 * 1000;
    if (Date.now() - this._bestFetched < HALF_DAY) return;
    this._bestFetched = Date.now();

    type Rows = Record<string, Array<Record<string, unknown>>>;
    const query = (start: Date, end: Date, period: "day" | "hour") =>
      hass.callWS<Rows>({
        type: "recorder/statistics_during_period",
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        statistic_ids: [solarId],
        period,
        types: ["mean"]
      });
    const days = (await cachedStatistics(
      [solarId],
      HALF_DAY,
      () => query(new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), new Date(), "day") as never,
      "best-days"
    )) as unknown as Rows;
    const today = startOfToday().getTime();
    let bestStart: number | undefined;
    let bestMean = 0;
    for (const row of days?.[solarId] ?? []) {
      const start = toMillis(row.start);
      const mean = Number(row.mean);
      if (!Number.isFinite(start) || !Number.isFinite(mean) || start >= today) continue;
      if (mean > bestMean) {
        bestMean = mean;
        bestStart = start;
      }
    }
    if (bestStart === undefined) {
      this._bestDay = undefined;
      return;
    }
    const from = new Date(bestStart);
    const to = new Date(bestStart);
    to.setDate(to.getDate() + 1);
    const hours = (await cachedStatistics(
      [solarId],
      HALF_DAY,
      () => query(from, to, "hour") as never,
      `best-hours-${bestStart}`
    )) as unknown as Rows;
    const byHour: number[] = Array.from({ length: 24 }, () => 0);
    for (const row of hours?.[solarId] ?? []) {
      const start = toMillis(row.start);
      const mean = Number(row.mean);
      if (!Number.isFinite(start) || !Number.isFinite(mean)) continue;
      byHour[new Date(start).getHours()] = Math.max(0, mean) / divisor;
    }
    this._bestDay = byHour;
    this._bestKwh = byHour.reduce((sum, kw) => sum + kw, 0);
  }

  private _wantsMoneyHistory(): boolean {
    const config = this._config;
    if (!config) return false;
    return (
      config.sections.today && config.today.money && (config.today.month || config.today.payoff_year)
    );
  }

  /**
   * Twelve months of money, one figure per month, from whichever sensors
   * carry it: the balance, the two sides, or the two energies priced. The
   * month so far is the last row; the year's pace is all of them.
   */
  private async _fetchMoneyHistory(hass: HomeAssistant, config: ResolvedConfig): Promise<void> {
    if (!this._wantsMoneyHistory()) {
      this._moneyMonths = undefined;
      return;
    }
    const HOUR = 60 * 60 * 1000;
    if (Date.now() - this._moneyFetched < HOUR) return;
    this._moneyFetched = Date.now();

    const e = config.entities;
    // The money is read day by day and added up into months, because the
    // daily sensors most people have reset at midnight, and a month's change
    // of such a sensor is nonsense. A signed balance cannot be read that way
    // at all, so the two sides are preferred; a balance only counts when it
    // only ever climbs.
    const classOf = (id: string | undefined) => stateOf(hass, id)?.attributes?.state_class;
    const balanceOk = e.cost_today && classOf(e.cost_today) === "total_increasing";
    const ids = [
      balanceOk ? e.cost_today : undefined,
      e.cost_export_today,
      e.cost_import_today,
      e.export_today,
      e.import_today
    ].filter((id): id is string => Boolean(id));
    if (ids.length === 0) return;

    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    start.setMonth(start.getMonth() - 11);
    type Rows = Record<string, Array<Record<string, unknown>>>;
    const rows = (await cachedStatistics(
      ids,
      HOUR,
      () =>
        hass.callWS<Rows>({
          type: "recorder/statistics_during_period",
          start_time: start.toISOString(),
          end_time: new Date().toISOString(),
          statistic_ids: ids,
          period: "day",
          types: ["change", "state", "max"]
        }) as never,
      "money-days"
    )) as unknown as Rows;

    const buy = priceOf(stateOf(hass, e.price_import)) ?? 0;
    const sell = priceOf(stateOf(hass, e.price_export)) ?? 0;
    const has = (id: string | undefined) => Boolean(id) && (rows?.[id as string] ?? []).length > 0;
    const source = balanceOk && has(e.cost_today)
      ? "balance"
      : has(e.cost_export_today) || has(e.cost_import_today)
        ? "sides"
        : has(e.export_today) || has(e.import_today)
          ? "energy"
          : undefined;
    if (!source) {
      this._moneyMonths = [];
      return;
    }
    // Every day of every sensor, keyed by its month.
    const byMonth = (id: string | undefined): Map<number, number> => {
      const out = new Map<number, number>();
      if (!id) return out;
      const entity = stateOf(hass, id);
      const wh = unitOf(entity).toLowerCase() === "wh";
      for (const row of rows?.[id] ?? []) {
        const at = new Date(toMillis(row.start));
        if (!Number.isFinite(at.getTime())) continue;
        const value = dayTotal(row, classOf(id), entity?.attributes?.last_reset != null);
        if (value === undefined) continue;
        const month = new Date(at.getFullYear(), at.getMonth(), 1).getTime();
        out.set(month, (out.get(month) ?? 0) + (wh ? value / 1000 : value));
      }
      return out;
    };
    const months: Array<{ start: number; balance: number }> = [];
    const balanceOf = byMonth(source === "balance" ? e.cost_today : undefined);
    const outOf = byMonth(source === "sides" ? e.cost_export_today : source === "energy" ? e.export_today : undefined);
    const innOf = byMonth(source === "sides" ? e.cost_import_today : source === "energy" ? e.import_today : undefined);
    for (let index = 0; index < 12; index += 1) {
      const at = new Date(start);
      at.setMonth(start.getMonth() + index);
      const month = at.getTime();
      let balance: number | undefined;
      if (source === "balance") {
        balance = balanceOf.get(month);
      } else {
        const out = outOf.get(month);
        const inn = innOf.get(month);
        if (out !== undefined || inn !== undefined) {
          balance = source === "sides" ? (inn ?? 0) - (out ?? 0) : (inn ?? 0) * buy - (out ?? 0) * sell;
        }
      }
      if (balance !== undefined) months.push({ start: month, balance });
    }
    this._moneyMonths = months;
  }

  /**
   * Seven days from the daily meters: how much each meter grew per day,
   * which holds for a meter that resets at midnight and for one that never
   * does. Refreshed hourly; the days before today do not change.
   */
  private async _fetchWeek(hass: HomeAssistant, config: ResolvedConfig): Promise<void> {
    if (!config.sections.week || !config.entities.solar_today) {
      this._week = undefined;
      return;
    }
    const HOUR = 60 * 60 * 1000;
    if (Date.now() - this._weekFetched < HOUR) return;
    this._weekFetched = Date.now();

    const ids = [config.entities.solar_today, config.entities.house_today, config.entities.import_today]
      .filter((id): id is string => Boolean(id));
    const first = startOfToday();
    first.setDate(first.getDate() - 6);
    type Rows = Record<string, Array<Record<string, unknown>>>;
    const rows = (await cachedStatistics(
      ids,
      HOUR,
      () =>
        hass.callWS<Rows>({
          type: "recorder/statistics_during_period",
          start_time: first.toISOString(),
          end_time: new Date().toISOString(),
          statistic_ids: ids,
          period: "day",
          types: ["change", "state", "max"]
        }) as never,
      "week-days"
    )) as unknown as Rows;

    const kwh = (id: string | undefined, day: number): number | undefined => {
      if (!id) return undefined;
      const row = (rows?.[id] ?? []).find((r) => {
        const start = new Date(toMillis(r.start));
        const at = new Date(day);
        return start.getFullYear() === at.getFullYear() && start.getMonth() === at.getMonth() && start.getDate() === at.getDate();
      });
      const entity = stateOf(hass, id);
      const value = dayTotal(row, entity?.attributes?.state_class, entity?.attributes?.last_reset != null);
      if (value === undefined) return undefined;
      return unitOf(entity).toLowerCase() === "wh" ? value / 1000 : value;
    };
    const week: WeekDay[] = [];
    for (let index = 0; index < 7; index += 1) {
      const at = new Date(first);
      at.setDate(first.getDate() + index);
      const day = at.getTime();
      week.push({
        day,
        solar: kwh(config.entities.solar_today, day),
        house: kwh(config.entities.house_today, day),
        imported: kwh(config.entities.import_today, day)
      });
    }
    this._week = week;
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
        <!-- Saying which sensor is silent turns a shrug into a lead. -->
        <div class="row-note dim">${localize("state.unreachable", locale)} ${config.entities.house}</div>
      </ha-card>`;
    }

    const gridfree = !worthNaming(flow.fromGrid, flow.house);
    const alarm = this._importAlarm(flow);
    const chipAlarm = config.chip_alarm && alarm;
    const showChip =
      config.chip === "always" || (config.chip === "gridfree" && gridfree) || chipAlarm;
    const sunDown = stateOf(hass, "sun.sun")?.state === "below_horizon";

    // The chip: the state, the day's share, or the draw that would not stop.
    const houseDay = energyKwh(stateOf(hass, config.entities.house_today));
    const importDay = energyKwh(stateOf(hass, config.entities.import_today));
    const dayShare =
      houseDay !== undefined && importDay !== undefined && houseDay > 0
        ? Math.min(1, Math.max(0, (houseDay - importDay) / houseDay))
        : flow.autarky;
    const chip = chipAlarm
      ? html`<span class="chip alarm">${formatPower(flow.fromGrid, locale)} kW ${localize("state.importing", locale)}</span>`
      : config.chip_shows === "autarky"
        ? html`<span class="chip ${dayShare >= 0.8 ? "gridfree" : "importing"}">
            ${formatNumber(dayShare * 100, locale, 0)} % ${localize("chip.autarky", locale)}
          </span>`
        : html`<span class="chip ${gridfree ? "gridfree" : "importing"}">
            ${localize(gridfree ? "state.gridfree" : "state.importing", locale)}
          </span>`;

    // This hour's price against the day's mean: a colour before a number.
    const price = config.head_price ? priceOf(stateOf(hass, config.entities.price_import)) : undefined;
    const mean = this._priceMean;
    const priceTone =
      price === undefined || mean === undefined
        ? ""
        : price < mean * 0.9
          ? "cheap"
          : price > mean * 1.1
            ? "dear"
            : "";
    const priceTag =
      price !== undefined
        ? this._linked(
            config.entities.price_import,
            html`<span class="head-price ${priceTone}">${formatMoney(price, locale)} €/kWh</span>`
          )
        : nothing;

    // With no title and no price the head is one word in a row of its own.
    // The word belongs to the ring anyway, so it rides in the ring's corner
    // and follows the ring wherever the order puts it. Two columns reach the
    // top corners themselves, so there it stays in the head.
    const chipRidesRing =
      !config.title &&
      price === undefined &&
      config.sections.ring &&
      config.shape !== "compact" &&
      config.ring.facts === "none" &&
      config.ring.columns !== "two";

    return html`
      <!-- One class swaps the grid token for the whole card, so the same
           kilowatts wear the same colour wherever they appear. -->
      <ha-card style="--sst-scale: ${config.text_scale}; --sst-night: ${(1 - config.night_dim / 100).toFixed(2)}"
        class="${(config.ring.import_red && flow.fromGrid > 0) || (config.ring.import_switch && alarm) ? "import-alarm" : ""} ${
          config.shape === "wide" && this._wideOn ? "wide" : ""
        } ${config.night_dim > 0 && sunDown ? "night" : ""} ${config.font === "system" ? "font-system" : ""} ${config.palette === "standard" ? "" : "palette-" + config.palette}">
        ${config.title || (showChip && !chipRidesRing) || price !== undefined
          ? html`<div class="head ${config.title || price !== undefined ? "" : "bare"}">
              ${config.title || price !== undefined
                ? html`<span class="head-left">${config.title ? html`<p class="title">${config.title}</p>` : nothing}${priceTag}</span>`
                : nothing}
              ${showChip && !chipRidesRing ? chip : nothing}
            </div>`
          : nothing}
        ${config.head_sunbar && !config.sections.chart ? this._renderSunbar(sunDown, locale) : nothing}
        ${config.shape === "compact"
          ? this._renderCompact(flow, locale, config.ring.import_switch && alarm)
          : (() => {
              // Quiet night: what has nothing to say once the sun is down steps aside.
              const quiet = config.night_layout === "quiet" && sunDown;
              const ring = config.sections.ring
                ? this._renderRing(
                    flow,
                    locale,
                    config.ring.import_switch && alarm,
                    quiet,
                    chipRidesRing && showChip ? chip : undefined
                  )
                : nothing;
              // Which block is the foot depends on what is switched on, not on
              // what the order names.
              const shown = blockOrder(config).filter((block) => config.sections[block]);
              const blocks = {
                ring,
                chart: config.sections.chart ? this._renderChart(locale, quiet) : nothing,
                week: config.sections.week && !quiet ? this._renderWeek(locale) : nothing,
                battery: config.sections.battery ? this._renderBattery(locale) : nothing,
                today:
                  config.sections.today && !quiet
                    ? this._renderToday(flow, locale, shown.at(-1) === "today")
                    : nothing,
                devices: config.sections.devices && !quiet ? this._renderDevices(locale) : nothing
              };
              const order = blockOrder(config);
              // Wide keeps the ring on its own side, whatever the order says.
              return config.shape === "wide" && this._wideOn
                ? html`<div class="side">${ring}</div>
                    <div class="main">${order.filter((b) => b !== "ring").map((b) => blocks[b])}</div>`
                : html`${order.map((b) => blocks[b])}`;
            })()}
      </ha-card>
    `;
  }

  /**
   * One row: the ring small, three figures beside it, the chip at the end.
   * For an overview page where the card only has to say all is well.
   */
  private _renderCompact(flow: Flow, locale: string, alarm: boolean) {
    const config = this._config as ResolvedConfig;
    const hass = this._hass as HomeAssistant;
    const soc = numberOf(stateOf(hass, config.entities.battery_soc));
    const exporting = flow.toGrid >= flow.fromGrid;
    const tile = (key: string, value: string, unit: string, tone: string) => html`
      <div class="stat">
        <span class="stat-k">${localize(key, locale)}</span>
        <span class="stat-v ${tone}">${value} <small>${unit}</small></span>
      </div>`;
    return html`
      <div class="compact">
        ${this._renderRing(flow, locale, alarm, true)}
        <div class="compact-stats">
          ${config.entities.solar
            ? tile("compact.roof", formatPower(flow.production, locale), "kW", "sun")
            : nothing}
          ${config.entities.grid_power || config.entities.solar
            ? tile(
                exporting ? "flow.to_grid" : "flow.from_grid",
                formatPower(exporting ? flow.toGrid : flow.fromGrid, locale),
                "kW",
                exporting ? "sun" : "grid"
              )
            : nothing}
          ${soc !== undefined ? tile("battery.title", formatNumber(soc, locale, 0), "%", "leaf") : nothing}
        </div>
      </div>
    `;
  }

  /**
   * Grid draw that lasts. Two minutes of drawing throw the switch, five
   * minutes without it let go, so a kettle never trips it and a heat pump
   * never flickers it. The next crossing is scheduled, since nothing else
   * would redraw the card at that moment.
   */
  private _importAlarm(flow: Flow): boolean {
    const config = this._config as ResolvedConfig;
    if (!config.ring.import_switch && !config.chip_alarm) return false;
    const ON = 2 * 60 * 1000;
    const OFF = 5 * 60 * 1000;
    const now = Date.now();
    const drawing = flow.fromGrid > 0.05;
    if (drawing) {
      this._importSince ??= now;
      this._importLast = now;
    } else {
      this._importSince = undefined;
    }
    const held = this._importSince !== undefined && now - this._importSince >= ON;
    const lingering = this._importLast !== undefined && now - this._importLast < OFF;
    this._importOn = held || (this._importOn && lingering);

    const next =
      drawing && !held
        ? (this._importSince as number) + ON - now
        : this._importOn && !drawing
          ? (this._importLast as number) + OFF - now
          : undefined;
    window.clearTimeout(this._importTimer);
    if (next !== undefined) {
      this._importTimer = window.setTimeout(() => this.requestUpdate(), next + 50);
    }
    return this._importOn;
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.clearTimeout(this._importTimer);
    this._resize?.disconnect();
    this._resize = undefined;
  }

  /**
   * The sun's day as a line under the heading: sunrise to sunset with the sun
   * where it stands, or, once it is down, the night with the moon. For a
   * card without the day chart, which draws the same day at length.
   */
  private _renderSunbar(sunDown: boolean, locale: string) {
    const hass = this._hass as HomeAssistant;
    const times = sunTimes(stateOf(hass, "sun.sun"));
    const now = Date.now();
    let from: number | undefined;
    let to: number | undefined;
    if (sunDown) {
      const night = this._nightSoFar();
      if (night) {
        const total = night.hoursLeft / (1 - night.done);
        from = now - night.done * total * 3600000;
        to = now + night.hoursLeft * 3600000;
      }
    } else {
      from = times.rising?.getTime();
      to = times.setting?.getTime();
    }
    if (from === undefined || to === undefined || to <= from) return nothing;
    const done = Math.min(1, Math.max(0, (now - from) / (to - from)));
    return html`
      <div class="sunbar ${sunDown ? "night" : ""}">
        <span class="sunbar-track">
          <span class="sunbar-done" style="width: ${(done * 100).toFixed(1)}%"></span>
          <i class="sunbar-mark" style="left: ${(done * 100).toFixed(1)}%"
            ><ha-icon icon="${sunDown ? "mdi:weather-night" : "mdi:white-balance-sunny"}"></ha-icon
          ></i>
        </span>
        <div class="sunbar-ends">
          <span>${formatClock(new Date(from), locale)}</span>
          <span>${formatClock(new Date(to), locale)}</span>
        </div>
      </div>
    `;
  }

  /**
   * Whether the roof counts as producing. At dusk the inverter hands out its
   * last watts around any single threshold, and the ring would flip with every
   * reading; so there are two, and between them the last answer stands. The
   * sun has the final word: once it is below the horizon the day is over,
   * whatever the meter still reads.
   */
  private _isProducing(flow: Flow): boolean {
    if (stateOf(this._hass, "sun.sun")?.state === "below_horizon") {
      this._producing = false;
      return false;
    }
    const was = this._producing ?? flow.production > 0.05;
    const producing = was ? flow.production > 0.02 : flow.production > 0.15;
    this._producing = producing;
    return producing;
  }

  private _renderRing(flow: Flow, locale: string, alarm = false, bare = false, chip?: unknown) {
    const config = this._config as ResolvedConfig;
    const hass = this._hass as HomeAssistant;
    // A ring about production says nothing before sunrise, so both production
    // views fall back to the source ring rather than showing an empty circle.
    const producing = this._isProducing(flow);
    const night = !producing;
    let leftSubject = this._subjectFor(config.ring.meter_style, config.ring.meter_dark, night);
    // Without a second column there is nothing to switch; the value is never read.
    let rightSubject =
      config.ring.meter_second === "none"
        ? "blocks"
        : this._subjectFor(config.ring.meter_second, config.ring.meter_second_dark, night);
    // Lasting draw puts the grid where it can be seen: the right column, or the only one.
    if (alarm && config.ring.meter) {
      // A column that was not the grid becomes the grid's needle in blocks.
      if (config.ring.meter_second !== "none") {
        rightSubject =
          config.ring.meter_second_shows === "grid" ? config.ring.meter_second_drawn : "blocks";
      } else {
        leftSubject = config.ring.meter_shows === "grid" ? config.ring.meter_drawn : "blocks";
      }
    }

    // A kilowatt is not a decision; a euro an hour is, and on a moving tariff
    // the two do not track each other.
    const buy = priceOf(stateOf(hass, config.entities.price_import));
    const sell = priceOf(stateOf(hass, config.entities.price_export));
    const priced = buy !== undefined || sell !== undefined;
    const perHour = flow.toGrid * (sell ?? 0) - flow.fromGrid * (buy ?? 0);

    const mode = this._centreMode(night, priced);
    const timeLeft = mode === "runtime" ? this._batteryTime() : undefined;
    this._centreShowsTime = timeLeft !== undefined;
    this._columnShowsTime = false;
    this._centreShown = mode;
    const showAutarky = mode === "autarky";
    const showSurplus = mode === "surplus" && producing;
    const showProduction = mode === "production" && producing;
    const showMoney = mode === "money";
    const cycle = config.ring.tap === "cycle";

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

    const value = timeLeft
      ? formatDuration(timeLeft.hours, locale)
      : showAutarky
        ? formatNumber(flow.autarky * 100, locale, 0)
        : showMoney
          ? `${perHour < -0.005 ? "−" : "+"}${formatMoney(Math.abs(perHour), locale)}`
          : formatPower(centreValue, locale);
    const unit = timeLeft ? "" : showAutarky ? "%" : showMoney ? "€/h" : "kW";

    const soleSource =
      parts.length === 1 && !showSurplus && !showProduction && !showAutarky && !showMoney
        ? parts[0].key
        : undefined;

    const captionKey = showAutarky
      ? "ring.caption_autarky"
      : showMoney
        ? perHour > 0.005
          ? "ring.caption_earning"
          : perHour < -0.005
            ? "ring.caption_costing"
            : "ring.caption_even"
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

    // The night around the ring: the outer band fills from sunset to sunrise.
    // The battery’s own time keeps the caption when both have one to give.
    const sunDown = stateOf(hass, "sun.sun")?.state === "below_horizon";
    const nightArc = config.ring.night === "countdown" && sunDown ? this._nightSoFar() : undefined;
    const countdown = nightArc && !timeLeft
      ? `${formatDuration(nightArc.hoursLeft, locale)} ${localize("ring.to_sun", locale)}`
      : undefined;

    const caption = !config.ring.caption
      ? undefined
      : timeLeft
        ? `${localize("ring.caption_until", locale)} ${formatClock(timeLeft.at, locale)}`
        : countdown ?? localize(captionKey, locale);

    // The outer ring answers the same question over the whole day, in the same
    // colours. Only the window differs, so the two cannot contradict each other.
    const clock = config.ring.rings === "clock" ? this._hours : undefined;
    const asClock = clock !== undefined && worthDrawing(clock);
    // The same day outside, with now still inside: the band is thinner because
    // it is a memory. At night the countdown takes the band instead.
    const dayclock =
      !nightArc && config.ring.rings === "dayclock" && this._hours && worthDrawing(this._hours)
        ? this._hours
        : undefined;
    const farMarks = config.ring.clock_marks && (nightArc !== undefined || dayclock !== undefined);
    const soc =
      config.ring.inner === "battery" ? numberOf(stateOf(hass, config.entities.battery_soc)) : undefined;
    const modes = cycle ? this._cycleModes(producing, priced) : [];
    const cycleHandlers = cycle
      ? {
          click: (event: Event) => {
            event.stopPropagation();
            this._cycle(producing, priced, mode);
          },
          key: (event: KeyboardEvent) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            this._cycle(producing, priced, mode);
          }
        }
      : undefined;

    const wantsOuter = config.ring.rings === "double" && !nightArc;
    let outer: Array<{ colour: string; length: number; offset: number; faint?: boolean }> = [];

    if (wantsOuter && (showProduction || showSurplus)) {
      const hass = this._hass as HomeAssistant;
      const produced = energyKwh(stateOf(hass, config.entities.solar_today)) ?? 0;
      const expected = config.chart.show_forecast
        ? (this._kwhOf(config.entities.forecast) ?? 0)
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
      <div class="ring-block ${config.ring.layout} ${chip ? "chipped" : ""}">
        ${chip ?? nothing}
        <div class="ring-group size-${bare ? "s" : config.ring.size} ${config.ring.facts === "none" || bare ? "solo" : ""}">
        ${bare ? nothing : this._renderMeter(flow, locale, leftSubject)}
        <svg class="ring ${showSurplus ? "surplus" : ""} ${cycle ? "cycle" : ""}"
             viewBox="${farMarks ? "-17 -17 234 234" : "0 0 200 200"}"
             role="${cycle ? "button" : "img"}" aria-label="${value} ${unit}"
             tabindex="${cycle ? 0 : -1}"
             @click=${cycleHandlers?.click} @keydown=${cycleHandlers?.key}>
          ${nightArc
            ? svg`<circle class="night-track" cx="100" cy="100" r="93" pathLength="100"></circle>
                <circle class="night-arc" cx="100" cy="100" r="93" pathLength="100"
                  stroke-dasharray="${(nightArc.done * 100).toFixed(2)} 100"
                  transform="rotate(-90 100 100)"></circle>`
            : dayclock
              ? svg`${dayclock.map(
                  (entry) => svg`<circle
                    class="clock-hour out ${entry.dominant ?? "empty"}"
                    cx="100" cy="100" r="93" pathLength="100"
                    stroke-dasharray="${(100 / 24 - 0.35).toFixed(2)} 100"
                    stroke-dashoffset="${(-(entry.hour * 100) / 24).toFixed(2)}"
                    transform="rotate(90 100 100)"
                  ></circle>`
                )}
                <circle class="clock-now" cx="100" cy="193" r="3.5"
                  transform="rotate(${((dayclock.at(-1)!.hour + 0.5) * 15).toFixed(1)} 100 100)"
                ></circle>`
              : outer.length
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
          ${farMarks ? this._farMarks(nightArc === undefined) : nothing}
          <circle class="ring-track" cx="100" cy="100" r="76" pathLength="100"></circle>
          ${soc !== undefined
            ? svg`<circle class="ring-soc-track" cx="100" cy="100" r="60" pathLength="100"></circle>
                <circle class="ring-soc" cx="100" cy="100" r="60" pathLength="100"
                  stroke-dasharray="${Math.min(100, Math.max(0, soc)).toFixed(1)} 100"
                  transform="rotate(-90 100 100)"></circle>`
            : nothing}
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
            // With a tap that steps the centre on, the figure is not a way anywhere.
            const on = !cycle && source && (this._hass as HomeAssistant)?.states?.[source];
            const handlers = on ? this._tap(source!) : undefined;
            return svg`<text class="ring-value ${on ? "tap" : ""}" x="100"
              y="${caption ? 104 : 112}" text-anchor="middle"
              @click=${handlers?.click} @keydown=${handlers?.key}
              tabindex="${on ? 0 : -1}"
              >${value}<tspan dx="5">${unit}</tspan></text>`;
          })()}
          ${
            caption
              ? svg`<text class="ring-caption ${countdown && caption === countdown ? "plain" : ""}"
                  x="100" y="126" text-anchor="middle">${caption}</text>`
              : nothing
          }
          ${modes.length > 1
            ? svg`<g class="ring-dots" aria-hidden="true">${modes.map(
                (each, index) => svg`<circle class="${each === mode ? "on" : ""}"
                  cx="${(100 + (index - (modes.length - 1) / 2) * 8).toFixed(1)}" cy="148" r="2.2"></circle>`
              )}</g>`
            : nothing}

        </svg>
        ${config.ring.meter_second === "none" || bare
          ? nothing
          : this._renderMeter(flow, locale, rightSubject, true)}
        </div>
        ${config.ring.columns === "scale" && !bare ? this._renderScale(flow, locale) : nothing}
        ${bare ? nothing : this._renderLegend(flow, locale)}
      </div>
    `;
  }

  /**
   * The left column laid flat under the ring: one needle, draw to the left,
   * surplus to the right. The direction is read before any number is, and
   * the card grows no wider for it.
   */
  private _renderScale(flow: Flow, locale: string) {
    const config = this._config as ResolvedConfig;
    if (!config.entities.solar) return nothing;
    const withBattery = config.ring.meter_scope === "all";
    const meter = meterGeometry(
      {
        toBattery: withBattery ? flow.toBattery : 0,
        toGrid: flow.toGrid,
        fromGrid: flow.fromGrid,
        fromBattery: withBattery ? flow.fromBattery : 0
      },
      config.ring.meter_scale,
      this._yearPeak ?? this._series?.solarPeak ?? 0,
      0,
      config.ring.meter_scale_draw
    );
    const W = 300;
    const half = W / 2;
    const REAL = 0.05;
    const drawing = meter.deficit > REAL;
    const exporting = flow.toGrid > REAL;
    const charging = withBattery && flow.toBattery > REAL;
    const quiet = !drawing && !exporting && !charging;
    const amount = drawing ? meter.deficit : meter.surplus;
    const key = drawing
      ? withBattery && flow.fromBattery > REAL && flow.fromGrid > REAL
        ? "meter.draw"
        : withBattery && flow.fromBattery > REAL
          ? "flow.from_battery"
          : "meter.import"
      : exporting && charging
        ? "meter.surplus"
        : exporting
          ? "meter.export"
          : charging
            ? "meter.charging"
            : "meter.quiet";
    const tone = drawing ? "down" : exporting || charging ? "up" : "idle";
    // The geometry grows upward from the middle; here upward is rightward.
    const flat = (band: { y: number; height: number }, up: boolean) => {
      const from = up ? METER_HEIGHT / 2 - band.y - band.height : band.y - METER_HEIGHT / 2;
      const scaleTo = (v: number) => (v / (METER_HEIGHT / 2)) * half;
      return up
        ? { x: half + scaleTo(from), width: scaleTo(band.height) }
        : { x: half - scaleTo(from) - scaleTo(band.height), width: scaleTo(band.height) };
    };
    return html`
      <div class="scale ${tone}">
        <svg class="full" viewBox="0 0 ${W} 14" role="img" aria-label="${localize(key, locale)}">
          <rect class="scale-track" x="0" y="2" width="${W}" height="10" rx="5"></rect>
          ${meter.bands.map((band) => {
            const up = band.y < METER_HEIGHT / 2;
            const at = flat(band, up);
            return svg`<rect class="scale-on ${band.key}" x="${at.x.toFixed(1)}" y="2"
              width="${at.width.toFixed(1)}" height="10" rx="4"></rect>`;
          })}
          <line class="scale-zero" x1="${half}" x2="${half}" y1="0" y2="14"></line>
        </svg>
        <div class="scale-ends">
          <span>${PYLON} ${localize("flow.from_grid", locale)}</span>
          <span>${localize("flow.to_grid", locale)} ${PYLON}</span>
        </div>
        <div class="scale-value">
          ${quiet ? nothing : html`${formatPower(amount, locale)} <small>kW</small>`}
          <span class="meter-word">${localize(key, locale)}</span>
        </div>
      </div>
    `;
  }

  /**
   * Sun and moon outside an outer band, where the band cannot cover them. The
   * day reads noon-up like the clock; the night reads sunset-up, so the moon
   * stands where the night began and the sun where it ends.
   */
  private _farMarks(sunOnTop: boolean) {
    const sun = (y: number) => svg`
      <g class="clock-mark sun" transform="translate(100 ${y})">
        <circle cx="0" cy="0" r="2.7"></circle>
        <path d="M0,-6.2 L0,-4.6 M0,4.6 L0,6.2 M-6.2,0 L-4.6,0 M4.6,0 L6.2,0
                 M-4.4,-4.4 L-3.3,-3.3 M3.3,3.3 L4.4,4.4 M4.4,-4.4 L3.3,-3.3
                 M-3.3,3.3 L-4.4,4.4"></path>
      </g>`;
    const moon = (y: number) => svg`<path class="clock-mark moon"
      d="M100,${y} a5.2,5.2 0 1,0 4.7,-3 a4,4 0 1,1 -4.7,3 z"></path>`;
    return sunOnTop ? svg`${sun(-8)}${moon(211)}` : svg`${moon(-6)}${sun(208)}`;
  }

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
  /** Whether any column, by day or by night, shows the subject. */
  private _usesSubject(subject: MeterStyle): boolean {
    const config = this._config;
    if (!config) return false;
    return [
      config.ring.meter_style,
      config.ring.meter_second,
      config.ring.meter_dark,
      config.ring.meter_second_dark
    ].includes(subject);
  }

  /**
   * The subject a column shows now. Once the sun is down a column may say
   * something else, the way the ring’s centre already does.
   */
  private _subjectFor(day: MeterStyle, dark: MeterShows | "same", night: boolean): MeterStyle {
    if (!night || dark === "same") return day;
    if (dark === "grid") return day === "blocks" || day === "bar" ? day : "blocks";
    return dark;
  }

  private _needsHours(): boolean {
    const config = this._config;
    if (!config) return false;
    return (
      config.ring.rings === "clock" ||
      config.ring.rings === "dayclock" ||
      config.ring.meter_style === "day" ||
      config.ring.meter_second === "day" ||
      config.ring.meter_today ||
      config.ring.meter_second_today ||
      (config.sections.chart && config.chart.layers) ||
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

  /**
   * The same boundary priced. A kilowatt is not a decision; a euro an hour is,
   * and on a moving tariff the two do not track each other.
   */
  private _renderMoneyMeter(flow: Flow, locale: string) {
    const config = this._config as ResolvedConfig;
    const hass = this._hass as HomeAssistant;
    const buy = priceOf(stateOf(hass, config.entities.price_import));
    const sell = priceOf(stateOf(hass, config.entities.price_export));
    if (buy === undefined && sell === undefined) return nothing;

    const earning = flow.toGrid * (sell ?? 0);
    const costing = flow.fromGrid * (buy ?? 0);
    const top = Math.max(0.2, earning, costing);

    const up = Math.min(1, earning / top);
    const down = Math.min(1, costing / top);
    const net = earning - costing;

    return this._renderTwoWay(
      up,
      down,
      formatMoney(Math.abs(net), locale),
      "\u20ac/h",
      localize(net >= 0 ? "meter.earning" : "meter.costing", locale),
      net >= 0
    );
  }

  /**
   * The house against the day it has had so far. The middle is an ordinary
   * hour, so a spike says something is running that usually is not.
   */
  private _renderLoadMeter(flow: Flow, locale: string) {
    const average = this._series?.house?.length
      ? this._series.house.reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0) /
        this._series.house.filter((value) => Number.isFinite(value)).length
      : undefined;
    if (average === undefined || average <= 0) return nothing;

    const ratio = flow.house / average;
    const up = Math.min(1, Math.max(0, ratio - 1));
    const down = Math.min(1, Math.max(0, 1 - ratio));
    const quiet = Math.abs(ratio - 1) < 0.08;

    return this._renderTwoWay(
      up,
      down,
      formatPower(flow.house, locale),
      "kW",
      localize(
        quiet ? "meter.usual" : ratio > 1 ? "meter.above" : "meter.below",
        locale
      ),
      ratio <= 1
    );
  }

  /** No middle to speak of: it fills from nothing to everything. */
  private _renderAutarkyMeter(flow: Flow, locale: string, second = false) {
    const config = this._config as ResolvedConfig;
    const drawn = second ? config.ring.meter_second_drawn : config.ring.meter_drawn;
    const steps = second ? config.ring.meter_second_steps : config.ring.meter_steps;
    const share = Math.min(1, Math.max(0, flow.autarky));
    const height = METER_HEIGHT * share;
    // Graded, the column says at a glance who carries the house.
    const grade = !config.ring.autarky_colours
      ? undefined
      : share < 0.5
        ? "low"
        : share < 0.8
          ? "mid"
          : "good";

    return html`
      <div class="meter-block">
        <svg class="meter" viewBox="0 0 88 ${METER_HEIGHT}" role="img"
             aria-label="${localize("meter.autarky", locale)}">
          ${drawn === "blocks"
            ? this._cells(share, grade ? `fill-share-${grade}` : "fill-leaf", steps)
            : svg`
          <rect class="bal-track" x="8" y="0" width="72" height="${METER_HEIGHT}" rx="6"></rect>
          <rect class="bat-fill ${grade ? `fill-share-${grade}` : "fill-leaf"}" x="8" y="${(METER_HEIGHT - height).toFixed(1)}"
                width="72" height="${height.toFixed(1)}" rx="6"></rect>`}
        </svg>
        <div class="meter-label ${grade ? `share-${grade}` : "up"}">
          <span class="meter-value">${formatNumber(flow.autarky * 100, locale, 0)} <small>%</small></span>
          <span class="meter-word">${localize("meter.autarky", locale)}</span>
        </div>
      </div>
    `;
  }


  /**
   * What the roof makes now against the best it managed today. Without that
   * mark the kilowatts alone never say whether this is a good moment.
   */
/** A column showing the roof already prints this hour, and nothing twice. */
  private _roofInColumn(): boolean {
    const config = this._config as ResolvedConfig;
    return (
      config.sections.ring &&
      config.ring.meter &&
      (config.ring.meter_style === "roof" || config.ring.meter_second === "roof")
    );
  }

  private _renderRoofMeter(flow: Flow, locale: string, second = false) {
    const config = this._config as ResolvedConfig;
    if (!config.entities.solar) return nothing;

    const showPeak = second ? config.ring.meter_second_top : config.ring.meter_top;
    const drawn = second ? config.ring.meter_second_drawn : config.ring.meter_drawn;
    const steps = second ? config.ring.meter_second_steps : config.ring.meter_steps;

    // The column reaches what the system can do, so that today's best can
    // stand inside it as a shadow and now as the light on top: three readings
    // in one shape. Without a year behind it, today's best is the scale.
    const peak = Math.max(this._series?.solarPeak ?? 0, flow.production);
    const scale = Math.max(this._yearPeak ?? 0, peak);
    const shareNow = scale > 0 ? Math.min(1, Math.max(0, flow.production / scale)) : 0;
    const sharePeak = scale > 0 ? Math.min(1, peak / scale) : 0;
    const height = METER_HEIGHT * shareNow;
    const shadow = METER_HEIGHT * sharePeak;

    // Today's best is a mark at its height inside the column; only when it is
    // the top of the column itself does it stand above as the figure.
    const peakAtTop = sharePeak >= 0.995;
    return html`
      <div class="meter-block">
        ${showPeak && peak > 0 && peakAtTop
          ? html`<span class="meter-top">${formatPower(peak, locale)} kW</span>`
          : nothing}
        <svg class="meter" viewBox="0 0 88 ${METER_HEIGHT}" role="img"
             aria-label="${localize("meter.roof", locale)}">
          ${showPeak && peak > 0 && !peakAtTop
            ? svg`<line class="range-mark" x1="4" x2="84"
                y1="${(METER_HEIGHT * (1 - sharePeak)).toFixed(1)}"
                y2="${(METER_HEIGHT * (1 - sharePeak)).toFixed(1)}"></line>`
            : nothing}
          ${drawn === "blocks"
            ? this._cells(shareNow, "fill-sun", steps, { shadow: sharePeak })
            : svg`
          <rect class="bal-track" x="8" y="0" width="72" height="${METER_HEIGHT}" rx="6"></rect>
          ${shadow > height
            ? svg`<rect class="bat-fill fill-sun held roof-best" x="8"
                    y="${(METER_HEIGHT - shadow).toFixed(1)}" width="72"
                    height="${shadow.toFixed(1)}" rx="6"></rect>`
            : nothing}
          <rect class="bat-fill fill-sun" x="8" y="${(METER_HEIGHT - height).toFixed(1)}"
                width="72" height="${height.toFixed(1)}" rx="6"></rect>`}
        </svg>
        <div class="meter-label up">
          <span class="meter-value">${formatPower(flow.production, locale)} <small>kW</small></span>
          <span class="meter-word">${localize("meter.roof", locale)}</span>
        </div>
      </div>
    `;
  }

  /** The battery as the card’s battery block sees it, for the ring and the columns. */
  private _batteryFacts(): { view: BatteryView; soc?: number; usableKwh?: number; sunrise?: Date; hoursToSunrise?: number } {
    const config = this._config as ResolvedConfig;
    const hass = this._hass as HomeAssistant;
    const soc = numberOf(stateOf(hass, config.entities.battery_soc));
    const rawPower = powerKw(stateOf(hass, config.entities.battery_power));
    const power = rawPower === undefined ? undefined : config.battery_invert ? -rawPower : rawPower;
    const rawMean = this._cellMean;
    const averagePower =
      rawMean === undefined ? undefined : config.battery_invert ? -rawMean : rawMean;
    const view = batteryView({
      soc,
      power,
      averagePower,
      capacity: config.battery_capacity || undefined,
      reserve: config.battery_reserve,
      averageLoad: this._series?.houseAverage,
      loadSpread: this._series?.houseSpread,
      lastMode: this._batteryMode
    });
    this._batteryMode = view.mode;
    this._refineFull(view);
    const sunrise = sunTimes(stateOf(hass, "sun.sun")).nextRising;
    const hoursToSunrise = sunrise ? (sunrise.getTime() - Date.now()) / 3600000 : undefined;
    return { view, soc, usableKwh: view.availableKwh, sunrise, hoursToSunrise };
  }

  /**
   * The full time, checked against the day. From the forecast when asked:
   * the roof minus the house, hour by hour until sunset. Otherwise the rate's
   * straight line, which is dropped once it runs past the sunset or a day.
   */
  private _refineFull(view: BatteryView): void {
    if (view.soc === undefined || view.soc >= 99) return;
    const config = this._config as ResolvedConfig;
    const hass = this._hass as HomeAssistant;
    const now = new Date();
    const sun = stateOf(hass, "sun.sun");
    const sunUp = sun?.state === "above_horizon";
    const setting = sunTimes(sun, now).setting;
    const capacityKwh = config.battery_capacity ? config.battery_capacity / 1000 : undefined;

    // A battery resting by day, because the house is eating the roof, still
    // has a day ahead of it; the forecast can say whether that day fills it.
    // The rate cannot, so its straight line stays with charging.
    const resting = view.mode === "idle" && sunUp;
    if (view.mode !== "charging" && !resting) return;

    // The last hour of sun fills nothing, and the forecast's three answers for
    // it trade places with every reading. The day is decided; say nothing.
    const DUSK = 3600 * 1000;
    if (sunUp && setting && setting.getTime() - now.getTime() < DUSK) {
      view.at = undefined;
      view.hours = undefined;
      view.full = undefined;
      return;
    }

    if (config.battery.full_from === "forecast" && config.entities.forecast_hourly.length > 0 && capacityKwh) {
      const slots = this._hoursOf(config.entities.forecast_hourly);
      if (slots.length) {
        const headroom = capacityKwh * Math.max(0, (100 - view.soc) / 100);
        // Five hours of afternoon are not the last half hour: the oven that ran
        // at noon has no say in the evening. The day since sunrise does.
        const load = this._daylightLoad() ?? this._series?.houseAverage ?? powerKw(stateOf(hass, config.entities.house)) ?? 0;
        const until = sunUp ? setting : undefined;
        const found = fullFromForecast(slots, now, headroom, load, until);
        const span = fullSpan(slots, now, headroom, load, until);
        // The median is the answer. The pessimistic edge is the day one time
        // in ten; judged by it, a battery would never fill on a good day, and
        // a card that says so every morning is ignored by the afternoon.
        if (found.at) {
          view.at = found.at;
          view.hours = (found.at.getTime() - now.getTime()) / 3600000;
          view.full = "forecast";
          // An hour named to the minute out of a day that could go either way
          // is a claim, not an answer. Past two hours apart, say the span.
          const APART = 2 * 3600 * 1000;
          if (span.edges && span.early && span.late && span.late.getTime() - span.early.getTime() > APART) {
            view.full = "between";
            view.early = span.early;
            view.late = span.late;
          }
        } else {
          view.at = undefined;
          view.hours = undefined;
          view.full = "not_today";
          view.socAtSunset = Math.min(100, view.soc + (found.reachedKwh / capacityKwh) * 100);
        }
        return;
      }
    }

    if (view.mode === "charging" && fullVerdict(view.at, now, setting, sunUp) === "not_today") {
      view.at = undefined;
      view.hours = undefined;
      view.full = "not_today";
    }
  }

  /** Several forecast sensors as one figure: their energies added up, in kWh. */
  private _kwhOf(ids: string[]): number | undefined {
    const hass = this._hass as HomeAssistant;
    return sumEnergyKwh(ids.map((id) => stateOf(hass, id)));
  }

  /** Several hourly forecasts as one: the hours added up. */
  private _hoursOf(ids: string[]): ForecastHour[] {
    const hass = this._hass as HomeAssistant;
    return hourlyForecastAll(ids.map((id) => stateOf(hass, id)));
  }

  /** The house's mean draw since sunrise today, in kW; undefined before the day has readings. */
  private _daylightLoad(): number | undefined {
    const series = this._series;
    if (!series) return undefined;
    const rising = sunTimes(stateOf(this._hass, "sun.sun")).rising;
    const since = rising ? rising.getTime() : startOfToday().getTime();
    const samples = series.house.filter((_, i) => series.timestamps[i] >= since);
    if (samples.length < 6) return undefined;
    return samples.reduce((sum, kw) => sum + kw, 0) / samples.length;
  }

  /** The line about when it is full, in the words the forecast's certainty allows. */
  private _fullWords(view: BatteryView, locale: string): string[] {
    const parts: string[] = [];
    if (view.full === "between" && view.early && view.late) {
      parts.push(
        `${localize("battery.full_between", locale)} ${formatClock(view.early, locale)} ${localize("battery.and", locale)} ${formatClock(view.late, locale)}`
      );
    } else if (view.at) {
      const word = view.full === "forecast" ? "battery.full_about" : "battery.full_at";
      parts.push(`${localize(word, locale)} ${formatClock(view.at, locale)}`);
    } else if (view.full === "not_today") {
      // How far today gets it says on its own that full is not on today's
      // cards, and in fewer words than saying so first. The moon, when drawn,
      // shows the same place; the line says it for anyone who does not read symbols.
      if (view.socAtSunset !== undefined) {
        parts.push(
          `${localize("battery.today_up_to", locale)} ~${formatNumber(view.socAtSunset, locale, 0)} %`
        );
      } else {
        parts.push(localize("battery.not_full_today", locale));
      }
    }
    return parts;
  }

  /** How long the battery lasts, when it is the one carrying the house. */
  private _batteryTime(): { hours: number; at: Date } | undefined {
    const config = this._config as ResolvedConfig;
    if (!config.entities.battery_soc || !config.entities.battery_power) return undefined;
    const { view } = this._batteryFacts();
    if (view.mode !== "discharging" || view.hours === undefined || !view.at) return undefined;
    return { hours: view.hours, at: view.at };
  }

  /**
   * A column of cells filling from the foot, for a share of a whole: the
   * same shape the grid column has, so a card can be all blocks or all bars.
   * A shadow fills further, faintly, for the best the column has reached.
   */
  private _cells(
    share: number,
    fill: string,
    steps: number,
    options: { shadow?: number; heldBelow?: number; x?: number; width?: number } = {}
  ) {
    const n = Math.min(14, Math.max(3, Math.round(steps)));
    const gap = 2.6;
    const h = (METER_HEIGHT - gap * (n - 1)) / n;
    const x = options.x ?? 8;
    const width = options.width ?? 72;
    const clamp = (v: number) => Math.min(1, Math.max(0, v));
    return svg`${Array.from({ length: n }, (_, i) => {
      const y = METER_HEIGHT - (i + 1) * h - i * gap;
      const part = clamp(share * n - i);
      const shadow = options.shadow === undefined ? 0 : clamp(options.shadow * n - i);
      const held = options.heldBelow !== undefined && (i + 1) / n <= options.heldBelow + 1e-6;
      return svg`
        <rect class="meter-off" x="${x}" y="${y.toFixed(1)}" width="${width}" height="${h.toFixed(1)}" rx="3"></rect>
        ${shadow > part
          ? svg`<rect class="bat-fill ${fill} held roof-best" x="${x}" y="${(y + h * (1 - shadow)).toFixed(1)}"
                  width="${width}" height="${(h * shadow).toFixed(1)}" rx="3"></rect>`
          : nothing}
        ${part > 0
          ? svg`<rect class="bat-fill col-cell ${fill} ${held ? "held" : ""}" x="${x}"
                  y="${(y + h * (1 - part)).toFixed(1)}" width="${width}" height="${(h * part).toFixed(1)}" rx="3"></rect>`
          : nothing}`;
    })}`;
  }

  /**
   * The battery as a store: what it holds on a scale of its own size, the
   * reserve at the foot as power that never comes out, and at night a dashed
   * line where the charge will stand at sunrise. The block says the same in
   * percent; this is the picture for a card without the block.
   */
  private _renderBatteryColumn(locale: string, second = false) {
    const config = this._config as ResolvedConfig;
    const hass = this._hass as HomeAssistant;
    const soc = numberOf(stateOf(hass, config.entities.battery_soc));
    const capacityKwh = config.battery_capacity / 1000;
    if (soc === undefined || capacityKwh <= 0) return nothing;

    const showTop = second ? config.ring.meter_second_top : config.ring.meter_top;
    const drawn = second ? config.ring.meter_second_drawn : config.ring.meter_drawn;
    const steps = second ? config.ring.meter_second_steps : config.ring.meter_steps;
    const share = Math.min(1, Math.max(0, soc / 100));
    const reserve = Math.min(share, Math.max(0, config.battery_reserve / 100));
    const held = capacityKwh * Math.max(0, share - reserve);
    const dawn = this._socAtSunrise();
    const dawnY = dawn ? METER_HEIGHT * (1 - Math.min(1, Math.max(0, dawn.at / 100))) : undefined;

    return html`
      <div class="meter-block">
        ${showTop
          ? html`<span class="meter-top">${formatNumber(capacityKwh, locale, 1)} kWh</span>`
          : nothing}
        <svg class="meter" viewBox="0 0 88 ${METER_HEIGHT}" role="img"
             aria-label="${localize("battery.title", locale)} ${formatNumber(soc, locale, 0)} %">
          ${drawn === "blocks"
            ? this._cells(share, "fill-leaf", steps, { heldBelow: reserve })
            : svg`
          <rect class="bal-track" x="8" y="0" width="72" height="${METER_HEIGHT}" rx="6"></rect>
          ${share > reserve
            ? svg`<rect class="bat-fill fill-leaf" x="8" y="${(METER_HEIGHT * (1 - share)).toFixed(1)}"
                    width="72" height="${(METER_HEIGHT * (share - reserve)).toFixed(1)}" rx="6"></rect>`
            : nothing}
          ${reserve > 0
            ? svg`<rect class="bat-fill fill-leaf held" x="8"
                    y="${(METER_HEIGHT * (1 - reserve)).toFixed(1)}" width="72"
                    height="${(METER_HEIGHT * reserve).toFixed(1)}" rx="6"></rect>`
            : nothing}`}
          ${dawnY !== undefined
            ? svg`<line class="range-mark" x1="4" x2="84" y1="${dawnY.toFixed(1)}" y2="${dawnY.toFixed(1)}"></line>`
            : nothing}
        </svg>
        <div class="meter-label leaf">
          <span class="meter-value">${formatEnergy(held, locale)} <small>kWh</small></span>
          <span class="meter-word">${dawn
            ? `${formatNumber(dawn.at, locale, 0)} % ${localize("meter.at_sunrise", locale)}`
            : localize("battery.stored", locale)}</span>
        </div>
      </div>
    `;
  }

  /**
   * The night as a column: sunset at the top, sunrise at the bottom, a line
   * for now. From now the battery reaches as far as it lasts; what it does
   * not reach is the grid's, because that is who will supply it. A time axis
   * is read by anyone; kilowatt hours are not.
   */
  private _renderNightMeter(flow: Flow, locale: string, drawn: "blocks" | "bar", second = false) {
    const config = this._config as ResolvedConfig;
    const hass = this._hass as HomeAssistant;
    if (stateOf(hass, "sun.sun")?.state !== "below_horizon") return nothing;
    const night = this._nightSoFar();
    if (!night || night.done >= 1) return nothing;

    const H = METER_HEIGHT;
    const total = night.hoursLeft / (1 - night.done);
    const set = Date.now() - night.done * total * 3600000;
    const nowY = H * night.done;
    const lasts = this._batteryTime();
    // An empty battery is a night on the grid, and the column says so.
    const facts = config.entities.battery_soc ? this._batteryFacts() : undefined;
    const empty = facts?.usableKwh !== undefined && facts.usableKwh <= 0.05;
    const reach = lasts ? Math.min(lasts.hours, night.hoursLeft) : 0;
    const endY = nowY + (H * reach) / total;
    const short = lasts ? lasts.hours < night.hoursLeft : empty ? true : undefined;
    const load = this._series?.houseAverage ?? flow.house;
    const gapKwh = lasts && short ? (night.hoursLeft - lasts.hours) * load : undefined;
    const marks = second ? config.ring.meter_second_marks : config.ring.meter_marks;
    // Reaching the sun is one thing; with how much is the next, unless the
    // battery block already says it beside the bar.
    const dawn = lasts && !short && config.battery.extra !== "sunrise" ? this._socAtSunrise() : undefined;

    // The hours the night crosses, for the ticks along the left edge.
    const first = new Date(set);
    first.setMinutes(0, 0, 0);
    first.setHours(first.getHours() + 1);
    const ticks: Array<{ y: number; hour: number }> = [];
    for (let t = first.getTime(); t < set + total * 3600000; t += 3600000) {
      ticks.push({ y: (H * (t - set)) / (total * 3600000), hour: new Date(t).getHours() });
    }

    const state = (from: number, to: number): string =>
      to <= nowY ? "night-past" : lasts && from >= nowY && to <= endY + 0.5
        ? "night-reach"
        : (lasts || empty) && short && from >= endY - 0.5
          ? "night-short"
          : "bal-track";

    // The hours stand in the left margin, so the column gives up a little width.
    const X = 28;
    const W = 52;
    const body =
      drawn === "blocks"
        ? svg`${[...ticks.map((tick) => tick.y), H].map((to, index, all) => {
            const from = index === 0 ? 0 : all[index - 1];
            if (to - from < 1) return nothing;
            return svg`<rect class="${state(from, to)}" x="${X}" y="${(from + 0.7).toFixed(1)}"
              width="${W}" height="${Math.max(0.5, to - from - 1.4).toFixed(1)}" rx="2"></rect>`;
          })}`
        : svg`
          <rect class="bal-track" x="${X}" y="0" width="${W}" height="${H}" rx="6"></rect>
          <rect class="night-past" x="${X}" y="0" width="${W}" height="${nowY.toFixed(1)}" rx="6"></rect>
          ${lasts
            ? svg`<rect class="night-reach" x="${X}" y="${nowY.toFixed(1)}" width="${W}"
                    height="${(endY - nowY).toFixed(1)}" rx="4"></rect>`
            : nothing}
          ${(lasts || empty) && short
            ? svg`<rect class="night-short" x="${X}" y="${endY.toFixed(1)}" width="${W}"
                    height="${(H - endY).toFixed(1)}" rx="6"></rect>`
            : nothing}`;

    // The word is the reach; the time is the value, unless the centre has it.
    const countdownShown = config.ring.night === "countdown";
    let value: string | undefined;
    let word: string;
    if (lasts) {
      if (!this._centreShowsTime) {
        value = `${localize("ring.caption_until", locale)} ${formatClock(lasts.at, locale)}`;
        this._columnShowsTime = true;
      }
      word = short
        ? `${localize("meter.range_gap", locale)} ${formatEnergy(gapKwh as number, locale)} kWh`
        : dawn
          ? `${formatNumber(dawn.at, locale, 0)} % ${localize("meter.at_sunrise", locale)}`
          : localize("meter.range_reaches", locale);
    } else if (empty) {
      word = localize("meter.grid_until_sun", locale);
    } else if (!countdownShown) {
      value = formatDuration(night.hoursLeft, locale);
      word = localize("ring.to_sun", locale);
    } else {
      word = localize("meter.night", locale);
    }

    return html`
      <div class="meter-block">
        <svg class="meter" viewBox="${marks ? `0 -18 88 ${H + 36}` : `0 0 88 ${H}`}" role="img"
             aria-label="${localize("meter.night", locale)}">
          ${marks
            ? svg`<path class="clock-mark moon" d="M44,-14 a5.2,5.2 0 1,0 4.7,-3 a4,4 0 1,1 -4.7,3 z"></path>
                  <g class="clock-mark sun" transform="translate(44 ${H + 11})">
                    <circle cx="0" cy="0" r="2.7"></circle>
                    <path d="M0,-6.2 L0,-4.6 M0,4.6 L0,6.2 M-6.2,0 L-4.6,0 M4.6,0 L6.2,0
                             M-4.4,-4.4 L-3.3,-3.3 M3.3,3.3 L4.4,4.4 M4.4,-4.4 L3.3,-3.3
                             M-3.3,3.3 L-4.4,4.4"></path>
                  </g>`
            : nothing}
          ${body}
          ${ticks.map(
            (tick) => svg`<line class="night-tick" x1="${tick.hour % 4 === 0 ? 21 : 24}" x2="${X - 1}"
              y1="${tick.y.toFixed(1)}" y2="${tick.y.toFixed(1)}"></line>
              ${tick.hour % 4 === 0
                ? svg`<text class="night-hour" x="19" y="${(tick.y + 4).toFixed(1)}"
                    text-anchor="end">${String(tick.hour).padStart(2, "0")}</text>`
                : nothing}`
          )}
          <line class="night-now" x1="${X - 4}" x2="${X + W + 4}" y1="${nowY.toFixed(1)}" y2="${nowY.toFixed(1)}"></line>
        </svg>
        <div class="meter-label ${short ? "down" : lasts ? "leaf" : "idle"}">
          ${dawn ? html`<span class="meter-top">☼</span>` : nothing}
          ${value ? html`<span class="meter-value">${value}</span>` : nothing}
          <span class="meter-word">${word}</span>
        </div>
      </div>
    `;
  }

  /**
   * The devices as a column: the three drawing most, with their watts. At
   * night the question is not how full the battery is but why the house
   * draws what it draws, and no other element answers that.
   */
  private _renderDevicesColumn(locale: string) {
    const config = this._config as ResolvedConfig;
    const view = this._deviceReadings(locale);
    if (!view) return nothing;
    const { ranking, w } = view;
    const named = ranking.named.slice(0, Math.min(3, config.devices.limit));
    if (named.length === 0) return nothing;
    const rest =
      (ranking.rest ?? 0) +
      ranking.named.slice(named.length).reduce((sum, r) => sum + (r.watts ?? 0), 0);
    return html`
      <div class="meter-block wide">
        <div class="devs">
          ${named.map(
            (r) => html`<div class="dev-row"><span>${r.name}</span><b>${w(r.watts ?? 0)}</b></div>`
          )}
          ${rest > 0
            ? html`<div class="rest">+ ${w(rest)} ${localize("devices.rest", locale)}</div>`
            : nothing}
        </div>
      </div>
    `;
  }

  /** One body up, one down, and a line where they meet. */
  private _renderTwoWay(
    up: number,
    down: number,
    value: string,
    unit: string,
    word: string,
    good: boolean,
    tones: { up: string; down: string; label: string } = { up: "grid", down: "import", label: good ? "up" : "down" }
  ) {
    const half = METER_HEIGHT / 2;
    return html`
      <div class="meter-block">
        <svg class="meter" viewBox="0 0 88 ${METER_HEIGHT}" role="img" aria-label="${word}">
          <rect class="bal-track" x="8" y="0" width="72" height="${METER_HEIGHT}" rx="6"></rect>
          ${up > 0.01
            ? svg`<rect class="meter-on ${tones.up}" x="8" y="${(half - half * up).toFixed(1)}"
                width="72" height="${(half * up).toFixed(1)}" rx="5"></rect>`
            : nothing}
          ${down > 0.01
            ? svg`<rect class="meter-on ${tones.down}" x="8" y="${half}"
                width="72" height="${(half * down).toFixed(1)}" rx="5"></rect>`
            : nothing}
          <line class="meter-zero" x1="1" y1="${half}" x2="87" y2="${half}"></line>
        </svg>
        <div class="meter-label ${tones.label}">
          <span class="meter-value">${value} <small>${unit}</small></span>
          <span class="meter-word">${word}</span>
        </div>
      </div>
    `;
  }

  private _renderMeter(flow: Flow, locale: string, style: MeterStyle, second = false) {
    const config = this._config as ResolvedConfig;
    if (!config.ring.meter) return nothing;
    if (style === "day") return this._renderDayColumn(locale);
    if (style === "balance") return this._renderBalance(flow, locale);
    if (style === "money") return this._renderMoneyMeter(flow, locale);
    if (style === "load") return this._renderLoadMeter(flow, locale);
    if (style === "autarky") return this._renderAutarkyMeter(flow, locale, second);
    if (style === "roof") return this._renderRoofMeter(flow, locale, second);
    if (style === "battery") return this._renderBatteryColumn(locale, second);
    if (style === "night") {
      return this._renderNightMeter(
        flow,
        locale,
        second ? config.ring.meter_second_drawn : config.ring.meter_drawn,
        second
      );
    }
    if (style === "devices") return this._renderDevicesColumn(locale);
    if (style === "none") return nothing;

    // Without a solar sensor there can never be a surplus, and the draw is the
    // house load the ring already prints. Nothing of its own to say.
    if (!config.entities.solar) return nothing;

    // Grid scope keeps the column on the meter itself, so the ring can name the
    // battery without the two saying the same thing twice.
    const scope = second ? config.ring.meter_second_scope : config.ring.meter_scope;
    const withBattery = scope === "all";

    // Every setting that shapes a needle belongs to the needle it shapes, and
    // the two columns are two needles.
    const scale = second ? config.ring.meter_second_scale : config.ring.meter_scale;
    const scaleDraw = second
      ? config.ring.meter_second_scale_draw
      : config.ring.meter_scale_draw;
    const target = second ? config.ring.meter_second_target : config.ring.meter_target;
    const steps = second ? config.ring.meter_second_steps : config.ring.meter_steps;
    const marks = second ? config.ring.meter_second_marks : config.ring.meter_marks;
    const extremes = second ? config.ring.meter_second_today : config.ring.meter_today;
    const meter = meterGeometry(
      {
        toBattery: withBattery ? flow.toBattery : 0,
        toGrid: flow.toGrid,
        fromGrid: flow.fromGrid,
        fromBattery: withBattery ? flow.fromBattery : 0
      },
      scale,
      this._yearPeak ?? this._series?.solarPeak ?? 0,
      target,
      scaleDraw,
      0,
      steps
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
      <!-- The box keeps its width: it is drawn to a fixed one, so widening it
           would shrink the column instead of making room. -->
      <svg class="meter" role="img" aria-label="${label}"
           viewBox="${marks ? `0 -18 88 ${METER_HEIGHT + 36}` : `0 0 88 ${METER_HEIGHT}`}">
        ${marks
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
        ${extremes && this._swing
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
    const producing = this._isProducing(flow);
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

  private _renderChart(locale: string, summaryOnly = false) {
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
    const sunDown = stateOf(hass, "sun.sun")?.state === "below_horizon";

    // What is still to come: today's hours after now, or, once the sun is
    // down, tomorrow's whole day laid over today's axis. The hours are read
    // off whichever sensor carries them.
    const DAY = 24 * 60 * 60 * 1000;
    const ghost: ForecastHour[] = !config.chart.forecast_bars
      ? []
      : sunDown
        ? this._hoursOf(config.entities.forecast_tomorrow)
            .map((hour) => ({ start: hour.start - DAY, kw: hour.kw }))
        : this._hoursOf(config.entities.forecast_hourly);
    const midnight = startOfToday().getTime();
    const layers =
      config.chart.layers && this._hours
        ? this._hours.map((hour) => ({
            start: midnight + hour.hour * 60 * 60 * 1000,
            grid: hour.grid,
            battery: hour.battery
          }))
        : [];
    const best = config.chart.best_day ? (this._bestDay ?? []) : [];
    const extras = { ghost, layers, best, ghostAll: sunDown };

    const barGeometry =
      series && asBars && inDay.length > 1 && dayStart !== undefined && dayEnd !== undefined
        ? chartBars(
            inDay.map((point) => point.timestamp),
            inDay.map((point) => series.solar[point.index]),
            config.chart.consumption ? inDay.map((point) => series.house[point.index]) : [],
            { start: dayStart, end: dayEnd },
            box,
            this._earlierSolar(inDay.length),
            extras
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
            this._earlierSolar(inDay.length),
            extras
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
      nowX !== undefined && nowX > box.padding + 40 && nowX < box.width - box.padding - 44
        ? nowX
        : undefined;
    const produced = energyKwh(stateOf(hass, config.entities.solar_today));
    const used = energyKwh(stateOf(hass, config.entities.house_today));
    // After sunset "0.0 expected" states the obvious and costs a line.
    const forecastValue = config.chart.show_forecast
      ? this._kwhOf(config.entities.forecast)
      : undefined;
    const forecast = forecastValue !== undefined && forecastValue >= 0.05 ? forecastValue : undefined;

    const tomorrow = this._kwhOf(config.entities.forecast_tomorrow);
    // A roof far behind its forecast by day is worth a word: in the snow
    // months a question, the rest of the year the bare fact.
    const behind =
      !sunDown && config.chart.show_forecast && config.entities.forecast_hourly.length > 0
        ? shortfall(
            this._hoursOf(config.entities.forecast_hourly),
            produced,
            sunTimes(stateOf(hass, "sun.sun")).rising,
            new Date()
          ).short
        : false;
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
        : nothing,
      behind
        ? html` · <span class="dim">${localize(snowSeason(new Date()) ? "chart.snow" : "chart.shortfall", locale)}</span>`
        : nothing,
      // After sunset the day is done; tomorrow’s expectation is the one figure
      // that still looks ahead, and it stands beside today, not instead of it.
      tomorrow !== undefined && sunDown
        ? html` · <span class="dim">${localize("chart.tomorrow", locale)}</span> ${formatEnergy(tomorrow, locale)}
            <span class="dim">${localize("chart.forecast", locale)}</span>`
        : nothing,
      // The line behind today has a figure, or it is only a shape.
      config.chart.best_day && this._bestKwh !== undefined && this._bestDay
        ? html` · <span class="dim">${localize("chart.best", locale)}</span> ${formatEnergy(this._bestKwh, locale)}`
        : nothing
    ];

    return html`
      <div class="row">
        <div class="row-head">
          <span class="row-title">${localize("chart.title", locale)}</span>
          ${solarNow === undefined || this._roofInColumn()
            ? nothing
            : this._linked(
                config.entities.solar,
                html`<span class="row-note key-solar"
                  ><span class="dim">${localize("chart.roof_now", locale)}</span>
                  ${formatPower(solarNow, locale)} <span class="unit">kW</span></span
                >`
              )}
        </div>
        ${this._error ? html`<div class="row-note dim">${this._error}</div>` : nothing}
        ${shapeless || summaryOnly
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
              ${(geometry?.layerGrid ?? barGeometry?.layerGrid)
                ? svg`<path class="layer-grid" d="${geometry?.layerGrid ?? barGeometry?.layerGrid}"></path>`
                : nothing}
              ${(geometry?.layerBattery ?? barGeometry?.layerBattery)
                ? svg`<path class="layer-battery" d="${geometry?.layerBattery ?? barGeometry?.layerBattery}"></path>`
                : nothing}
              ${(geometry?.best ?? barGeometry?.best)
                ? svg`<path class="best-line" d="${geometry?.best ?? barGeometry?.best}"></path>`
                : nothing}
              ${(geometry?.earlier ?? barGeometry?.earlier)
                ? svg`<path class="earlier-line" d="${geometry?.earlier ?? barGeometry?.earlier}"></path>`
                : nothing}
              ${geometry?.ghost ? svg`<path class="ghost-line" d="${geometry.ghost}"></path>` : nothing}
              ${barGeometry
                ? barGeometry.ghosts.map(
                    (bar) => svg`<rect class="prod-ghost" x="${(bar.x + 0.6).toFixed(1)}"
                                      y="${bar.y.toFixed(1)}" width="${(bar.width - 1.2).toFixed(1)}"
                                      height="${bar.height.toFixed(1)}" rx="2"></rect>`
                  )
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
                    <line class="nowline" x1="${(nowX).toFixed(1)}" y1="4"
                          x2="${nowX}" y2="${box.height}"></line>
                    ${
                      geometry?.nowY !== undefined
                        ? svg`<circle cx="${nowX.toFixed(1)}" cy="${geometry.nowY.toFixed(1)}" r="4.5"
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
                  ? svg`<text class="axis" x="${nowLabel.toFixed(1)}" y="${box.height + 16}"
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

  /**
   * Seven days as bars, the roof's yield, with a dot above each for how much
   * of the house it carried. Today is bright, the rest has happened. A tap on
   * a day puts its figures in the heading; the average stands there otherwise.
   */
  private _renderWeek(locale: string) {
    const week = this._week;
    if (!week || week.every((day) => day.solar === undefined)) return nothing;

    const W = 340;
    const H = 78;
    const BASE = 60;
    const slot = W / 7;
    const max = Math.max(0.1, ...week.map((day) => day.solar ?? 0));
    const autarky = (day: WeekDay): number | undefined =>
      day.house !== undefined && day.house > 0 && day.imported !== undefined
        ? Math.min(1, Math.max(0, 1 - day.imported / day.house))
        : undefined;
    const today = startOfToday().getTime();
    const names = new Intl.DateTimeFormat(locale, { weekday: "short" });

    const known = week.filter((day) => day.solar !== undefined);
    const shares = week.map(autarky).filter((s): s is number => s !== undefined);
    const picked = this._weekPick !== undefined ? week[this._weekPick] : undefined;
    const note = picked
      ? html`<span class="key-solar">${names.format(new Date(picked.day))}</span>
          ${picked.solar !== undefined ? html` ${formatEnergy(picked.solar, locale)} <span class="unit">kWh</span>` : nothing}
          ${autarky(picked) !== undefined
            ? html` · ${formatNumber((autarky(picked) as number) * 100, locale, 0)} <span class="unit">%</span>`
            : nothing}`
      : html`<span class="dim">Ø</span>
          ${formatEnergy(known.reduce((sum, day) => sum + (day.solar as number), 0) / Math.max(1, known.length), locale)}
          <span class="unit">kWh</span>
          ${shares.length
            ? html` · ${formatNumber((shares.reduce((a, b) => a + b, 0) / shares.length) * 100, locale, 0)}
                <span class="unit">%</span>`
            : nothing}`;

    return html`
      <div class="row week">
        <div class="row-head">
          <span class="row-title">${localize("week.title", locale)}</span>
          <span class="row-note">${note}</span>
        </div>
        <svg class="full" viewBox="0 0 ${W} ${H}" role="img" aria-label="${localize("week.title", locale)}">
          ${week.map((day, index) => {
            const x = index * slot + slot * 0.25;
            const width = slot * 0.5;
            const height = day.solar === undefined ? 0 : (BASE - 10) * (day.solar / max);
            const isToday = day.day === today;
            const share = autarky(day);
            const pick = () => {
              this._weekPick = this._weekPick === index ? undefined : index;
            };
            return svg`
              <rect class="week-hit" x="${(index * slot).toFixed(1)}" y="0" width="${slot.toFixed(1)}" height="${H}"
                    @click=${pick}></rect>
              ${day.solar !== undefined
                ? svg`<rect class="week-bar ${isToday ? "today" : ""} ${this._weekPick === index ? "picked" : ""}"
                        x="${x.toFixed(1)}" y="${(BASE - height).toFixed(1)}" width="${width.toFixed(1)}"
                        height="${Math.max(1, height).toFixed(1)}" rx="2" @click=${pick}></rect>`
                : nothing}
              ${share !== undefined
                ? svg`<circle class="week-dot ${share >= 0.8 ? "good" : "weak"} ${isToday ? "" : "faint"}"
                        cx="${(x + width / 2).toFixed(1)}" cy="${(BASE - height - 6).toFixed(1)}" r="2.6"></circle>`
                : nothing}
              <text class="week-label ${isToday ? "today" : ""}" x="${(x + width / 2).toFixed(1)}" y="${H - 4}"
                    text-anchor="middle">${names.format(new Date(day.day))}</text>`;
          })}
        </svg>
      </div>
    `;
  }

  private _renderBattery(locale: string) {
    const config = this._config as ResolvedConfig;
    const { view, soc } = this._batteryFacts();
    if (soc === undefined) return nothing;

    if (!config.battery.runtime) {
      view.hours = undefined;
      view.at = undefined;
      view.full = undefined;
      view.socAtSunset = undefined;
    }

    const tone =
      view.mode === "charging"
        ? "fill-sun"
        : soc <= config.battery_reserve + 5
          ? "fill-grid"
          : "fill-leaf";

    const extra = this._batteryExtra(locale);

    return html`
      <div class="row">
        <div class="row-head">
          <span class="row-title"
            >${localize("battery.title", locale)}${config.battery.percent && extra
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
        ${this._renderBatterySvg(soc, tone, locale, extra, config.battery.animate ? view.mode : undefined)}
        ${config.battery.curve ? this._renderBatteryCurve(soc, view, locale) : nothing}
        <div class="row-note">${this._renderBatteryNote(view, locale)}</div>
      </div>
    `;
  }

  /**
   * The charge as a curve: at night from sunset, dashed on to where it will
   * stand at sunrise; by day from midnight, dashed on to full. The bar says
   * how full; this says whether the curve meets the sun before the floor.
   */
  private _renderBatteryCurve(soc: number, view: BatteryView, locale: string) {
    const config = this._config as ResolvedConfig;
    const hass = this._hass as HomeAssistant;
    const rows = (this._socRows ?? []).filter(
      (row) => row.mean !== undefined && row.mean !== null && Number.isFinite(row.mean)
    );
    if (rows.length < 2) return nothing;

    const now = Date.now();
    const sunDown = stateOf(hass, "sun.sun")?.state === "below_horizon";
    const night = sunDown ? this._nightSoFar() : undefined;
    let from: number;
    let to: number;
    let ahead: { at: number; pct: number } | undefined;
    if (night) {
      const total = night.hoursLeft / (1 - night.done);
      from = now - night.done * total * 3600000;
      to = now + night.hoursLeft * 3600000;
      const dawn = this._socAtSunrise();
      if (dawn) ahead = { at: to, pct: dawn.at };
    } else {
      from = startOfToday().getTime();
      to = now;
      if (view.mode === "charging" && view.at) {
        ahead = { at: view.at.getTime(), pct: 100 };
        to = view.at.getTime();
      }
    }
    if (to <= from) return nothing;

    const W = 340;
    const H = 52;
    const TOP = 6;
    const FLOOR = 42;
    const x = (t: number) => ((Math.min(to, Math.max(from, t)) - from) / (to - from)) * W;
    const y = (pct: number) => FLOOR - (Math.min(100, Math.max(0, pct)) / 100) * (FLOOR - TOP);
    const seen = rows.filter((row) => row.start >= from && row.start <= now);
    const points: Array<[number, number]> = seen.map((row) => [x(row.start), y(row.mean as number)]);
    points.push([x(now), y(soc)]);
    const path = points
      .map(([px, py], index) => `${index === 0 ? "M" : "L"}${px.toFixed(1)},${py.toFixed(1)}`)
      .join(" ");
    const reserveY = config.battery_reserve > 0 ? y(config.battery_reserve) : undefined;
    const first = seen[0]?.mean ?? soc;
    // The second figure beside the bar may already say where the charge ends up.
    const endSaid = config.battery.extra === "sunrise" && night;

    return html`
      <svg class="full" viewBox="0 0 ${W} ${H}" role="img" aria-label="${localize("battery.title", locale)}">
        ${reserveY !== undefined
          ? svg`<line class="bat-curve-floor" x1="0" x2="${W}" y1="${reserveY.toFixed(1)}" y2="${reserveY.toFixed(1)}"></line>`
          : nothing}
        <path class="bat-curve" d="${path}"></path>
        ${ahead
          ? svg`<path class="bat-curve ahead"
              d="M${x(now).toFixed(1)},${y(soc).toFixed(1)} L${x(ahead.at).toFixed(1)},${y(ahead.pct).toFixed(1)}"></path>`
          : nothing}
        ${ahead
          ? svg`<line class="bat-curve-now" x1="${x(now).toFixed(1)}" x2="${x(now).toFixed(1)}" y1="${TOP}" y2="${FLOOR}"></line>`
          : nothing}
        <text class="bat-curve-label" x="0" y="${H - 1}">${formatClock(new Date(from), locale)} · ${formatNumber(first as number, locale, 0)} %</text>
        <text class="bat-curve-label" x="${W}" y="${H - 1}" text-anchor="end">${formatClock(new Date(to), locale)}${
          ahead && !endSaid ? ` · ${formatNumber(ahead.pct, locale, 0)} %` : ""
        }</text>
      </svg>
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
        const price = priceOf(stateOf(hass, config.entities.price_import));
        if (given === undefined || price === undefined) return undefined;
        return {
          value: `${formatMoney(given * price, locale)} \u20ac`,
          label: localize("battery.saved", locale)
        };
      }
      case "sunrise": {
        const dawn = this._socAtSunrise();
        if (!dawn) return undefined;
        return {
          value: `${formatNumber(dawn.at, locale, 0)} %`,
          label: `${localize("battery.at_sunrise", locale)} ${formatClock(dawn.sunrise, locale)}`
        };
      }
      case "given": {
        if (given === undefined) return undefined;
        return {
          value: `${formatEnergy(given, locale)} kWh`,
          label: localize("battery.given", locale)
        };
      }
      case "flow": {
        const charged = energyKwh(stateOf(hass, config.entities.battery_in_today));
        if (charged === undefined || given === undefined) return undefined;
        const usable = config.battery_capacity / 1000;
        return {
          value: `↑${formatEnergy(charged, locale)} ↓${formatEnergy(given, locale)} kWh`,
          label:
            usable > 0
              ? `${formatNumber(given / usable, locale, 1)} ${localize("battery.cycles", locale)}`
              : localize("battery.flow", locale)
        };
      }
      default:
        return undefined;
    }
  }

  /**
   * Where the charge will stand at sunrise, while the battery carries the
   * house: the night's need at today's average load, taken off what is held.
   * Without an average there is no honest figure, so there is none.
   */
  private _socAtSunrise(): { at: number; sunrise: Date } | undefined {
    const config = this._config as ResolvedConfig;
    const facts = this._batteryFacts();
    if (facts.view.mode !== "discharging") return undefined;
    const capacityKwh = config.battery_capacity / 1000;
    const load = this._series?.houseAverage;
    if (
      facts.soc === undefined ||
      facts.hoursToSunrise === undefined ||
      !facts.sunrise ||
      capacityKwh <= 0 ||
      facts.hoursToSunrise <= 0 ||
      load === undefined
    ) {
      return undefined;
    }
    const drop = ((facts.hoursToSunrise * load) / capacityKwh) * 100;
    return { at: Math.max(config.battery_reserve, facts.soc - drop), sunrise: facts.sunrise };
  }

  /**
   * Where the charge will stand at sunset, when the day cannot fill it: the
   * moon's place on the bar, as the sun's is the sunrise. The forecast alone
   * can say it, so a rate-based day has no moon.
   */
  private _socAtSunset(): { at: number } | undefined {
    const { view } = this._batteryFacts();
    if (view.mode !== "charging" && view.mode !== "idle") return undefined;
    if (view.full !== "not_today" || view.socAtSunset === undefined) return undefined;
    return { at: view.socAtSunset };
  }

  private _renderBatterySvg(
    soc: number,
    tone: string,
    locale: string,
    extra: { value: string; label: string } | undefined,
    motion?: BatteryView["mode"]
  ) {
    const config = this._config as ResolvedConfig;
    const bare = config.battery.style === "bar";
    const dawn = config.battery.sunrise_mark ? this._socAtSunrise() : undefined;
    // Sun by night, moon by day, never both: the bar has one tomorrow at a time.
    const dusk = config.battery.sunset_mark && !dawn ? this._socAtSunset() : undefined;
    // The wave runs only while the battery moves; a resting battery stands still.
    const flowing = motion === "charging" || motion === "discharging" ? motion : undefined;

    // Without a casing the bar may use the width the cap would have taken.
    // Whatever stands to the right takes its room from the bar, and only
    // one thing ever does.
    const aside = extra ? 100 : config.battery.percent ? 66 : 0;
    const shellW = (bare ? 259 : 248) - aside;
    const innerStart = bare ? 0 : 6;
    const innerWidth = bare ? shellW : shellW - 10;
    // The cells sit inside the casing with ground above and below, and they are
    // square: a round shell around round pills reads as a meter, not a battery.
    const top = 12;
    const tall = 28;
    const radius = bare ? 4 : 2;

    const reserve =
      config.battery.reserve_line && config.battery_reserve > 0 && config.battery_reserve < 100
        ? config.battery_reserve
        : 0;

    // The level the morning keeps, as a place on the bar.
    const level = (percent: number) =>
      innerStart - 1 + ((innerWidth + 2) * Math.min(100, Math.max(0, percent))) / 100;
    const dawnX = dawn ? level(dawn.at) : undefined;
    const duskX = dusk ? level(dusk.at) : undefined;
    const marked = dawnX !== undefined || duskX !== undefined;

    const body =
      config.battery.style === "solid"
        ? svg`<rect class="bat-fill ${tone}" x="${innerStart - 1}" y="${top}" rx="8"
                    width="${level(soc) - (innerStart - 1)}"
                    height="${tall}"></rect>
              ${dawnX !== undefined && level(soc) > dawnX
                ? svg`<rect class="bat-fill bat-night" x="${dawnX.toFixed(1)}" y="${top}"
                        width="${(level(soc) - dawnX).toFixed(1)}" height="${tall}"></rect>`
                : nothing}`
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
                  ? svg`<rect class="bat-fill cell ${tone} ${held ? "held" : ""}"
                              style="--i: ${index}"
                              x="${x}" y="${top}"
                              width="${Math.max(3, width * segment.fill)}" height="${tall}"
                              rx="${radius}"></rect>`
                  : nothing
              }`;
            }
          );

    return html`
      <svg class="full ${flowing ? `bat-flow ${flowing}` : ""}" viewBox="0 0 340 ${marked ? 60 : 54}" role="img"
           aria-label="${localize("battery.title", locale)} ${formatNumber(soc, locale, 0)} %">
        ${dawnX !== undefined
          ? svg`<g class="bat-sun" transform="translate(${dawnX.toFixed(1)} ${top + tall + 13}) scale(0.72)">
                  <circle cx="0" cy="0" r="2.7"></circle>
                  <path d="M0,-6.2 L0,-4.6 M0,4.6 L0,6.2 M-6.2,0 L-4.6,0 M4.6,0 L6.2,0
                           M-4.4,-4.4 L-3.3,-3.3 M3.3,3.3 L4.4,4.4 M4.4,-4.4 L3.3,-3.3
                           M-3.3,3.3 L-4.4,4.4"></path>
                </g>`
          : nothing}
        ${duskX !== undefined
          ? svg`<g class="bat-moon" transform="translate(${duskX.toFixed(1)} ${top + tall + 13}) scale(0.72)">
                  <path transform="scale(0.7) translate(-11.5 -12.6)"
                        d="M18.97,15.95C19.8,15.87 20.69,17.05 20.16,17.8C19.84,18.25 19.5,18.67 19.08,19.07C15.17,23 8.84,23 4.94,19.07C1.03,15.17 1.03,8.83 4.94,4.93C5.34,4.53 5.76,4.17 6.21,3.85C6.96,3.32 8.14,4.21 8.06,5.04C7.79,7.9 8.75,10.87 10.95,13.06C13.14,15.26 16.1,16.22 18.97,15.95Z"></path>
                </g>`
          : nothing}
        ${
          bare
            ? nothing
            : svg`
              <rect class="bat-shell" x="1" y="5" width="${shellW}" height="42" rx="6"></rect>
              <rect class="bat-cap" x="${shellW + 4}" y="19" width="9" height="14" rx="2"></rect>`
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
        ${extra || !config.battery.percent
          ? nothing
          : (() => {
              const id = config.entities.battery_soc;
              const on = id && (this._hass as HomeAssistant)?.states?.[id];
              const handlers = on ? this._tap(id!) : undefined;
              return svg`<text class="bat-pct ${on ? "tap" : ""}" x="340" y="36"
                text-anchor="end" tabindex="${on ? 0 : -1}"
                @click=${handlers?.click} @keydown=${handlers?.key}
                >${formatNumber(soc, locale, 0)}<tspan dx="4">%</tspan></text>`;
            })()}

      </svg>`;
  }

  private _renderBatteryNote(view: BatteryView, locale: string) {
    const parts: string[] = [];

    const stored =
      view.availableKwh === undefined
        ? undefined
        : `${formatNumber(view.availableKwh, locale, 1)} kWh ${localize("battery.stored", locale)}`;

    if (view.mode === "charging") {
      parts.push(...this._fullWords(view, locale));
      // A trickle on its way out is not worth a figure; the last one stands
      // until the battery is at rest, and then the word changes.
      if (view.power !== undefined && Math.abs(view.power) >= 0.1) {
        parts.push(
          `${localize("battery.charging", locale)} ${formatPower(Math.abs(view.power), locale)} kW`
        );
      }
      if (parts.length === 0) parts.push(localize("battery.resting", locale));
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
        if (this._centreShowsTime || this._columnShowsTime) {
          // The centre or a column already says how long; the note keeps the energy.
        } else if (reach) {
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
      // Resting on the reserve is not resting: there is nothing to rest on.
      const drained = view.mode === "idle" && view.availableKwh !== undefined && view.availableKwh <= 0.05;
      parts.push(
        localize(view.mode === "full" ? "battery.full" : drained ? "battery.at_reserve" : "battery.resting", locale)
      );
      // Resting by day, the forecast still knows how the day ends for it.
      if (view.mode === "idle") parts.push(...this._fullWords(view, locale));
      // At the ceiling the stored figure just repeats the capacity in the
      // header, and on the reserve it is a zero that says less than the word.
      if (stored && view.mode !== "full" && !drained) parts.push(stored);
    }

    if (parts.length === 0) return nothing;
    const [first, ...rest] = parts;
    return html`${first}${rest.length ? html`<span class="dim"> · ${rest.join(" · ")}</span>` : nothing}`;
  }

  /** Whether anything on the card reads the devices: the block, or a column. */
  private _wantsDevices(): boolean {
    const config = this._config;
    if (!config || config.devices.list.length === 0) return false;
    return config.sections.devices || (config.sections.ring && this._usesSubject("devices"));
  }

  /** The devices' recent means, or their meters' growth since midnight. */
  private async _fetchDevices(hass: HomeAssistant, config: ResolvedConfig): Promise<void> {
    if (!this._wantsDevices()) return;
    if (config.devices.mode === "today") {
      this._deviceToday = await fetchTodayChange(hass, Object.values(config.devices.energy));
      return;
    }
    this._deviceMeans = await fetchRecentMeans(
      hass,
      [...config.devices.list, config.entities.house],
      config.devices.window
    );
    // A line needs an hour; how long the biggest has run needs a few more,
    // and what it cost today needs its meter.
    const wantsSeries = config.sections.devices && (config.devices.spark || config.devices.top);
    this._deviceSeries = wantsSeries
      ? await fetchRecentSeries(hass, config.devices.list, config.devices.top ? 180 : 60)
      : undefined;
    const meters = Object.values(config.devices.energy);
    this._deviceToday =
      config.sections.devices && config.devices.top && meters.length > 0
        ? await fetchTodayChange(hass, meters)
        : undefined;
  }

  /**
   * Where the house's power goes this minute. The ring says where it comes
   * from; this is the other half of the same question, in the same shape as
   * the day's origin bar. Consumers are the house, so they wear no colour.
   */
  /** The devices read and ranked, for the block and for the column alike. */
  private _deviceReadings(locale: string) {
    const config = this._config as ResolvedConfig;
    const hass = this._hass as HomeAssistant;
    const ids = config.devices.list;
    if (ids.length === 0) return undefined;

    const wattsOf = (id: string | undefined): number | undefined => {
      if (!id) return undefined;
      const state = hass.states?.[id];
      const value = numberOf(state);
      if (value === undefined) return undefined;
      return state?.attributes?.unit_of_measurement === "kW" ? value * 1000 : value;
    };
    const areaOf = (id: string): string | undefined => {
      const entry = hass.entities?.[id];
      const areaId =
        entry?.area_id ?? (entry?.device_id ? hass.devices?.[entry.device_id]?.area_id : undefined);
      return areaId ? hass.areas?.[areaId]?.name : undefined;
    };

    const today = config.devices.mode === "today";
    const unitOfId = (id: string | undefined) =>
      id ? (hass.states?.[id]?.attributes?.unit_of_measurement as string | undefined) : undefined;
    // The mean over the window, and the live reading until the recorder answers.
    const meanWatts = (id: string | undefined): number | undefined => {
      if (!id) return undefined;
      const mean = this._deviceMeans?.[id];
      if (mean === undefined) return wattsOf(id);
      return unitOfId(id) === "kW" ? mean * 1000 : mean;
    };
    const kwhOf = (id: string): number | undefined => {
      const meter = config.devices.energy[id];
      const grown = meter ? this._deviceToday?.[meter] : undefined;
      if (grown === undefined) return undefined;
      return unitOfId(meter) === "Wh" ? grown / 1000 : grown;
    };

    let readings: DeviceReading[] = ids.map((id) => {
      const name =
        config.devices.names[id] ?? (hass.states?.[id]?.attributes?.friendly_name as string) ?? id;
      const watts = today ? kwhOf(id) : meanWatts(id);
      // Chosen beats set, set beats guessed.
      const own =
        config.devices.icons[id] ||
        (hass.states?.[id]?.attributes?.icon as string | undefined) ||
        hass.entities?.[id]?.icon;
      return { id, name, watts, icon: own || iconFor(name, id), area: areaOf(id) };
    });
    const rooms = config.devices.group === "area";
    if (rooms) readings = byArea(readings, localize("devices.nowhere", locale));
    // Icons carry no names, so two that look alike stand as one.
    else if (config.devices.style === "icons" && config.devices.merge_icons) readings = byIcon(readings);

    const houseToday = numberOf(stateOf(hass, config.entities.house_today));
    const house = today
      ? houseToday === undefined ? undefined : unitOfId(config.entities.house_today) === "Wh" ? houseToday / 1000 : houseToday
      : meanWatts(config.entities.house);
    const ranking = rankDevices(readings, house, {
      limit: config.devices.limit,
      // A day is measured in kilowatt hours; a tenth of one is not worth a name.
      threshold: today ? 0.1 : config.devices.threshold
    });
    if (ranking.named.length === 0 && ranking.small.length === 0) return undefined;

    const w = (x: number) =>
      today
        ? `${formatEnergy(x, locale)} kWh`
        : x >= 1000
          ? `${formatPower(x / 1000, locale)} kW`
          : `${formatNumber(x, locale, 0)} W`;
    return { ranking, house, today, rooms, w };
  }

  private _renderDevices(locale: string) {
    const config = this._config as ResolvedConfig;
    const view = this._deviceReadings(locale);
    if (!view) return nothing;
    const { ranking, house, today, rooms, w } = view;

    const style = config.devices.style;
    const values = config.devices.values;
    const period = today
      ? localize("devices.today", locale)
      : `\u00d8 ${formatNumber(config.devices.window, locale, 0)} min`;
    const tap = (r: DeviceReading, content: unknown) => (rooms || r.members ? content : this._linked(r.id, content));
    // The ring's centre is the house load already; the head repeats nothing.
    const houseShown = house !== undefined && !(config.sections.ring && this._centreShown === "power");

    const hass = this._hass as HomeAssistant;
    const price = priceOf(stateOf(hass, config.entities.price_import));
    // The biggest as a row of its own: since when it has been drawing, and
    // what it cost today. It leaves the list, or it would stand there twice.
    const topRow = !today && config.devices.top && !rooms && style !== "icons" ? ranking.named[0] : undefined;
    const listed = topRow ? ranking.named.slice(1) : ranking.named;
    const seriesOf = (id: string) => this._deviceSeries?.[id] ?? [];
    const toWatts = (id: string, value: number) =>
      (hass.states?.[id]?.attributes?.unit_of_measurement as string | undefined) === "kW" ? value * 1000 : value;
    const topBlock = topRow
      ? (() => {
          const run = runMinutes(
            seriesOf(topRow.id).map((row) => ({ start: row.start, mean: toWatts(topRow.id, row.mean) })),
            config.devices.threshold
          );
          const meter = config.devices.energy[topRow.id];
          const grown = meter ? this._deviceToday?.[meter] : undefined;
          const kwh =
            grown === undefined
              ? undefined
              : (hass.states?.[meter as string]?.attributes?.unit_of_measurement as string | undefined) === "Wh"
                ? grown / 1000
                : grown;
          const cost = kwh !== undefined && price !== undefined ? kwh * price : undefined;
          const facts = [
            run !== undefined && run > 0 ? `${localize("devices.since", locale)} ${formatDuration(run / 60, locale)}` : undefined,
            cost !== undefined ? `${formatMoney(cost, locale)} € ${localize("devices.today", locale)}` : undefined
          ].filter(Boolean);
          return tap(
            topRow,
            html`<div class="wohin-top">
              <ha-icon icon="${topRow.icon}"></ha-icon>
              <span class="wohin-top-name">${topRow.name}${facts.length
                ? html`<small>${facts.join(" · ")}</small>`
                : nothing}</span>
              <b>${w(topRow.watts ?? 0)}</b>
            </div>`
          );
        })()
      : nothing;

    // A line for the last hour: twelve five-minute means on the device's own scale.
    const spark = (id: string) => {
      const rows = seriesOf(id).slice(-12);
      if (rows.length < 3) return nothing;
      const peak = Math.max(1, ...rows.map((row) => row.mean));
      const points = rows
        .map((row, index) => `${((index / (rows.length - 1)) * 60).toFixed(1)},${(16 - (row.mean / peak) * 14).toFixed(1)}`)
        .join(" ");
      return html`<svg class="spark" viewBox="0 0 60 18" aria-hidden="true"><polyline points="${points}"></polyline></svg>`;
    };
    const showSpark = !today && config.devices.spark && style === "rows";

    // Rooms open on a tap to the devices standing in them.
    const members = (r: DeviceReading) =>
      rooms && r.members && this._openArea === r.name
        ? html`<div class="wohin-sub">
            ${r.members.map((m) => html`<span>${m.name}${values ? html` <b>${w(m.watts ?? 0)}</b>` : nothing}</span>`)}
          </div>`
        : nothing;
    const openRoom = (r: DeviceReading) => (event: Event) => {
      if (!rooms || !r.members) return;
      event.stopPropagation();
      this._openArea = this._openArea === r.name ? undefined : r.name;
    };

    // A colour per device when asked, fixed to its place in the list so it
    // never changes with the ranking; rooms take theirs in order.
    const COLOURS = ["#4f7fe0", "#e2a63c", "#d9605a", "#55b5a6", "#9b6fe6", "#e089b5", "#b08a5a", "#7aa6f2"];
    const tint = (r: DeviceReading, i: number) =>
      config.devices.colours
        ? `--dev-colour: ${COLOURS[(rooms ? i : Math.max(0, config.devices.list.indexOf(r.id))) % COLOURS.length]}`
        : "";
    const tinted = (r: DeviceReading, i: number) => (rooms ? i : Math.max(0, config.devices.list.indexOf(r.id)));

    // Every share is of the house; without a house reading, of the biggest.
    const whole = house && house > 0 ? house : Math.max(1, ranking.named[0]?.watts ?? 1);
    const share = (watts: number) => `${Math.min(100, (100 * watts) / whole).toFixed(1)}%`;
    const restCount = ranking.small.length;
    const restLabel = restCount
      ? `${localize("devices.rest", locale)} · ${restCount} ${localize(restCount === 1 ? "devices.one" : "devices.many", locale)}`
      : localize("devices.rest", locale);

    // Rows: a bar chart lying down, one device a line, the rest as the last.
    const rowsBlock = style === "rows"
      ? html`<div class="wohin-rows">
          ${listed.map((r) =>
            tap(
              r,
              html`<div class="wr ${rooms ? "room" : ""}" style="${tint(r, tinted(r, 0))}" @click=${openRoom(r)}>
                <ha-icon icon="${r.icon}"></ha-icon>
                <span class="wr-name">${r.name}</span>
                ${showSpark ? spark(r.id) : html`<span class="wr-bar"><i style="width: ${share(r.watts ?? 0)}"></i></span>`}
                ${values ? html`<b>${w(r.watts ?? 0)}</b>` : nothing}
              </div>${members(r)}`
            )
          )}
          ${ranking.rest
            ? html`<div class="wr rest">
                <span></span>
                <span class="wr-name">${restLabel}</span>
                ${showSpark ? html`<span></span>` : html`<span class="wr-bar"><i style="width: ${share(ranking.rest)}"></i></span>`}
                ${values ? html`<b>${w(ranking.rest)}</b>` : nothing}
              </div>`
            : nothing}
        </div>`
      : nothing;

    // Band: the house load as one strip, the biggest first, the legend keyed by shade.
    const shade = (i: number) => Math.max(0.25, 1 - i * 0.18).toFixed(2);
    const bandBlock = style === "band"
      ? html`<div class="wohin-band">
            ${ranking.named.map(
              (r, i) => html`<i
                style="width: ${share(r.watts ?? 0)}; opacity: ${config.devices.colours ? 1 : shade(i)}; ${tint(r, i)}"
                title="${r.name} ${w(r.watts ?? 0)}"
              ></i>`
            )}
            ${ranking.rest ? html`<i class="rest" style="width: ${share(ranking.rest)}"></i>` : nothing}
          </div>
          <div class="wohin-legend">
            ${listed.map((r, i) =>
              tap(
                r,
                html`<span class="${rooms ? "room" : ""}" style="${tint(r, i + (topRow ? 1 : 0))}" @click=${openRoom(r)}
                  ><i class="sw" style="opacity: ${config.devices.colours ? 1 : shade(i + (topRow ? 1 : 0))}"></i>${r.name}${values
                    ? html` <b>${w(r.watts ?? 0)}</b>`
                    : nothing}</span
                >${members(r)}`
              )
            )}
            ${ranking.rest
              ? html`<span class="rest">${localize("devices.rest", locale)}${values ? html` <b>${w(ranking.rest)}</b>` : nothing}</span>`
              : nothing}
          </div>`
      : nothing;

    // Icons on a fixed grid, the level under each, the figure under the ones that draw.
    const top = ranking.named[0]?.watts || 1;
    // The icons have no rest to fold into, so the limit is simply how many stand.
    const standing = [...ranking.named, ...ranking.small].slice(0, Math.max(1, config.devices.limit));
    const icons = style === "icons"
      ? html`<div class="wohin-strip ${standing.length <= 4 ? "few" : ""}">
          ${standing.map((r, i) => {
            const on = (r.watts ?? 0) >= (today ? 0.1 : config.devices.threshold);
            return tap(
              r,
              html`<span class="dev ${on ? "" : "off"}" style="${tint(r, i)}"
                title="${r.members ? r.members.map((m) => `${m.name} ${w(m.watts ?? 0)}`).join(", ") : `${r.name} ${w(r.watts ?? 0)}`}"
                ><ha-icon icon="${r.icon}"></ha-icon
                ><i class="lvl"><b style="width: ${Math.round((100 * (r.watts ?? 0)) / top)}%"></b></i
                >${values && on ? html`<small>${w(r.watts ?? 0)}</small>` : nothing}</span
              >`
            );
          })}
        </div>`
      : nothing;

    return html`
      <div class="row wohin wohin-style-${style} ${config.devices.head ? "" : "bare"}">
        ${config.devices.head
          ? html`<div class="row-head">
              <span class="row-title">${localize("devices.title", locale)}</span>
              <span class="row-note"
                ><span class="dim">${period}</span>
                ${houseShown
                  ? today
                    ? html`${formatEnergy(house, locale)} <span class="unit">kWh</span>`
                    : html`${formatPower(house / 1000, locale)} <span class="unit">kW</span>`
                  : nothing}</span
              >
            </div>`
          : nothing}
        ${topBlock}${rowsBlock}${bandBlock}${icons}
      </div>
    `;
  }

  private _renderToday(flow: Flow, locale: string, foot = true) {
    const config = this._config as ResolvedConfig;
    const money = config.today.money ? this._renderMoney(locale) : nothing;
    // In autarky mode the ring already prints this very percentage.
    const ringShowsAutarky =
      !config.today.stats_chosen && config.sections.ring && this._centreShown === "autarky";

    const stats = config.today.stats
      .filter((stat) => !(ringShowsAutarky && stat === "autarky"))
      .map((stat) => this._renderStat(stat, flow, locale))
      .filter((item) => item !== nothing);

    if (money === nothing && stats.length === 0) return nothing;

    const earning = (numberOf(stateOf(this._hass, config.entities.cost_today)) ?? 0) < 0;

    return html`
      <div class="today ${foot ? "foot" : "row"} ${earning ? "earning" : ""}">
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
      priceImport: priceOf(stateOf(hass, config.entities.price_import)),
      priceExport: priceOf(stateOf(hass, config.entities.price_export))
    });

    const balance = money.balance;
    if (balance === undefined) return nothing;

    const earned = balance < 0;
    const { exported, imported } = money;

    const paidOff =
      config.today.amortisation || config.today.payoff_year
        ? numberOf(stateOf(hass, config.entities.amortisation))
        : undefined;

    // The month so far: the same sign as the day, a longer breath.
    const now = new Date();
    const thisMonth = this._moneyMonths?.find((m) => {
      const at = new Date(m.start);
      return at.getFullYear() === now.getFullYear() && at.getMonth() === now.getMonth();
    });
    const month =
      config.today.month && thisMonth
        ? html`<span class="money-month"
            ><b>${thisMonth.balance < 0 ? "+" : "−"}${formatMoney(Math.abs(thisMonth.balance), locale)} €</b>
            ${new Intl.DateTimeFormat(locale, { month: "short" }).format(now)}</span
          >`
        : nothing;

    // Not bought against sold: the house's own share of the day, priced,
    // against what left for the grid.
    const houseKwh = energyKwh(stateOf(hass, config.entities.house_today));
    const importKwh = energyKwh(stateOf(hass, config.entities.import_today));
    const buy = priceOf(stateOf(hass, config.entities.price_import));
    const notBought =
      houseKwh !== undefined && importKwh !== undefined && buy !== undefined
        ? Math.max(0, houseKwh - importKwh) * buy
        : undefined;
    const sold = exported;
    const split =
      config.today.split && notBought !== undefined && sold !== undefined && notBought + sold > 0
        ? html`<div class="split">
            <div class="split-bar">
              <span class="saved" style="width: ${((100 * notBought) / (notBought + sold)).toFixed(1)}%"></span>
              <span class="sold" style="width: ${((100 * sold) / (notBought + sold)).toFixed(1)}%"></span>
            </div>
            <div class="split-keys">
              <span><i class="saved" style="background: var(--sst-leaf)"></i>${localize("money.not_bought", locale)}
                <b>${formatMoney(notBought, locale)} €</b></span>
              <span><i style="background: var(--sst-sun)"></i>${localize("money.sold", locale)}
                <b>${formatMoney(sold, locale)} €</b></span>
            </div>
          </div>`
        : nothing;

    // The year it is paid off: what is left, over this year's pace.
    const months = this._moneyMonths ?? [];
    const earnedYear = months.reduce((sum, m) => sum + Math.max(0, -m.balance), 0);
    const covered = months.length ? (now.getTime() - months[0].start) / (24 * 3600000) : 0;
    const pace = covered > 30 ? (earnedYear / covered) * 365 : undefined;
    // What the system cost: written here, or carried by the paid-off sensor
    // itself, since whatever computes the share knows the whole.
    const paidAttributes = stateOf(hass, config.entities.amortisation)?.attributes ?? {};
    // "18000.00€" is a figure with a coat on.
    const figure = (value: unknown): number => {
      const cleaned = String(value ?? "").replace(/[^0-9.,-]/g, "");
      const dotted = cleaned.includes(",") && !cleaned.includes(".") ? cleaned.replace(",", ".") : cleaned.replace(/,/g, "");
      return Number(dotted);
    };
    const carried = Object.entries(paidAttributes).find(
      ([key, value]) =>
        /invest|anschaff|installation|kosten|cost|price|preis/i.test(key) &&
        !/saving|erspar|remaining|rest/i.test(key) &&
        Number.isFinite(figure(value)) &&
        figure(value) > 0
    );
    const investment = config.today.investment || (carried ? figure(carried[1]) : 0);
    const payoffYear =
      config.today.payoff_year && paidOff !== undefined && investment > 0 && pace !== undefined && pace > 0
        ? new Date(now.getTime() + ((investment * (1 - paidOff / 100)) / pace) * 365 * 24 * 3600000).getFullYear()
        : undefined;
    const payoff =
      config.today.payoff_year && paidOff !== undefined && investment > 0
        ? html`<div class="payoff">
            <div class="payoff-bar"><span style="width: ${Math.min(100, Math.max(0, paidOff)).toFixed(1)}%"></span></div>
            <div class="payoff-line">
              <b>${formatNumber((investment * paidOff) / 100, locale, 0)} €</b> ${localize("money.of", locale)}
              ${formatNumber(investment, locale, 0)} €${pace !== undefined
                ? html` · <b>${formatNumber(pace, locale, 0)} €</b> ${localize("money.a_year", locale)}`
                : nothing}
            </div>
          </div>`
        : nothing;

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
        <span>
          ${this._linked(
            config.entities.cost_today,
            html`<span class="money-v ${earned ? "plus" : "minus"}">
              ${earned ? "+" : "−"}${formatMoney(Math.abs(balance), locale)}
              <small>${localize(earned ? "today.earned" : "today.paid", locale)}</small>
            </span>`
          )}
          ${month}
        </span>
        ${breakdown}
        ${
          paidOff === undefined || (!config.today.amortisation && !config.today.payoff_year)
            ? nothing
            : this._linked(
                config.entities.amortisation,
                html`<span class="corner"
                  >${formatNumber(paidOff, locale, 0)} %${payoffYear !== undefined
                    ? html` · ${payoffYear}`
                    : nothing}
                  <span class="dim">${localize("stat.amortisation", locale)}</span></span
                >`
              )
        }
      </div>
      ${split}
      ${payoff}
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
        if (exported !== undefined) value = formatEnergyFine(exported, locale);
        break;
      }
      case "import": {
        if (imported !== undefined) value = formatEnergyFine(imported, locale);
        break;
      }
      case "solar": {
        const produced = energyKwh(stateOf(hass, config.entities.solar_today));
        if (produced !== undefined) value = formatEnergyFine(produced, locale);
        break;
      }
      case "house": {
        if (house !== undefined) value = formatEnergyFine(house, locale);
        break;
      }
      case "forecast": {
        const expected = this._kwhOf(config.entities.forecast);
        if (expected !== undefined) value = formatEnergyFine(expected, locale);
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
      forecast: config.entities.forecast[0],
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
