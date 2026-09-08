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

/** The lowest and highest reading of the day, or nothing when there were none. */
export function extremes(rows: StatisticPoint[]): { low: number; high: number } | undefined {
  let low: number | undefined;
  let high: number | undefined;
  for (const row of rows) {
    const value = row.mean;
    if (value === null || value === undefined || !Number.isFinite(value)) continue;
    if (low === undefined || value < low) low = value;
    if (high === undefined || value > high) high = value;
  }
  return low === undefined || high === undefined ? undefined : { low, high };
}

type Recent = Record<string, Array<{ mean?: number | null; change?: number | null }> | undefined>;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/**
 * What each sensor averaged over the last few minutes, in its own unit. A
 * device that draws for a while shows; a kettle that ran two minutes ago is
 * mostly gone from a fifteen-minute mean, which is the point.
 */
export async function fetchRecentMeans(
  hass: HomeAssistant,
  ids: string[],
  minutes: number,
  now = new Date()
): Promise<Record<string, number | undefined>> {
  const wanted = ids.filter(Boolean);
  if (wanted.length === 0) return {};
  const response = await hass.callWS<Recent>({
    type: "recorder/statistics_during_period",
    start_time: new Date(now.getTime() - Math.max(1, minutes) * 60000).toISOString(),
    end_time: now.toISOString(),
    statistic_ids: wanted,
    period: "5minute",
    types: ["mean"]
  });
  const out: Record<string, number | undefined> = {};
  for (const id of wanted) {
    const means = (response?.[id] ?? []).map((row) => row.mean).filter(finite);
    out[id] = means.length ? means.reduce((a, b) => a + b, 0) / means.length : undefined;
  }
  return out;
}

/** How much each meter grew since midnight, in its own unit. */
export async function fetchTodayChange(
  hass: HomeAssistant,
  ids: string[],
  now = new Date()
): Promise<Record<string, number | undefined>> {
  const wanted = ids.filter(Boolean);
  if (wanted.length === 0) return {};
  const response = await hass.callWS<Recent>({
    type: "recorder/statistics_during_period",
    start_time: startOfToday(now).toISOString(),
    end_time: now.toISOString(),
    statistic_ids: wanted,
    period: "day",
    types: ["change"]
  });
  const out: Record<string, number | undefined> = {};
  for (const id of wanted) {
    const changes = (response?.[id] ?? []).map((row) => row.change).filter(finite);
    out[id] = changes.length ? changes.reduce((a, b) => a + b, 0) : undefined;
  }
  return out;
}
