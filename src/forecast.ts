import type { HassEntity } from "./types";

export interface ForecastHour {
  /** Start of the hour, in milliseconds. */
  start: number;
  /** Expected power over the hour, in kW. */
  kw: number;
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

  const byHour = new Map<number, { sum: number; count: number }>();
  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const at = Date.parse(String(pick(row, ["period_start", "datetime", "start", "time"]) ?? ""));
    const kw = Number(pick(row, ["pv_estimate", "estimate", "value", "kw", "power"]));
    if (!Number.isFinite(at) || !Number.isFinite(kw)) continue;
    const hour = Math.floor(at / HOUR) * HOUR;
    const slot = byHour.get(hour) ?? { sum: 0, count: 0 };
    slot.sum += Math.max(0, kw);
    slot.count += 1;
    byHour.set(hour, slot);
  }

  return [...byHour.entries()]
    .map(([start, slot]) => ({ start, kw: slot.sum / slot.count }))
    .sort((a, b) => a.start - b.start);
}
