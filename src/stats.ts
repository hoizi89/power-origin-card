import { averageLoad } from "./battery";
import type { DaySeries, HomeAssistant, StatisticPoint } from "./types";

type StatisticsResponse = Record<string, Array<Record<string, unknown>>>;

const FIVE_MINUTES = 5 * 60 * 1000;

function toMillis(value: unknown): number {
  if (typeof value === "number") return value;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : NaN;
}

function toNumber(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalize(rows: Array<Record<string, unknown>> | undefined): StatisticPoint[] {
  if (!rows) return [];
  return rows
    .map((row) => ({
      start: toMillis(row.start),
      mean: toNumber(row.mean),
      max: toNumber(row.max)
    }))
    .filter((row) => Number.isFinite(row.start))
    .sort((a, b) => a.start - b.start);
}

export function startOfToday(now = new Date()): Date {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return start;
}

interface CacheEntry {
  at: number;
  inFlight: Promise<Record<string, StatisticPoint[]>>;
}

const cache = new Map<string, CacheEntry>();

/**
 * Several cards on one dashboard ask for the same day of the same sensors. On a
 * recorder of a few gigabytes that is the difference between one slow query and
 * six, so the answer is shared for as long as it is fresh.
 */
export function cachedStatistics(
  ids: string[],
  ttlMs: number,
  loader: () => Promise<Record<string, StatisticPoint[]>>,
  key: string,
  now = Date.now()
): Promise<Record<string, StatisticPoint[]>> {
  const id = key + "|" + ids.join(",");
  const hit = cache.get(id);
  if (hit && now - hit.at < ttlMs) return hit.inFlight;

  const inFlight = loader().catch((error) => {
    cache.delete(id);
    throw error;
  });
  cache.set(id, { at: now, inFlight });
  return inFlight;
}

export function clearStatisticsCache(): void {
  cache.clear();
}

export async function fetchStatistics(
  hass: HomeAssistant,
  ids: string[],
  now = new Date()
): Promise<Record<string, StatisticPoint[]>> {
  const wanted = ids.filter(Boolean);
  if (wanted.length === 0) return {};

  const request = (period: "5minute" | "hour") =>
    hass.callWS<StatisticsResponse>({
      type: "recorder/statistics_during_period",
      start_time: startOfToday(now).toISOString(),
      end_time: now.toISOString(),
      statistic_ids: wanted,
      period,
      types: ["mean", "max"]
    });

  let response = await request("5minute");
  const empty = wanted.every((id) => !response?.[id]?.length);
  if (empty) response = await request("hour");

  const result: Record<string, StatisticPoint[]> = {};
  for (const id of wanted) result[id] = normalize(response?.[id]);
  return result;
}

/**
 * Resamples the raw buckets onto one grid so the two lines share an x axis
 * even when a sensor was briefly unavailable.
 */
export function buildDaySeries(
  solarRows: StatisticPoint[],
  houseRows: StatisticPoint[],
  divisor: number,
  now = new Date(),
  windowMinutes = 30
): DaySeries {
  const start = startOfToday(now).getTime();
  const end = now.getTime();
  const rows = solarRows.length >= houseRows.length ? solarRows : houseRows;
  const step = rows.length > 1 ? Math.max(FIVE_MINUTES, rows[1].start - rows[0].start) : FIVE_MINUTES;
  const count = Math.max(2, Math.min(288, Math.ceil((end - start) / step) + 1));

  const timestamps = Array.from({ length: count }, (_, index) =>
    Math.min(end, start + index * step)
  );

  const sample = (source: StatisticPoint[], at: number): number => {
    if (source.length === 0) return 0;
    let value = 0;
    for (const row of source) {
      if (row.start > at) break;
      value = row.mean ?? value;
    }
    return Math.max(0, value / divisor);
  };

  const solar = timestamps.map((at) => sample(solarRows, at));
  const house = timestamps.map((at) => sample(houseRows, at));

  const peaks = solarRows.map((row) => row.max ?? row.mean ?? 0);
  const solarPeak = peaks.length ? Math.max(...peaks) / divisor : undefined;

  const windowStart = end - windowMinutes * 60 * 1000;
  const windowSamples = houseRows
    .filter((row) => row.start >= windowStart && row.mean !== undefined)
    .map((row) => (row.mean as number) / divisor);
  const { mean, spread } = averageLoad(windowSamples);

  return { timestamps, solar, house, solarPeak, houseAverage: mean, houseSpread: spread };
}

/** Area under a resampled kW series, in kWh. */
export function integrate(timestamps: number[], values: number[]): number {
  let total = 0;
  for (let index = 1; index < timestamps.length; index += 1) {
    const hours = (timestamps[index] - timestamps[index - 1]) / 3600000;
    total += ((values[index] + values[index - 1]) / 2) * hours;
  }
  return total;
}

/**
 * A short series of its own, evenly spaced from midnight to now. Used where a
 * shape matters more than the values — a sparkline has no axis to read.
 */
export function sampleSeries(
  rows: StatisticPoint[],
  points: number,
  now = new Date()
): number[] {
  const usable = rows
    .filter((row) => row.mean !== null && row.mean !== undefined && Number.isFinite(row.mean))
    .sort((a, b) => a.start - b.start);
  if (usable.length === 0 || points < 2) return [];

  const start = startOfToday(now).getTime();
  const span = Math.max(1, now.getTime() - start);
  const out: number[] = [];

  let at = 0;
  for (let index = 0; index < points; index += 1) {
    const when = start + (span * index) / (points - 1);
    while (at + 1 < usable.length && usable[at + 1].start <= when) at += 1;
    out.push(usable[at].mean as number);
  }
  return out;
}
