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
  /** The forecast's day as a curve, and the same closed as an area. */
  curve?: { line: string; area: string };
  /** Right of now: the roof expected, its ground, and the house as usual. */
  ahead?: { solar?: string; solarArea?: string; house?: string };
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
  /**
   * What lies right of now in a window that keeps now in its middle: the roof as
   * forecast and the house as it usually draws at that hour, by hour start, in kW.
   */
  ahead?: { solar: Array<{ start: number; kw: number }>; house: Array<{ start: number; kw: number }> };
  /** The whole day as the forecast expects it, by hour start, in kW: drawn as one curve. */
  curve?: Array<{ start: number; kw: number }>;
}

/**
 * The forecast's hours as one soft curve from the left edge to the right:
 * through the middle of each hour, rounded between them, and down to the floor
 * at both ends. The area is the same path, closed.
 */
/** Points joined by one soft line: level at each point, rounded between them. */
export function smoothPath(points: Array<[number, number]>): string {
  if (points.length === 0) return "";
  let line = `M${points[0][0].toFixed(1)},${points[0][1].toFixed(1)}`;
  for (let index = 1; index < points.length; index += 1) {
    const [px, py] = points[index - 1];
    const [cx, cy] = points[index];
    const mid = ((px + cx) / 2).toFixed(1);
    line += ` C${mid},${py.toFixed(1)} ${mid},${cy.toFixed(1)} ${cx.toFixed(1)},${cy.toFixed(1)}`;
  }
  return line;
}

/**
 * The hours right of now as one line that begins where the measured one ends:
 * through the middle of each hour still to come, and level out to the edge.
 */
export function aheadPoints(
  hours: Array<{ start: number; kw: number }>,
  from: [number, number],
  now: number,
  x: (time: number) => number,
  y: (value: number) => number,
  domain: ChartDomain
): Array<[number, number]> {
  const rows = hours
    .filter((hour) => hour.start + HOUR_MS / 2 > now && hour.start + HOUR_MS / 2 < domain.end)
    .sort((a, b) => a.start - b.start);
  if (rows.length === 0) return [];
  const points: Array<[number, number]> = [from, ...rows.map((hour) => [x(hour.start + HOUR_MS / 2), y(hour.kw)] as [number, number])];
  points.push([x(domain.end), points.at(-1)![1]]);
  return points;
}

export function curvePaths(
  hours: Array<{ start: number; kw: number }>,
  x: (time: number) => number,
  y: (value: number) => number,
  domain: ChartDomain
): { line: string; area: string } | undefined {
  const inside = hours
    .filter((hour) => hour.start + HOUR_MS > domain.start && hour.start < domain.end)
    .sort((a, b) => a.start - b.start);
  if (inside.length < 2 || inside.every((hour) => hour.kw < 0.01)) return undefined;
  const clamp = (time: number) => Math.min(domain.end, Math.max(domain.start, time));
  const points: Array<[number, number]> = [
    [x(domain.start), y(0)],
    ...inside.map((hour) => [x(clamp(hour.start + HOUR_MS / 2)), y(hour.kw)] as [number, number]),
    [x(domain.end), y(0)]
  ];
  let line = `M${points[0][0].toFixed(1)},${points[0][1].toFixed(1)}`;
  for (let index = 1; index < points.length; index += 1) {
    const [px, py] = points[index - 1];
    const [cx, cy] = points[index];
    const mid = ((px + cx) / 2).toFixed(1);
    line += ` C${mid},${py.toFixed(1)} ${mid},${cy.toFixed(1)} ${cx.toFixed(1)},${cy.toFixed(1)}`;
  }
  return { line, area: `${line} Z` };
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
    ...(extras.curve ?? []).map((c) => c.kw),
    ...(extras.ahead?.solar ?? []).map((a) => a.kw),
    ...(extras.ahead?.house ?? []).map((a) => a.kw),
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

  // Right of now each line goes on from where it stands, as what is expected.
  const nowTime = timestamps.at(-1) ?? domain.start;
  const nowAt = xs.at(-1) ?? box.padding;
  const aheadOf = (hours: Array<{ start: number; kw: number }> | undefined, last: number | undefined) =>
    hours && hours.some((hour) => hour.kw >= 0.01)
      ? aheadPoints(hours, [nowAt, y(last ?? 0)], nowTime, x, y, domain)
      : [];
  const solarAhead = aheadOf(extras.ahead?.solar, solar.at(-1));
  const houseAhead = aheadOf(extras.ahead?.house, house.at(-1));
  const ahead = extras.ahead
    ? {
        solar: solarAhead.length > 1 ? smoothPath(solarAhead) : undefined,
        solarArea:
          solarAhead.length > 1
            ? `${smoothPath(solarAhead)} L${solarAhead.at(-1)![0].toFixed(1)},${box.height} L${nowAt.toFixed(1)},${box.height} Z`
            : undefined,
        house: houseAhead.length > 1 ? smoothPath(houseAhead) : undefined
      }
    : undefined;

  return {
    ahead,
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
    best: bestLine,
    curve: curvePaths(extras.curve ?? [], x, y, domain)
  };
}

export { DEFAULT_BOX as CHART_BOX };
