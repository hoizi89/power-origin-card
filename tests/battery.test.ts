import { describe, expect, it } from "vitest";
import { averageLoad, batteryView, segmentCount, segments } from "../src/battery";

const NOW = new Date("2026-09-07T21:15:00+02:00");

describe("batteryView", () => {
  it("estimates how long a full battery lasts from the averaged load", () => {
    const view = batteryView(
      { soc: 100, power: 1.18, capacity: 13100, averageLoad: 1.18, loadSpread: 0.1 },
      NOW
    );
    expect(view.mode).toBe("discharging");
    expect(view.availableKwh).toBeCloseTo(13.1, 2);
    expect(view.hours).toBeCloseTo(11.1, 1);
    expect(view.at!.getTime() - NOW.getTime()).toBeCloseTo(view.hours! * 3600 * 1000, -2);
  });

  it("keeps the reserve out of the usable energy", () => {
    const view = batteryView(
      { soc: 50, power: 1, capacity: 13100, reserve: 10, averageLoad: 1, loadSpread: 0 },
      NOW
    );
    expect(view.availableKwh).toBeCloseTo(5.24, 2);
  });

  it("gives no runtime once the reserve is all that is left", () => {
    const view = batteryView(
      { soc: 80, power: 0.6, capacity: 13100, reserve: 80, averageLoad: 0.6, loadSpread: 0 },
      NOW
    );
    expect(view.availableKwh).toBe(0);
    expect(view.hours).toBeUndefined();
    expect(view.at).toBeUndefined();
  });

  it("says nothing when the load is still jumping", () => {
    const view = batteryView(
      { soc: 80, power: 2, capacity: 13100, averageLoad: 2, loadSpread: 1.4 },
      NOW
    );
    expect(view.hours).toBeUndefined();
    expect(view.at).toBeUndefined();
  });

  it("counts up to full while charging", () => {
    const view = batteryView({ soc: 46, power: -2.2, capacity: 13100 }, NOW);
    expect(view.mode).toBe("charging");
    expect(view.hours).toBeCloseTo(3.22, 2);
  });

  it("calls a battery at rest full, not discharging", () => {
    expect(batteryView({ soc: 100, power: -0.02, capacity: 13100 }, NOW).mode).toBe("full");
  });

  it("gives no runtime for a full battery that is not delivering", () => {
    const view = batteryView(
      { soc: 99, power: -0.02, capacity: 13100, averageLoad: 0.84, loadSpread: 0.1 },
      NOW
    );
    expect(view.mode).toBe("full");
    expect(view.hours).toBeUndefined();
    expect(view.availableKwh).toBeCloseTo(12.97, 2);
  });

  it("gives no runtime while resting mid-charge either", () => {
    const view = batteryView(
      { soc: 60, power: 0, capacity: 13100, averageLoad: 1, loadSpread: 0 },
      NOW
    );
    expect(view.mode).toBe("idle");
    expect(view.hours).toBeUndefined();
  });

  it("calls trickle charging at the ceiling full, with no time to full", () => {
    const view = batteryView({ soc: 99, power: -0.06, capacity: 13100 }, NOW);
    expect(view.mode).toBe("full");
    expect(view.hours).toBeUndefined();
  });

  it("reports nothing useful without a charge level", () => {
    expect(batteryView({ power: 1 }, NOW).mode).toBe("unknown");
  });
});

describe("segments", () => {
  it("fills seven and a bit of ten at 71 percent", () => {
    const blocks = segments(71, 10);
    expect(blocks.filter((block) => block.fill === 1)).toHaveLength(7);
    expect(blocks[7].fill).toBeCloseTo(0.1, 5);
    expect(blocks[8].fill).toBe(0);
  });

  it("fills every block when full and none when empty", () => {
    expect(segments(100, 10).every((block) => block.fill === 1)).toBe(true);
    expect(segments(0, 10).every((block) => block.fill === 0)).toBe(true);
  });

  it("clamps values outside the scale", () => {
    expect(segments(140, 5).every((block) => block.fill === 1)).toBe(true);
    expect(segments(-20, 5).every((block) => block.fill === 0)).toBe(true);
  });
});

describe("averageLoad", () => {
  it("reports a steady window as narrow", () => {
    const { mean, spread } = averageLoad([1.0, 1.05, 0.98, 1.02]);
    expect(mean).toBeCloseTo(1.0125, 3);
    expect(spread).toBeLessThan(0.1);
  });

  it("reports a kettle as wide", () => {
    const { spread } = averageLoad([0.4, 0.4, 3.2, 0.4]);
    expect(spread).toBeGreaterThan(0.6);
  });

  it("survives an empty window", () => {
    expect(averageLoad([]).mean).toBeUndefined();
  });
});

describe("segmentCount", () => {
  it("draws one block per kilowatt-hour when left to itself", () => {
    expect(segmentCount(0, 13100)).toBe(13);
    expect(segmentCount(0, 9600)).toBe(10);
  });

  it("obeys a configured count", () => {
    expect(segmentCount(6, 13100)).toBe(6);
  });

  it("stays readable for very small and very large stores", () => {
    expect(segmentCount(0, 2000)).toBe(6);
    expect(segmentCount(0, 60000)).toBe(20);
  });

  it("falls back to ten without a capacity", () => {
    expect(segmentCount(0, 0)).toBe(10);
  });
});
