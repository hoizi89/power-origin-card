import { describe, expect, it } from "vitest";
import { chartGeometry, niceTick } from "../src/chart";

const NOW = Date.now();
const STAMPS = [NOW - 3600_000, NOW - 1800_000, NOW];
const DOMAIN = { start: STAMPS[0], end: STAMPS[2] };

describe("niceTick", () => {
  it("stays comfortably under the tallest thing drawn", () => {
    expect(niceTick(10)).toBe(8);
    expect(niceTick(3.4)).toBe(3);
  });

  it("gives none when nothing is tall enough to measure", () => {
    expect(niceTick(0.4)).toBeUndefined();
  });
});

describe("comparing with an earlier day", () => {
  it("draws nothing extra when no earlier day is given", () => {
    const geometry = chartGeometry(STAMPS, [1, 2, 3], [1, 1, 1], DOMAIN);
    expect(geometry.earlier).toBeUndefined();
  });

  it("puts both days on one scale, or they cannot be compared", () => {
    const alone = chartGeometry(STAMPS, [1, 2, 3], [1, 1, 1], DOMAIN);
    const paired = chartGeometry(STAMPS, [1, 2, 3], [1, 1, 1], DOMAIN, undefined, [1, 5, 9]);

    expect(paired.earlier).toBeTruthy();
    // A taller earlier day lifts the scale for both, so the round gridline moves.
    expect(paired.tick?.value).toBeGreaterThan(alone.tick?.value ?? 0);
  });

  it("ignores a single point, which has no shape", () => {
    const geometry = chartGeometry(STAMPS, [1, 2, 3], [1, 1, 1], DOMAIN, undefined, [4]);
    expect(geometry.earlier).toBeUndefined();
  });
});
