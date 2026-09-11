import type { HassEntity } from "./types";

export interface ForecastHour {
  /** Start of the hour, in milliseconds. */
  start: number;
  /** Expected power over the hour, in kW. */
  kw: number;
  /** The pessimistic edge the forecast publishes for the hour, in kW. */
  low?: number;
  /** The optimistic edge, in kW. */
  high?: number;
}

const HOUR = 60 * 60 * 1000;

const pick = (row: Record<string, unknown>, keys: string[]): unknown => {
  for (const key of keys) if (row[key] !== undefined && row[key] !== null) return row[key];
  return undefined;
};

/**
 * The hours a forecast integration attaches to its sensor. Solcast writes
 * `detailedHourly` (one row per hour) and `detailedForecast` (one per half
 * hour) with `period_start` and `pv_estimate` in kW; other integrations use
 * other names for the same two things, so a few are tried. Half hours are
 * averaged into hours, since the chart draws hours.
 */
export function hourlyForecast(entity: HassEntity | undefined): ForecastHour[] {
  const attributes = entity?.attributes ?? {};
  const rows =
    (attributes.detailedHourly as unknown) ??
    (attributes.detailedForecast as unknown) ??
    (attributes.forecast as unknown) ??
    (attributes.hourly as unknown);
  if (!Array.isArray(rows)) return [];

  type Slot = { sum: number; low: number; high: number; count: number; edges: boolean };
  const byHour = new Map<number, Slot>();
  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const at = Date.parse(String(pick(row, ["period_start", "datetime", "start", "time"]) ?? ""));
    const kw = Number(pick(row, ["pv_estimate", "estimate", "value", "kw", "power"]));
    if (!Number.isFinite(at) || !Number.isFinite(kw)) continue;
    const low = Number(pick(row, ["pv_estimate10", "estimate10"]));
    const high = Number(pick(row, ["pv_estimate90", "estimate90"]));
    const hour = Math.floor(at / HOUR) * HOUR;
    const slot = byHour.get(hour) ?? { sum: 0, low: 0, high: 0, count: 0, edges: false };
    slot.sum += Math.max(0, kw);
    slot.low += Math.max(0, Number.isFinite(low) ? low : kw);
    slot.high += Math.max(0, Number.isFinite(high) ? high : kw);
    slot.edges ||= Number.isFinite(low) && Number.isFinite(high);
    slot.count += 1;
    byHour.set(hour, slot);
  }

  return [...byHour.entries()]
    .map(([start, slot]) => ({
      start,
      kw: slot.sum / slot.count,
      ...(slot.edges ? { low: slot.low / slot.count, high: slot.high / slot.count } : {})
    }))
    .sort((a, b) => a.start - b.start);
}

/**
 * Several forecasts, one per roof face, as one: the hours added up. Edges
 * are added too, and kept only where every forecast publishes them, since a
 * span with one side missing is no span.
 */
/**
 * Whether the roof is far behind what the forecast expected of the day so
 * far: at least a kilowatt hour expected since sunrise, two hours into the
 * day, and less than a quarter of it delivered. Snow, fog, or an inverter
 * that has stopped — the card cannot tell which, only that something is up.
 */
export function shortfall(
  hours: ForecastHour[],
  producedKwh: number | undefined,
  sunrise: Date | undefined,
  now: Date
): { expectedKwh: number; short: boolean } {
  if (!sunrise || producedKwh === undefined) return { expectedKwh: 0, short: false };
  const from = sunrise.getTime();
  const to = now.getTime();
  let expected = 0;
  for (const hour of hours) {
    const start = Math.max(hour.start, from);
    const end = Math.min(hour.start + HOUR, to);
    if (end > start) expected += (hour.kw * (end - start)) / HOUR;
  }
  const short = to - from >= 2 * HOUR && expected >= 1 && producedKwh < expected * 0.25;
  return { expectedKwh: expected, short };
}

/** The months a roof can be under snow, in the northern half of the world. */
export function snowSeason(now: Date): boolean {
  const month = now.getMonth() + 1;
  return month >= 11 || month <= 3;
}

export function hourlyForecastAll(entities: Array<HassEntity | undefined>): ForecastHour[] {
  const each = entities.map(hourlyForecast).filter((hours) => hours.length > 0);
  if (each.length <= 1) return each[0] ?? [];
  const byHour = new Map<number, { kw: number; low: number; high: number; edges: number; count: number }>();
  for (const hours of each) {
    for (const hour of hours) {
      const slot = byHour.get(hour.start) ?? { kw: 0, low: 0, high: 0, edges: 0, count: 0 };
      slot.kw += hour.kw;
      slot.low += hour.low ?? hour.kw;
      slot.high += hour.high ?? hour.kw;
      if (hour.low !== undefined && hour.high !== undefined) slot.edges += 1;
      slot.count += 1;
      byHour.set(hour.start, slot);
    }
  }
  return [...byHour.entries()]
    .map(([start, slot]) => ({
      start,
      kw: slot.kw,
      ...(slot.edges === slot.count ? { low: slot.low, high: slot.high } : {})
    }))
    .sort((a, b) => a.start - b.start);
}
