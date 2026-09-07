export interface ChartBox {
  width: number;
  height: number;
  padding: number;
}

export interface ChartDomain {
  start: number;
  end: number;
}

export interface ChartGeometry {
  area: string;
  solar: string;
  house: string;
  nowX?: number;
  nowY?: number;
}

const DEFAULT_BOX: ChartBox = { width: 340, height: 84, padding: 12 };

function scaleX(timestamp: number, domain: ChartDomain, box: ChartBox): number {
  const span = box.width - box.padding * 2;
  const width = domain.end - domain.start;
  if (width <= 0) return box.padding;
  const progress = Math.min(1, Math.max(0, (timestamp - domain.start) / width));
  return box.padding + progress * span;
}

function scaleY(value: number, max: number, box: ChartBox): number {
  const span = box.height - box.padding;
  if (max <= 0) return box.height;
  return box.height - (Math.max(0, value) / max) * span;
}

const toPath = (pairs: Array<[number, number]>) =>
  pairs
    .map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");

/**
 * Both series share one scale so the eye can compare them, and the x axis is
 * the solar day rather than the data range — a line stopping two thirds across
 * then says "the day is not over" without a word of explanation.
 */
export function chartGeometry(
  timestamps: number[],
  solar: number[],
  house: number[],
  domain: ChartDomain,
  box: ChartBox = DEFAULT_BOX
): ChartGeometry {
  if (timestamps.length < 2) {
    return { area: "", solar: "", house: "" };
  }

  const max = Math.max(0.001, ...solar, ...house);
  const xs = timestamps.map((timestamp) => scaleX(timestamp, domain, box));

  const solarPoints: Array<[number, number]> = solar.map((value, index) => [
    xs[index],
    scaleY(value, max, box)
  ]);
  const housePoints: Array<[number, number]> = house.map((value, index) => [
    xs[index],
    scaleY(value, max, box)
  ]);

  const first = solarPoints[0];
  const last = solarPoints.at(-1);
  const area =
    first && last
      ? `${toPath(solarPoints)} L${last[0].toFixed(1)},${box.height} L${first[0].toFixed(1)},${box.height} Z`
      : "";

  return {
    area,
    solar: toPath(solarPoints),
    house: housePoints.length > 1 ? toPath(housePoints) : "",
    nowX: last?.[0],
    nowY: last?.[1]
  };
}

export { DEFAULT_BOX as CHART_BOX };
