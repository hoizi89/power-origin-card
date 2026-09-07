import { describe, expect, it } from "vitest";
import {
  computeFlow,
  productionSegments,
  ringSegments,
  surplusSegments,
  worthNaming
} from "../src/flow";

describe("computeFlow", () => {
  it("covers the house from the sun and sends the rest to the grid", () => {
    const flow = computeFlow({ house: 2.72, solar: 5.14, battery: -0.02 });
    expect(flow.fromSolar).toBeCloseTo(2.72, 3);
    expect(flow.fromBattery).toBe(0);
    expect(flow.fromGrid).toBe(0);
    expect(flow.toBattery).toBeCloseTo(0.02, 3);
    expect(flow.toGrid).toBeCloseTo(2.4, 2);
    expect(flow.autarky).toBe(1);
  });

  it("runs the house off the battery at night", () => {
    const flow = computeFlow({ house: 0.377, solar: 0, battery: 0.377 });
    expect(flow.fromBattery).toBeCloseTo(0.377, 3);
    expect(flow.fromGrid).toBe(0);
    expect(flow.autarky).toBe(1);
  });

  it("splits a foggy morning across all three sources", () => {
    const flow = computeFlow({ house: 3.1, solar: 0.38, battery: 0.8 });
    expect(flow.fromSolar).toBeCloseTo(0.38, 3);
    expect(flow.fromBattery).toBeCloseTo(0.8, 3);
    expect(flow.fromGrid).toBeCloseTo(1.92, 3);
    expect(flow.autarky).toBeCloseTo(0.38, 2);
  });

  it("never lets the parts exceed the house", () => {
    const flow = computeFlow({ house: 1, solar: 5, battery: 5, grid: 5 });
    expect(flow.fromSolar + flow.fromBattery + flow.fromGrid).toBeLessThanOrEqual(1.001);
  });

  it("treats a missing battery reading as zero", () => {
    const flow = computeFlow({ house: 2, solar: 1 });
    expect(flow.fromGrid).toBeCloseTo(1, 3);
  });
});

describe("ringSegments", () => {
  it("fills the whole ring with one source", () => {
    const parts = ringSegments(computeFlow({ house: 2, solar: 4 }));
    expect(parts).toHaveLength(1);
    expect(parts[0].key).toBe("solar");
    expect(parts[0].length).toBeCloseTo(100, 3);
  });

  it("leaves a gap between neighbours and stays inside the ring", () => {
    const parts = ringSegments(computeFlow({ house: 3.1, solar: 0.38, battery: 0.8 }));
    expect(parts.map((part) => part.key)).toEqual(["solar", "battery", "grid"]);
    const last = parts.at(-1)!;
    expect(last.offset + last.length).toBeLessThanOrEqual(100);
  });

  it("drops sources that deliver nothing", () => {
    const parts = ringSegments(computeFlow({ house: 1, solar: 0, battery: 1 }));
    expect(parts.map((part) => part.key)).toEqual(["battery"]);
  });
});

describe("productionSegments", () => {
  it("shows the house as a sliver on a bright day", () => {
    const flow = computeFlow({ house: 0.74, solar: 9.46, battery: 0, grid: -8.72 });
    const parts = productionSegments(flow);
    const house = parts.find((part) => part.key === "house")!;
    const grid = parts.find((part) => part.key === "grid")!;
    expect(house.power).toBeCloseTo(0.74, 2);
    expect(grid.power).toBeCloseTo(8.72, 2);
    expect(house.length).toBeLessThan(grid.length / 5);
  });

  it("counts charging as a destination, not a source", () => {
    const flow = computeFlow({ house: 1, solar: 5, battery: -3, grid: -1 });
    const parts = productionSegments(flow);
    expect(parts.find((part) => part.key === "battery")?.power).toBeCloseTo(3, 2);
  });

  it("stays empty at night", () => {
    expect(productionSegments(computeFlow({ house: 1, solar: 0, battery: 1 }))).toHaveLength(0);
  });
});

describe("surplusSegments", () => {
  it("leaves most of the ring free when little is being used", () => {
    const flow = computeFlow({ house: 0.72, solar: 8.1, battery: -0.04, grid: -7.34 });
    const parts = surplusSegments(flow);
    const free = parts.find((part) => part.key === "free")!;
    expect(free.power).toBeCloseTo(7.34, 2);
    expect(free.length).toBeGreaterThan(85);
  });

  it("puts the free part last so the open arc sits at the end", () => {
    const parts = surplusSegments(
      computeFlow({ house: 1, solar: 5, battery: -1, grid: -3 })
    );
    expect(parts.at(-1)?.key).toBe("free");
  });

  it("has nothing free while the grid is feeding the house", () => {
    const flow = computeFlow({ house: 3.1, solar: 0.38, battery: 0.8, grid: 1.92 });
    expect(surplusSegments(flow).some((part) => part.key === "free")).toBe(false);
    expect(flow.toGrid).toBe(0);
  });
});

describe("worthNaming", () => {
  it("drops a trickle beside a battery carrying the house", () => {
    // 30 W of grid against 600 W from the store: neither large nor a share.
    expect(worthNaming(0.03, 0.63)).toBe(false);
  });

  it("keeps a small flow that is still a real share", () => {
    // 110 W of 650 W is a sixth of the house — that is worth a line.
    expect(worthNaming(0.11, 0.65)).toBe(true);
  });

  it("keeps a large flow however small its share", () => {
    expect(worthNaming(0.4, 40)).toBe(true);
  });

  it("drops nothing and negatives", () => {
    expect(worthNaming(0, 5)).toBe(false);
    expect(worthNaming(-1, 5)).toBe(false);
    expect(worthNaming(Number.NaN, 5)).toBe(false);
  });

  it("names anything when there is no total to compare with", () => {
    expect(worthNaming(0.01, 0)).toBe(true);
  });
});
