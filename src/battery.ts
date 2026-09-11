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
  /** The battery's power averaged over the last while, same sign as `power`, in kW. */
  averagePower?: number;
  /** What the battery was doing last time, so a few watts either way do not flip it. */
  lastMode?: BatteryMode;
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
  /** Where the full time came from, or why there is none. */
  full?: "rate" | "forecast" | "not_today" | "between";
  /** The two ends of the span, when the forecast's own edges land far apart. */
  early?: Date;
  late?: Date;
  /** Where the charge will stand at sunset when full is not on today's cards. */
  socAtSunset?: number;
}

const FULL_SOC = 99;
const IDLE_KW = 0.05;
/**
 * A battery at rest drifts a few watts either side of zero, and a single
 * threshold turns that drift into a word that flips every update. So the
 * door in is further out than the door back: it takes real power to start
 * charging or delivering, and only a near standstill to stop.
 */
const ENTER_KW = 0.1;
const LEAVE_KW = 0.05;

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

  const { lastMode } = input;
  const charging =
    power !== undefined && power < -(lastMode === "charging" ? LEAVE_KW : ENTER_KW);
  const discharging =
    power !== undefined && power > (lastMode === "discharging" ? LEAVE_KW : ENTER_KW);

  const mode: BatteryMode = discharging
    ? "discharging"
    : soc >= FULL_SOC
      ? "full"
      : charging
        ? "charging"
        : "idle";

  const view: BatteryView = { mode, soc, availableKwh: usableKwh, power };

  if (mode === "charging" && headroomKwh !== undefined && power !== undefined) {
    // A cloud passing over the roof is not a change of plan; the last quarter
    // hour is, as long as it was charging too.
    const average = input.averagePower;
    const rate = average !== undefined && average < -IDLE_KW ? Math.abs(average) : Math.abs(power);
    if (rate > IDLE_KW) {
      view.hours = headroomKwh / rate;
      view.full = "rate";
    }
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
export type SunriseReach = "tight" | "ok" | "easy";

/**
 * Reaching sunrise is not one state. A tenth of an hour to spare and half a
 * night to spare call for opposite behaviour, and the word is the only place
 * that difference can show.
 */
export function sunriseReach(
  hours: number | undefined,
  hoursToSunrise: number | undefined
): SunriseReach | undefined {
  if (hours === undefined || hoursToSunrise === undefined) return undefined;
  if (!Number.isFinite(hours) || !Number.isFinite(hoursToSunrise)) return undefined;
  if (hoursToSunrise <= 0 || hours < hoursToSunrise) return undefined;

  const ratio = hours / hoursToSunrise;
  if (ratio < 1.15) return "tight";
  return ratio < 1.6 ? "ok" : "easy";
}

export interface ForecastSlot {
  start: number;
  /** Expected roof output through the hour, in kW. */
  kw: number;
  /** The forecast's own pessimistic and optimistic edges for the hour, in kW. */
  low?: number;
  high?: number;
}

/**
 * When the roof, minus the house, has filled what is missing. The forecast is
 * read hour by hour from now, the part of this hour already gone left out. The
 * sunset ends the search: what is not full by then is not full today, and the
 * charge it reaches by then is the honest answer instead.
 */
export function fullFromForecast(
  slots: ForecastSlot[],
  now: Date,
  headroomKwh: number,
  loadKw: number,
  sunset?: Date,
  edge: "kw" | "low" | "high" = "kw"
): { at?: Date; reachedKwh: number } {
  const HOUR = 3600 * 1000;
  const end = sunset ? sunset.getTime() : Number.POSITIVE_INFINITY;
  let reached = 0;
  const ordered = [...slots].sort((a, b) => a.start - b.start);
  for (const slot of ordered) {
    const from = Math.max(slot.start, now.getTime());
    const to = Math.min(slot.start + HOUR, end);
    if (to <= from) continue;
    const surplus = Math.max(0, (slot[edge] ?? slot.kw) - loadKw);
    const gain = (surplus * (to - from)) / HOUR;
    if (headroomKwh > 0 && reached + gain >= headroomKwh) {
      const share = surplus > 0 ? (headroomKwh - reached) / surplus : 0;
      return { at: new Date(from + share * HOUR), reachedKwh: headroomKwh };
    }
    reached += gain;
  }
  return { reachedKwh: reached };
}

/**
 * A full time worked out from the rate is a straight line; the sun is not.
 * Past today's sunset the line runs through the night, and past a day it says
 * nothing at all. Both are the same answer: not today.
 */
/**
 * How sure the hour is. A forecast that publishes edges is asked how far
 * apart its own two answers land; the hour it names means little when the
 * pessimistic day never fills and the optimistic one fills by lunch.
 */
export function fullSpan(
  slots: ForecastSlot[],
  now: Date,
  headroomKwh: number,
  loadKw: number,
  sunset?: Date
): { early?: Date; late?: Date; edges: boolean } {
  const edges = slots.some((slot) => slot.low !== undefined && slot.high !== undefined);
  if (!edges) return { edges: false };
  return {
    early: fullFromForecast(slots, now, headroomKwh, loadKw, sunset, "high").at,
    late: fullFromForecast(slots, now, headroomKwh, loadKw, sunset, "low").at,
    edges: true
  };
}

export function fullVerdict(
  at: Date | undefined,
  now: Date,
  sunset: Date | undefined,
  sunUp: boolean
): "time" | "not_today" {
  if (!at) return "time";
  if (at.getTime() - now.getTime() > 24 * 3600 * 1000) return "not_today";
  if (sunUp && sunset && now < sunset && at > sunset) return "not_today";
  return "time";
}

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
