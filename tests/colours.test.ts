import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync(new URL("../src/styles.ts", import.meta.url), "utf8");

/** The colour token a selector paints with, or undefined when it paints none. */
function tokenFor(selector: string): string | undefined {
  // Selectors are grouped, so a rule may continue past a comma.
  const at = [styles.indexOf(selector + " {"), styles.indexOf(selector + ",")]
    .filter((index) => index >= 0)
    .sort((x, y) => x - y)[0];
  if (at === undefined) throw new Error("no rule for " + selector);
  const block = styles.slice(at, styles.indexOf("}", at));
  return block.match(/var\((--sst-[a-z]+)/)?.[1];
}

/**
 * The card's one colour rule: the colour names the participant that is not the
 * house, and the same kilowatts wear it wherever they appear. Direction is
 * carried by position and by the word, never by a second hue — which is the
 * fault the old outer production ring was thrown out for.
 */
describe("one participant, one colour", () => {
  it("paints everything that involves the grid in the grid colour", () => {
    for (const selector of [
      ".seg.grid", // the ring: power coming from the grid, and going to it
      ".seg.free", // the surplus ring: the spare part, which leaves for the grid
      ".meter-on.grid", // the column: export, stepped
      ".meter-band.grid", // the column: export, continuous
      ".meter-on.import", // the column: import, stepped
      ".meter-band.import", // the column: import, continuous
      ".day-band.grid", // the day strip
      ".clock-hour.grid" // the clock face
    ]) {
      expect(tokenFor(selector), selector).toBe("--sst-grid");
    }
  });

  it("paints everything that involves the battery in the battery colour", () => {
    for (const selector of [
      ".seg.battery",
      ".meter-on.battery",
      ".meter-on.discharge",
      ".meter-band.battery",
      ".day-band.battery",
      ".clock-hour.battery"
    ]) {
      expect(tokenFor(selector), selector).toBe("--sst-leaf");
    }
  });

  it("paints everything that involves the roof in the sun colour", () => {
    for (const selector of [
      ".seg.solar",
      ".seg.house", // the roof's own power, kept at home: the same sun, held back
      ".day-band.solar",
      ".clock-hour.solar",
      ".bal-roof"
    ]) {
      expect(tokenFor(selector), selector).toBe("--sst-sun");
    }
  });
});
