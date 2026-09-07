export type MeterKey = "battery" | "grid" | "import" | "discharge";

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
  /** Power taken out of the battery, in kW. */
  fromBattery: number;
}

export interface MeterGeometry {
  segments: MeterSegment[];
  /** Full deflection upwards, in kW. */
  scale: number;
  /** Full deflection downwards, in kW. */
  scaleDown: number;
  /** Everything the house is not using: battery charge plus export. */
  surplus: number;
  /** Everything the house is drawing on: battery plus grid. */
  deficit: number;
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
 * The two directions carry different quantities and so keep different scales:
 * a ten-kilowatt roof against a house that rarely pulls three. Forcing both onto
 * the roof's scale makes an evening's draw a hairline — true, and useless.
 *
 * A scale of 0 derives full deflection from the system's own peak over the past
 * year, rounded up to a whole kilowatt. It must not follow the weather: a meter
 * scaled to a dull day would show 900 W as nearly full, and 900 W does not run
 * a dishwasher. Two kilowatts have to look the same in December as in June.
 */
export function meterGeometry(
  input: MeterInput,
  scale: number,
  fallbackPeak = 0,
  target = 0,
  scaleDown = 0,
  fallbackDraw = 0
): MeterGeometry {
  const toBattery = Math.max(0, input.toBattery);
  const toGrid = Math.max(0, input.toGrid);
  const fromGrid = Math.max(0, input.fromGrid);
  const fromBattery = Math.max(0, input.fromBattery);
  const surplus = toBattery + toGrid;
  const deficit = fromBattery + fromGrid;

  const span = scale > 0 ? scale : Math.max(Math.ceil(fallbackPeak), surplus, 1);
  const spanDown =
    scaleDown > 0 ? scaleDown : Math.max(Math.ceil(fallbackDraw), deficit, 1);
  const step = span / METER_STEPS;
  const stepDown = spanDown / METER_STEPS;

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

    // Mirrored: the battery sits nearest the middle going down as it does
    // going up, so the same store reads the same way in both directions.
    const fromDown = index * stepDown;
    const toDown = fromDown + stepDown;
    const discharge = overlap(fromDown, toDown, 0, fromBattery) / stepDown;
    const imported = overlap(fromDown, toDown, fromBattery, deficit) / stepDown;

    const downFills: MeterFill[] = [];
    if (discharge > 0) downFills.push({ key: "discharge", offset: 0, size: discharge });
    if (imported > 0) downFills.push({ key: "import", offset: discharge, size: imported });

    segments.push({
      direction: "down",
      y: MIDDLE + CENTRE_GAP + index * (BLOCK + GAP),
      height: BLOCK,
      fills: downFills
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
    scaleDown: spanDown,
    surplus,
    deficit,
    overUp: surplus > span * 1.001,
    overDown: deficit > spanDown * 1.001,
    targetY,
    belowTarget: target > 0 && surplus < target
  };
}
