import { describe, expect, it } from "vitest";
import { hourlyShares, worthDrawing } from "../src/hours";
import type { StatisticPoint } from "../src/types";

const NOW = new Date();
NOW.setHours(6, 30, 0, 0);

const midnight = () => {
  const start = new Date(NOW);
  start.setHours(0, 0, 0, 0);
  return start.getTime();
};

/** One reading in the middle of the given hour. */
const at = (hour: number, value: number): StatisticPoint => ({
  start: midnight() + hour * 3600_000 + 1800_000,
  mean: value,
  max: value
});

describe("hourlyShares", () => {
  it("covers midnight up to the current hour and no further", () => {
    const hours = hourlyShares([at(0, 500)], [], [], 1000, NOW);
    expect(hours).toHaveLength(7);
    expect(hours.at(-1)!.hour).toBe(6);
  });

  it("takes the grid first, then the battery, and leaves the rest to the sun", () => {
    const hours = hourlyShares([at(3, 3000)], [at(3, 1000)], [at(3, 500)], 1000, NOW);
    const third = hours[3];
    expect(third.grid).toBeCloseTo(1, 3);
    expect(third.battery).toBeCloseTo(0.5, 3);
    expect(third.solar).toBeCloseTo(1.5, 3);
    expect(third.dominant).toBe("solar");
  });

  it("never lets a source exceed the house load", () => {
    // An export hour: the grid reading is negative and must not become a source.
    const hours = hourlyShares([at(2, 800)], [at(2, -4000)], [at(2, 2000)], 1000, NOW);
    const second = hours[2];
    expect(second.grid).toBe(0);
    expect(second.battery).toBeCloseTo(0.8, 3);
    expect(second.solar).toBe(0);
    expect(second.battery + second.grid + second.solar).toBeCloseTo(second.total, 6);
  });

  it("leaves an hour without data empty rather than inventing a source", () => {
    const hours = hourlyShares([at(1, 900)], [], [], 1000, NOW);
    expect(hours[0].total).toBe(0);
    expect(hours[0].dominant).toBeUndefined();
    expect(hours[1].dominant).toBe("solar");
  });

  it("ignores readings that are not finite", () => {
    const broken: StatisticPoint = { start: midnight() + 3600_000 + 60_000, mean: NaN, max: NaN };
    const hours = hourlyShares([broken, at(1, 1000)], [], [], 1000, NOW);
    expect(hours[1].total).toBeCloseTo(1, 3);
  });

  it("reads kW sensors without a divisor", () => {
    const hours = hourlyShares([at(4, 2.4)], [at(4, 0.4)], [], 1, NOW);
    expect(hours[4].total).toBeCloseTo(2.4, 3);
    expect(hours[4].grid).toBeCloseTo(0.4, 3);
  });
});

describe("worthDrawing", () => {
  it("waits for a second described hour", () => {
    expect(worthDrawing(hourlyShares([at(0, 500)], [], [], 1000, NOW))).toBe(false);
    expect(worthDrawing(hourlyShares([at(0, 500), at(1, 500)], [], [], 1000, NOW))).toBe(true);
  });
});
