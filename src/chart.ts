export interface ChartBox {
  width: number;
  height: number;
  padding: number;
}

export interface ChartDomain {
  start: number;
  end: number;
}

export interface ChartTick {
  /** The round value the line stands for, in kW. */
  value: number;
  y: number;
}

export interface ChartGeometry {
  area: string;
  solar: string;
  house: string;
  /** The same day a week ago, on the same scale. */
  earlier?: string;
  /** The best day of the year, as an outline on the same scale. */
  best?: string;
  /** What is still expected, as a dashed line from now on. */
  ghost?: string;
  /** What the grid and the battery carried, hour by hour, as stepped areas. */
  layerGrid?: string;
  layerBattery?: string;
  nowX?: number;
  nowY?: number;
  tick?: ChartTick;
}

/** Series drawn behind or ahead of the day, all on the day's scale. */
export interface ChartExtras {
  /** Expected power by hour start, in kW, for the hours still to come. */
  ghost?: Array<{ start: number; kw: number }>;
  /** Draw every ghost hour, not only those after now: tomorrow over today's axis. */
  ghostAll?: boolean;
  /** What the grid and the battery carried, by hour start, in kW. */
  layers?: Array<{ start: number; grid: number; battery: number }>;
  /** The best day of the year, one mean per hour of the day, in kW. */
  best?: number[];
}

const HOUR_MS = 60 * 60 * 1000;

/** Stepped areas for the hourly layers: the grid at the foot, the battery on top of it. */
export function layerPaths(
  layers: Array<{ start: number; grid: number; battery: number }>,
  x: (time: number) => number,
  y: (value: number) => number,
  domain: ChartDomain,
  floor: number
): { grid: string; battery: string } {
  const step = (top: (l: { grid: number; battery: number }) => number, base: (l: { grid: number; battery: number }) => number) => {
    const rows = layers.filter((l) => l.start + HOUR_MS > domain.start && l.start < domain.end);
    if (rows.length === 0) return "";
    const up: string[] = [];
    const down: string[] = [];
    for (const l of rows) {
      const left = x(Math.max(l.start, domain.start));
      const right = x(Math.min(l.start + HOUR_MS, domain.end));
      up.push(`L${left.toFixed(1)},${y(top(l)).toFixed(1)} L${right.toFixed(1)},${y(top(l)).toFixed(1)}`);
      down.unshift(`L${right.toFixed(1)},${y(base(l)).toFixed(1)} L${left.toFixed(1)},${y(base(l)).toFixed(1)}`);
    }
    const start = x(Math.max(rows[0].start, domain.start));
    return `M${start.toFixed(1)},${floor.toFixed(1)} ${up.join(" ")} ${down.join(" ")} Z`;
  };
  return {
    grid: step((l) => l.grid, () => 0),
    battery: step((l) => l.grid + l.battery, (l) => l.grid)
  };
}

/** The best day as one line across the day: hour means at the hour centres. */
export function bestPath(
  best: number[],
  x: (time: number) => number,
  y: (value: number) => number,
  domain: ChartDomain,
  midnight: number
): string | undefined {
  if (best.length < 2) return undefined;
  const points = best
    .map((value, hour) => [midnight + (hour + 0.5) * HOUR_MS, value] as const)
    .filter(([at]) => at >= domain.start && at <= domain.end);
  if (points.length < 2) return undefined;
  return points
    .map(([at, value], index) => `${index === 0 ? "M" : "L"}${x(at).toFixed(1)},${y(value).toFixed(1)}`)
    .join(" ");
}

const NICE = [0.5, 1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 75, 100];

/**
 * A round value comfortably under the tallest thing drawn. Without one a bar
 * has a shape but no size, and the eye has nothing to measure against.
 */
export function niceTick(max: number): number | undefined {
  const room = max * 0.9;
  let best: number | undefined;
  for (const candidate of NICE) if (candidate <= room) best = candidate;
  return best;
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
  box: ChartBox = DEFAULT_BOX,
  earlier: number[] = [],
  extras: ChartExtras = {}
): ChartGeometry {
  if (timestamps.length < 2) {
    return { area: "", solar: "", house: "" };
  }

  // Everything drawn shares the scale, or nothing can be compared with anything.
  const ghost = (extras.ghost ?? []).filter(
    (g) => extras.ghostAll || g.start + HOUR_MS > (timestamps.at(-1) ?? 0)
  );
  const layers = extras.layers ?? [];
  const best = extras.best ?? [];
  const max = Math.max(
    0.001,
    ...solar,
    ...house,
    ...earlier,
    ...ghost.map((g) => g.kw),
    ...layers.map((l) => l.grid + l.battery),
    ...best
  );
  const xs = timestamps.map((timestamp) => scaleX(timestamp, domain, box));
  const x = (time: number) => scaleX(time, domain, box);
  const y = (value: number) => scaleY(value, max, box);
  const midnight = new Date(domain.start);
  midnight.setHours(0, 0, 0, 0);

  const ghostPath =
    ghost.length > 0
      ? toPath([
          ...(extras.ghostAll ? [] : [[xs.at(-1) as number, y(solar.at(-1) ?? 0)] as [number, number]]),
          ...ghost.map((g) => [x(Math.min(domain.end, g.start + HOUR_MS / 2)), y(g.kw)] as [number, number])
        ])
      : undefined;
  const layered = layers.length ? layerPaths(layers, x, y, domain, box.height) : undefined;
  const bestLine = bestPath(best, x, y, domain, midnight.getTime());

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

  const earlierPath =
    earlier.length > 1
      ? toPath(
          earlier.map((value, index) => [xs[index] ?? xs.at(-1)!, scaleY(value, max, box)])
        )
      : undefined;

  const tickValue = niceTick(max);

  return {
    area,
    solar: toPath(solarPoints),
    house: housePoints.length > 1 ? toPath(housePoints) : "",
    nowX: last?.[0],
    nowY: last?.[1],
    tick: tickValue === undefined ? undefined : { value: tickValue, y: scaleY(tickValue, max, box) },
    earlier: earlierPath,
    ghost: ghostPath,
    layerGrid: layered?.grid || undefined,
    layerBattery: layered?.battery || undefined,
    best: bestLine
  };
}

export { DEFAULT_BOX as CHART_BOX };
