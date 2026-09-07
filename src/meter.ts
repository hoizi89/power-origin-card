export type MeterKey = "battery" | "grid" | "import";

export interface MeterFill {
  key: MeterKey;
  /** Distance from the block's zero-facing edge, 0..1 of the block. */
  offset: number;
  /** Length along the block, 0..1. */
  size: number;
}

export interface MeterSegment {
  y: number;
  height: number;
  direction: "up" | "down";
  fills: MeterFill[];
}

export interface MeterInput {
  /** Surplus charging the battery, in kW. */
  toBattery: number;
  /** Surplus leaving for the grid, in kW. */
  toGrid: number;
  /** Power drawn from the grid, in kW. */
  fromGrid: number;
}

export interface MeterGeometry {
  segments: MeterSegment[];
  scale: number;
  /** Everything the house is not using: battery charge plus export. */
  surplus: number;
  overUp: boolean;
  overDown: boolean;
  /** Where to draw the threshold line, if one is set. */
  targetY?: number;
  /** True while the surplus has not reached that threshold. */
  belowTarget: boolean;
}

export const METER_HEIGHT = 200;
export const METER_STEPS = 6;

const BLOCK = 12;
const GAP = 2.6;
const MIDDLE = METER_HEIGHT / 2;
const CENTRE_GAP = 3;

const overlap = (aFrom: number, aTo: number, bFrom: number, bTo: number) =>
  Math.max(0, Math.min(aTo, bTo) - Math.max(aFrom, bFrom));

/**
 * A level meter rather than a gauge: the middle is zero, spare power climbs and
 * grid draw sinks, so the direction is read before any number is.
 *
 * Charging counts as spare because it is displaceable — switch something on and
 * the battery simply charges more slowly. It sits nearest the middle so the
 * column reads as one surplus with a green foot and a gold top.
 *
 * `scale` of 0 derives full deflection from the system's own peak over the past
 * year, rounded up to a whole kilowatt. It must not follow the weather: a meter
 * scaled to a dull day would show 900 W as nearly full, and 900 W does not run
 * a dishwasher. Two kilowatts have to look the same in December as in June.
 */
export function meterGeometry(
  input: MeterInput,
  scale: number,
  fallbackPeak = 0,
  target = 0
): MeterGeometry {
  const toBattery = Math.max(0, input.toBattery);
  const toGrid = Math.max(0, input.toGrid);
  const fromGrid = Math.max(0, input.fromGrid);
  const surplus = toBattery + toGrid;

  const span = scale > 0 ? scale : Math.max(Math.ceil(fallbackPeak), surplus, fromGrid, 1);
  const step = span / METER_STEPS;

  const segments: MeterSegment[] = [];

  for (let index = 0; index < METER_STEPS; index += 1) {
    const from = index * step;
    const to = from + step;

    const battery = overlap(from, to, 0, toBattery) / step;
    const grid = overlap(from, to, toBattery, surplus) / step;

    const fills: MeterFill[] = [];
    if (battery > 0) fills.push({ key: "battery", offset: 0, size: battery });
    if (grid > 0) fills.push({ key: "grid", offset: battery, size: grid });

    segments.push({
      direction: "up",
      y: MIDDLE - CENTRE_GAP - (index + 1) * BLOCK - index * GAP,
      height: BLOCK,
      fills
    });

    const drawn = overlap(from, to, 0, fromGrid) / step;
    segments.push({
      direction: "down",
      y: MIDDLE + CENTRE_GAP + index * (BLOCK + GAP),
      height: BLOCK,
      fills: drawn > 0 ? [{ key: "import", offset: 0, size: drawn }] : []
    });
  }

  const column = METER_STEPS * BLOCK + (METER_STEPS - 1) * GAP;
  const targetY =
    target > 0 && target <= span
      ? MIDDLE - CENTRE_GAP - (target / span) * column
      : undefined;

  return {
    segments,
    scale: span,
    surplus,
    overUp: surplus > span * 1.001,
    overDown: fromGrid > span * 1.001,
    targetY,
    belowTarget: target > 0 && surplus < target
  };
}
