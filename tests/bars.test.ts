import { describe, expect, it } from "vitest";
import { chartBars } from "../src/bars";
import { CHART_BOX } from "../src/chart";

const HOUR = 60 * 60 * 1000;
const START = new Date("2026-09-07T06:00:00Z").getTime();
const DOMAIN = { start: START, end: START + 12 * HOUR };

/** Five-minute samples across `hours`, each hour holding a constant value. */
function series(values: number[]) {
  const timestamps: number[] = [];
  const solar: number[] = [];
  values.forEach((value, hour) => {
    for (let minute = 0; minute < 60; minute += 5) {
      timestamps.push(START + hour * HOUR + minute * 60 * 1000);
      solar.push(value);
    }
  });
  return { timestamps, solar };
}

describe("chartBars", () => {
  it("draws one bar per hour that has samples", () => {
    const { timestamps, solar } = series([0, 1, 2, 3]);
    const geometry = chartBars(timestamps, solar, [], DOMAIN, CHART_BOX);
    expect(geometry.bars).toHaveLength(4);
  });

  it("scales the tallest hour to the top and the emptiest to the floor", () => {
    const { timestamps, solar } = series([0, 4]);
    const geometry = chartBars(timestamps, solar, [], DOMAIN, CHART_BOX);
    expect(geometry.bars[0].height).toBeCloseTo(0, 5);
    expect(geometry.bars[1].height).toBeCloseTo(CHART_BOX.height - CHART_BOX.padding, 5);
  });

  it("averages within the hour rather than taking the peak", () => {
    const timestamps = [START, START + 30 * 60 * 1000, START + HOUR];
    const solar = [0, 10, 5];
    const geometry = chartBars(timestamps, solar, [], DOMAIN, CHART_BOX);
    // First hour holds 0 and 10, so its mean of 5 equals the second hour's.
    expect(geometry.bars[0].height).toBeCloseTo(geometry.bars[1].height, 5);
  });

  it("keeps every bar inside the drawing area", () => {
    const { timestamps, solar } = series([1, 9, 3, 7, 0, 2]);
    for (const bar of chartBars(timestamps, solar, [], DOMAIN, CHART_BOX).bars) {
      expect(bar.x).toBeGreaterThanOrEqual(CHART_BOX.padding - 0.01);
      expect(bar.x + bar.width).toBeLessThanOrEqual(CHART_BOX.width - CHART_BOX.padding + 0.01);
      expect(bar.y).toBeGreaterThanOrEqual(0);
      expect(bar.y + bar.height).toBeLessThanOrEqual(CHART_BOX.height + 0.01);
    }
  });

  it("puts the consumption line on the same scale as the bars", () => {
    const { timestamps, solar } = series([4, 4]);
    const house = solar.map(() => 2);
    const geometry = chartBars(timestamps, solar, house, DOMAIN, CHART_BOX);
    expect(geometry.house.startsWith("M")).toBe(true);
    // Half the value must sit half way up the drawn area.
    const middle = CHART_BOX.height - (CHART_BOX.height - CHART_BOX.padding) / 2;
    expect(geometry.house).toContain(middle.toFixed(1));
  });

  it("returns nothing drawable for an empty day", () => {
    expect(chartBars([], [], [], DOMAIN, CHART_BOX).bars).toHaveLength(0);
    expect(chartBars([], [], [], DOMAIN, CHART_BOX).house).toBe("");
  });
});
