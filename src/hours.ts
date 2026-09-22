import type { StatisticPoint } from "./types";

export type SourceKey = "solar" | "battery" | "grid";

export interface HourShare {
  /** Local hour of the day, 0..23. */
  hour: number;
  solar: number;
  battery: number;
  grid: number;
  /** House load over the hour, in kW. Zero when the hour has no data. */
  total: number;
  /** The share that carried most of the hour, or undefined for an empty one. */
  dominant?: SourceKey;
}

const HOUR = 60 * 60 * 1000;

function meanOf(rows: StatisticPoint[], from: number, to: number, divisor: number): number | undefined {
  let sum = 0;
  let count = 0;
  for (const row of rows) {
    if (row.start < from || row.start >= to) continue;
    const value = row.mean;
    if (value === null || value === undefined || !Number.isFinite(value)) continue;
    sum += value / divisor;
    count += 1;
  }
  return count > 0 ? sum / count : undefined;
}

/** Which way a sensor counts: -1 where positive means export, or charging. */
export interface Signs {
  grid: 1 | -1;
  battery: 1 | -1;
}

const AS_READ: Signs = { grid: 1, battery: 1 };

/** One hour's house load, split by where it came from; undefined for an hour without data. */
function splitHour(
  houseRows: StatisticPoint[],
  gridRows: StatisticPoint[],
  batteryRows: StatisticPoint[],
  divisor: number,
  from: number,
  signs: Signs
): { solar: number; battery: number; grid: number; total: number } | undefined {
  const house = meanOf(houseRows, from, from + HOUR, divisor);
  if (house === undefined || house <= 0) return undefined;

  const grid = Math.max(0, signs.grid * (meanOf(gridRows, from, from + HOUR, divisor) ?? 0));
  const battery = Math.max(0, signs.battery * (meanOf(batteryRows, from, from + HOUR, divisor) ?? 0));

  const fromGrid = Math.min(grid, house);
  const fromBattery = Math.min(battery, Math.max(0, house - fromGrid));
  return { solar: Math.max(0, house - fromGrid - fromBattery), battery: fromBattery, grid: fromGrid, total: house };
}

export interface WindowShare {
  /** The hour's start. */
  start: number;
  solar: number;
  battery: number;
  grid: number;
  total: number;
}

/**
 * The same split for a window that does not care where midnight falls: every full
 * hour from `from` up to the one `to` lies in. An evening and the night after it are
 * one story, and the day's own hours cut it in two.
 */
export function windowShares(
  houseRows: StatisticPoint[],
  gridRows: StatisticPoint[],
  batteryRows: StatisticPoint[],
  divisor: number,
  from: number,
  to: number,
  signs: Signs = AS_READ
): WindowShare[] {
  const out: WindowShare[] = [];
  for (let start = Math.floor(from / HOUR) * HOUR; start < to; start += HOUR) {
    const split = splitHour(houseRows, gridRows, batteryRows, divisor, start, signs);
    out.push({ start, ...(split ?? { solar: 0, battery: 0, grid: 0, total: 0 }) });
  }
  return out;
}

/** What the window took from each source, in kWh; the hour in progress counts for what has passed of it. */
export function windowEnergy(shares: WindowShare[], from: number, to: number): { solar: number; battery: number; grid: number } {
  const sum = { solar: 0, battery: 0, grid: 0 };
  for (const share of shares) {
    const hours = Math.max(0, Math.min(share.start + HOUR, to) - Math.max(share.start, from)) / HOUR;
    sum.solar += share.solar * hours;
    sum.battery += share.battery * hours;
    sum.grid += share.grid * hours;
  }
  return sum;
}

/**
 * The day split by hour and by where the house's power came from.
 *
 * Grid first when a grid sensor is configured, then the battery, and the sun is
 * what remains — the same order the live flow uses, so an hour and the ring
 * cannot disagree about the same moment.
 */
export function hourlyShares(
  houseRows: StatisticPoint[],
  gridRows: StatisticPoint[],
  batteryRows: StatisticPoint[],
  divisor: number,
  now = new Date(),
  signs: Signs = AS_READ
): HourShare[] {
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const start = midnight.getTime();
  const nowHour = now.getHours();

  const out: HourShare[] = [];

  for (let hour = 0; hour <= nowHour; hour += 1) {
    const from = start + hour * HOUR;
    const split = splitHour(houseRows, gridRows, batteryRows, divisor, from, signs);

    if (!split) {
      out.push({ hour, solar: 0, battery: 0, grid: 0, total: 0 });
      continue;
    }

    const parts: Array<[SourceKey, number]> = [
      ["solar", split.solar],
      ["battery", split.battery],
      ["grid", split.grid]
    ];
    const best = parts.reduce((a, b) => (b[1] > a[1] ? b : a));

    out.push({ hour, ...split, dominant: best[1] > 0 ? best[0] : undefined });
  }

  return out;
}

/** True once enough of the day is described to be worth drawing. */
export function worthDrawing(hours: HourShare[]): boolean {
  return hours.filter((hour) => hour.total > 0).length >= 2;
}
