import { describe, expect, it } from "vitest";
import { METER_STEPS, meterGeometry, type MeterKey } from "../src/meter";

const flow = (toBattery: number, toGrid: number, fromGrid: number) => ({
  toBattery,
  toGrid,
  fromGrid
});

const lit = (geometry: ReturnType<typeof meterGeometry>, direction: "up" | "down") =>
  geometry.segments.filter(
    (segment) => segment.direction === direction && segment.fills.length > 0
  ).length;

const keys = (geometry: ReturnType<typeof meterGeometry>): MeterKey[] => [
  ...new Set(geometry.segments.flatMap((segment) => segment.fills.map((fill) => fill.key)))
];

describe("meterGeometry", () => {
  it("climbs for export and stays flat below", () => {
    const geometry = meterGeometry(flow(0, 8, 0), 8);
    expect(lit(geometry, "up")).toBe(METER_STEPS);
    expect(lit(geometry, "down")).toBe(0);
  });

  it("sinks for grid draw and stays flat above", () => {
    const geometry = meterGeometry(flow(0, 0, 4), 8);
    expect(lit(geometry, "up")).toBe(0);
    expect(lit(geometry, "down")).toBe(METER_STEPS / 2);
  });

  it("counts charging as spare, because it is displaceable", () => {
    const geometry = meterGeometry(flow(4, 0, 0), 8);
    expect(geometry.surplus).toBe(4);
    expect(lit(geometry, "up")).toBe(METER_STEPS / 2);
    expect(keys(geometry)).toEqual(["battery"]);
  });

  it("stacks the battery under the export", () => {
    const geometry = meterGeometry(flow(2, 6, 0), 8);
    expect(geometry.surplus).toBe(8);

    const up = geometry.segments.filter((segment) => segment.direction === "up");
    // Blocks are ordered from the middle outwards, so the first ones are battery.
    expect(up[0].fills[0].key).toBe("battery");
    expect(up[METER_STEPS - 1].fills.at(-1)?.key).toBe("grid");
  });

  it("splits a block that straddles the boundary", () => {
    const geometry = meterGeometry(flow(1.5, 6.5, 0), 6);
    const straddling = geometry.segments.find(
      (segment) => segment.direction === "up" && segment.fills.length === 2
    );
    expect(straddling).toBeTruthy();
    const total = straddling!.fills.reduce((sum, fill) => sum + fill.size, 0);
    expect(total).toBeCloseTo(1, 6);
    expect(straddling!.fills[1].offset).toBeCloseTo(straddling!.fills[0].size, 6);
  });

  it("is empty when nothing crosses the meter", () => {
    const geometry = meterGeometry(flow(0, 0, 0), 8);
    expect(geometry.segments.every((segment) => segment.fills.length === 0)).toBe(true);
  });

  it("lights the block nearest the middle first", () => {
    const geometry = meterGeometry(flow(0, 1, 0), 8);
    const up = geometry.segments.filter((segment) => segment.direction === "up");
    expect(up[0].fills.length).toBeGreaterThan(0);
    expect(up[METER_STEPS - 1].fills.length).toBe(0);
    // Nearest the middle means lowest on the way up.
    expect(up[0].y).toBeGreaterThan(up[1].y);
  });

  it("clamps rather than overflowing, and says that it clamped", () => {
    const geometry = meterGeometry(flow(0, 30, 0), 8);
    for (const segment of geometry.segments) {
      const total = segment.fills.reduce((sum, fill) => sum + fill.size, 0);
      expect(total).toBeLessThanOrEqual(1.001);
    }
    expect(geometry.overUp).toBe(true);
  });

  it("rounds a derived scale up to a whole kilowatt", () => {
    expect(meterGeometry(flow(0, 2, 0), 0, 9.9).scale).toBe(10);
  });

  it("keeps the same scale on a dull day as on a bright one", () => {
    const bright = meterGeometry(flow(0, 9, 0), 0, 13.4);
    const dull = meterGeometry(flow(0, 0.9, 0), 0, 13.4);
    expect(dull.scale).toBe(bright.scale);
    expect(lit(dull, "up")).toBeLessThanOrEqual(1);
  });

  it("never divides by zero on a dead system", () => {
    const geometry = meterGeometry(flow(0, 0, 0), 0, 0);
    expect(geometry.scale).toBe(1);
    expect(
      geometry.segments.every((segment) =>
        segment.fills.every((fill) => Number.isFinite(fill.size))
      )
    ).toBe(true);
  });

  it("keeps every block inside the column", () => {
    const cases = [flow(0, 0, 0), flow(2, 3, 0), flow(0, 0, 5), flow(50, 50, 99)];
    for (const input of cases) {
      for (const segment of meterGeometry(input, 8).segments) {
        expect(segment.y).toBeGreaterThanOrEqual(0);
        expect(segment.y + segment.height).toBeLessThanOrEqual(200);
        for (const fill of segment.fills) {
          expect(fill.offset).toBeGreaterThanOrEqual(0);
          expect(fill.offset + fill.size).toBeLessThanOrEqual(1.001);
        }
      }
    }
  });
});

describe("the threshold", () => {
  it("is absent until one is configured", () => {
    const geometry = meterGeometry(flow(0, 3, 0), 8);
    expect(geometry.targetY).toBeUndefined();
    expect(geometry.belowTarget).toBe(false);
  });

  it("holds the column back below the threshold and releases it above", () => {
    expect(meterGeometry(flow(0, 1.2, 0), 8, 0, 2).belowTarget).toBe(true);
    expect(meterGeometry(flow(0, 2.4, 0), 8, 0, 2).belowTarget).toBe(false);
  });

  it("counts charging towards the threshold", () => {
    // 1.5 into the battery and 0.8 to the grid is 2.3 spare, so the dishwasher
    // is worth starting even though little is leaving the house.
    expect(meterGeometry(flow(1.5, 0.8, 0), 8, 0, 2).belowTarget).toBe(false);
  });

  it("puts the line where the value sits on the scale", () => {
    const half = meterGeometry(flow(0, 0, 0), 8, 0, 4).targetY!;
    const full = meterGeometry(flow(0, 0, 0), 8, 0, 8).targetY!;
    // Measured from the zero line, which sits a little above the middle.
    const zero = 100 - 3;
    expect(zero - half).toBeCloseTo((zero - full) / 2, 6);
  });

  it("draws no line for a threshold beyond full deflection", () => {
    expect(meterGeometry(flow(0, 0, 0), 8, 0, 20).targetY).toBeUndefined();
  });
});
