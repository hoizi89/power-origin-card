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
  now = new Date()
): HourShare[] {
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const start = midnight.getTime();
  const nowHour = now.getHours();

  const out: HourShare[] = [];

  for (let hour = 0; hour <= nowHour; hour += 1) {
    const from = start + hour * HOUR;
    const house = meanOf(houseRows, from, from + HOUR, divisor);

    if (house === undefined || house <= 0) {
      out.push({ hour, solar: 0, battery: 0, grid: 0, total: 0 });
      continue;
    }

    const grid = Math.max(0, meanOf(gridRows, from, from + HOUR, divisor) ?? 0);
    const battery = Math.max(0, meanOf(batteryRows, from, from + HOUR, divisor) ?? 0);

    const fromGrid = Math.min(grid, house);
    const fromBattery = Math.min(battery, Math.max(0, house - fromGrid));
    const fromSolar = Math.max(0, house - fromGrid - fromBattery);

    const parts: Array<[SourceKey, number]> = [
      ["solar", fromSolar],
      ["battery", fromBattery],
      ["grid", fromGrid]
    ];
    const best = parts.reduce((a, b) => (b[1] > a[1] ? b : a));

    out.push({
      hour,
      solar: fromSolar,
      battery: fromBattery,
      grid: fromGrid,
      total: house,
      dominant: best[1] > 0 ? best[0] : undefined
    });
  }

  return out;
}

/** True once enough of the day is described to be worth drawing. */
export function worthDrawing(hours: HourShare[]): boolean {
  return hours.filter((hour) => hour.total > 0).length >= 2;
}
