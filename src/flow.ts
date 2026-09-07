export interface FlowInput {
  house: number;
  solar?: number;
  battery?: number;
  grid?: number;
}

export interface Flow {
  house: number;
  production: number;
  fromSolar: number;
  fromBattery: number;
  fromGrid: number;
  toGrid: number;
  toBattery: number;
  /** Share of the house covered without the grid, 0..1. */
  autarky: number;
}

const clampPositive = (value: number) => (Number.isFinite(value) && value > 0 ? value : 0);

/**
 * Splits the house load into sun, battery and grid.
 *
 * `battery` is positive while discharging, `grid` positive while importing.
 */
export function computeFlow(input: FlowInput): Flow {
  const house = clampPositive(input.house);
  const solar = clampPositive(input.solar ?? 0);
  const battery = Number.isFinite(input.battery ?? NaN) ? (input.battery as number) : 0;

  const discharge = clampPositive(battery);
  const charge = clampPositive(-battery);
  const metered = input.grid !== undefined && Number.isFinite(input.grid);
  const toBattery = charge;

  let fromSolar: number;
  let fromBattery: number;
  let fromGrid: number;
  let toGrid: number;

  if (metered) {
    // The billing meter is the most trustworthy device on the wall, so it is
    // taken first and the inverter's own solar figure becomes the remainder.
    const grid = input.grid as number;
    fromGrid = Math.min(house, clampPositive(grid));
    fromBattery = Math.min(house - fromGrid, discharge);
    fromSolar = house - fromGrid - fromBattery;
    toGrid = clampPositive(-grid);
  } else {
    fromSolar = Math.min(solar, house);
    fromBattery = Math.min(house - fromSolar, discharge);
    fromGrid = house - fromSolar - fromBattery;
    toGrid = clampPositive(solar - fromSolar - toBattery);
  }

  return {
    house,
    production: solar,
    fromSolar,
    fromBattery,
    fromGrid,
    toGrid,
    toBattery,
    autarky: house > 0 ? Math.min(1, (house - fromGrid) / house) : 1
  };
}

/**
 * Worth a line of its own? A trickle from the grid beside a battery carrying
 * the house is neither large enough nor a large enough share to name. It has
 * to fail both tests to be dropped, so a small but real share still shows.
 */
export function worthNaming(value: number, total: number): boolean {
  if (!Number.isFinite(value) || value <= 0) return false;
  const share = total > 0 ? value / total : 1;
  return value >= NAMEABLE_KW || share >= NAMEABLE_SHARE;
}

/** Below this in kW and below the share, a flow is a rounding error. */
export const NAMEABLE_KW = 0.05;
export const NAMEABLE_SHARE = 0.08;

export type SegmentKey = "solar" | "battery" | "grid" | "house" | "free";

export interface RingSegment {
  key: SegmentKey;
  /** Length on a pathLength="100" circle. */
  length: number;
  offset: number;
  power: number;
}

const GAP = 1;

/** Lays parts out around a ring, leaving a gap only where two meet. */
function layout(parts: Array<{ key: SegmentKey; power: number }>): RingSegment[] {
  const used = parts.filter((part) => part.power > 0.001);
  if (used.length === 0) return [];

  const total = used.reduce((sum, part) => sum + part.power, 0);
  const gap = used.length > 1 ? GAP : 0;
  const usable = 100 - gap * used.length;

  let offset = 0;
  return used.map((part) => {
    const length = (part.power / total) * usable;
    const segment: RingSegment = { key: part.key, length, offset, power: part.power };
    offset += length + gap;
    return segment;
  });
}

/** Where the house's power comes from. Always fills the whole ring. */
export function ringSegments(flow: Flow): RingSegment[] {
  return layout([
    { key: "solar", power: flow.fromSolar },
    { key: "battery", power: flow.fromBattery },
    { key: "grid", power: flow.fromGrid }
  ]);
}

/**
 * The roof's output with the unclaimed part last, so the open arc reads as
 * headroom: how much can be switched on without touching the grid.
 */
export function surplusSegments(flow: Flow): RingSegment[] {
  return layout([
    { key: "house", power: flow.fromSolar },
    { key: "battery", power: flow.toBattery },
    { key: "free", power: flow.toGrid }
  ]);
}

/**
 * Where the roof's output goes. On a bright day the house is a sliver of it,
 * which the inner ring alone cannot show.
 */
export function productionSegments(flow: Flow): RingSegment[] {
  return layout([
    { key: "house", power: flow.fromSolar },
    { key: "battery", power: flow.toBattery },
    { key: "grid", power: flow.toGrid }
  ]);
}
