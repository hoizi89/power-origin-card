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
