export interface BatteryInput {
  /** State of charge in percent. */
  soc?: number;
  /** Positive while discharging, in kW. */
  power?: number;
  /** Usable capacity in Wh. */
  capacity?: number;
  /** Percent kept in reserve and never delivered. */
  reserve?: number;
  /** Mean house load over the averaging window, in kW. */
  averageLoad?: number;
  /** Spread of that mean, relative. Above the threshold the estimate is dropped. */
  loadSpread?: number;
}

export type BatteryMode = "charging" | "discharging" | "full" | "idle" | "unknown";

export interface BatteryView {
  mode: BatteryMode;
  soc?: number;
  /** Energy above the reserve, in kWh. */
  availableKwh?: number;
  /** Hours until empty or full — undefined when it cannot be said honestly. */
  hours?: number;
  /** The clock time that goes with `hours`. */
  at?: Date;
  power?: number;
}

const FULL_SOC = 99;
const IDLE_KW = 0.05;

/**
 * Above this relative spread the averaged load is too jumpy to divide by, so
 * the card says nothing instead of promising a number that will not hold.
 */
export const SPREAD_LIMIT = 0.6;

export function batteryView(input: BatteryInput, now = new Date()): BatteryView {
  const { soc, power, capacity, reserve = 0 } = input;

  if (soc === undefined) return { mode: "unknown" };

  const usableKwh = capacity ? (capacity / 1000) * Math.max(0, (soc - reserve) / 100) : undefined;
  const headroomKwh = capacity ? (capacity / 1000) * Math.max(0, (100 - soc) / 100) : undefined;

  const charging = power !== undefined && power < -IDLE_KW;
  const discharging = power !== undefined && power > IDLE_KW;

  const mode: BatteryMode = discharging
    ? "discharging"
    : soc >= FULL_SOC
      ? "full"
      : charging
        ? "charging"
        : "idle";

  const view: BatteryView = { mode, soc, availableKwh: usableKwh, power };

  if (mode === "charging" && headroomKwh !== undefined && power !== undefined) {
    const rate = Math.abs(power);
    if (rate > IDLE_KW) view.hours = headroomKwh / rate;
  }

  if (mode === "discharging" && usableKwh !== undefined && usableKwh > 0) {
    const load = input.averageLoad;
    const spread = input.loadSpread ?? 0;
    if (load !== undefined && load > IDLE_KW && spread <= SPREAD_LIMIT) {
      view.hours = usableKwh / load;
    }
  }

  if (view.hours !== undefined && Number.isFinite(view.hours)) {
    view.at = new Date(now.getTime() + view.hours * 3600 * 1000);
  } else {
    view.hours = undefined;
  }

  return view;
}

export interface Segment {
  filled: boolean;
  /** Fraction of this segment that is filled, 0..1. Only the last one is partial. */
  fill: number;
}

/**
 * How many blocks to draw. Zero means one per kilowatt-hour, which turns the
 * row into something countable: nine lit blocks are nine kilowatt-hours, where
 * ten blocks on a 13.1 kWh store would each be a fraction nobody can add up.
 */
export function segmentCount(configured: number, capacityWh: number): number {
  if (configured > 0) return Math.round(configured);
  const perKwh = Math.round(capacityWh / 1000);
  return Math.min(20, Math.max(6, perKwh || 10));
}

/** Splits a charge level into equal blocks, the last one partly filled. */
export function segments(soc: number, count: number): Segment[] {
  const safeCount = Math.max(1, Math.round(count));
  const level = Math.min(100, Math.max(0, soc)) / 100;
  const exact = level * safeCount;

  return Array.from({ length: safeCount }, (_, index) => {
    const fill = Math.min(1, Math.max(0, exact - index));
    return { filled: fill > 0, fill };
  });
}

/** Mean and relative spread of a window of samples. */
export function averageLoad(samples: number[]): { mean?: number; spread: number } {
  const usable = samples.filter((value) => Number.isFinite(value));
  if (usable.length === 0) return { spread: 0 };

  const mean = usable.reduce((sum, value) => sum + value, 0) / usable.length;
  if (mean <= 0) return { mean, spread: 0 };

  const variance =
    usable.reduce((sum, value) => sum + (value - mean) ** 2, 0) / usable.length;
  return { mean, spread: Math.sqrt(variance) / mean };
}
