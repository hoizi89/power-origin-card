import { niceTick, type ChartBox, type ChartDomain, type ChartTick } from "./chart";

export interface Bar {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BarGeometry {
  bars: Bar[];
  /** Consumption across the bar centres, on the same scale. */
  house: string;
  /** The same day a week ago, on the same scale. */
  earlier?: string;
  nowX?: number;
  tick?: ChartTick;
}

const HOUR = 60 * 60 * 1000;
const GAP = 2;

const floorHour = (time: number) => Math.floor(time / HOUR) * HOUR;

function hourlyMean(
  timestamps: number[],
  values: number[],
  from: number,
  to: number
): number | undefined {
  let sum = 0;
  let count = 0;
  for (let index = 0; index < timestamps.length; index += 1) {
    const value = values[index];
    // A missing series must not average into NaN and poison the whole scale.
    if (!Number.isFinite(value)) continue;
    if (timestamps[index] >= from && timestamps[index] < to) {
      sum += value;
      count += 1;
    }
  }
  return count > 0 ? sum / count : undefined;
}

/**
 * The same day as columns: one per hour, averaged. Clouds stop shredding the
 * outline, and morning and afternoon become comparable at a glance — at the
 * price of the short spikes the area keeps.
 */
export function chartBars(
  timestamps: number[],
  solar: number[],
  house: number[],
  domain: ChartDomain,
  box: ChartBox,
  earlier: number[] = []
): BarGeometry {
  if (timestamps.length < 2) return { bars: [], house: "" };

  const span = box.width - box.padding * 2;
  const width = domain.end - domain.start;
  if (width <= 0) return { bars: [], house: "" };


  const scaleX = (time: number) =>
    box.padding + Math.min(1, Math.max(0, (time - domain.start) / width)) * span;

  const hours: number[] = [];
  for (let hour = floorHour(domain.start); hour < domain.end; hour += HOUR) hours.push(hour);

  const solarHours = hours.map((hour) => hourlyMean(timestamps, solar, hour, hour + HOUR));
  const houseHours = hours.map((hour) => hourlyMean(timestamps, house, hour, hour + HOUR));

  // The comparison shares the scale, or the two days compare nothing.
  const max = Math.max(
    0.001,
    ...solarHours.filter((value): value is number => Number.isFinite(value)),
    ...houseHours.filter((value): value is number => Number.isFinite(value)),
    ...earlier.filter((value) => Number.isFinite(value))
  );

  const scaleY = (value: number) => box.height - (Math.max(0, value) / max) * (box.height - box.padding);

  const bars: Bar[] = [];
  const points: Array<[number, number]> = [];

  hours.forEach((hour, index) => {
    const left = scaleX(Math.max(hour, domain.start));
    const right = scaleX(Math.min(hour + HOUR, domain.end));
    const barWidth = Math.max(1, right - left - GAP);
    const centre = left + barWidth / 2;

    const solarValue = solarHours[index];
    if (solarValue !== undefined) {
      const y = scaleY(solarValue);
      bars.push({ x: left, y, width: barWidth, height: Math.max(0, box.height - y) });
    }

    const houseValue = houseHours[index];
    if (houseValue !== undefined) points.push([centre, scaleY(houseValue)]);
  });

  const path =
    points.length > 1
      ? points
          .map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
          .join(" ")
      : "";

  const tickValue = niceTick(max);

  const earlierPath =
    earlier.length > 1
      ? earlier
          .map((value, index) => {
            const x = box.padding + (span * index) / (earlier.length - 1);
            return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${scaleY(value).toFixed(1)}`;
          })
          .join(" ")
      : undefined;

  return {
    bars,
    house: path,
    nowX: scaleX(timestamps.at(-1) ?? domain.start),
    tick: tickValue === undefined ? undefined : { value: tickValue, y: scaleY(tickValue) },
    earlier: earlierPath
  };
}
