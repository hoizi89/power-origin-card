import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dir = new URL("../src/", import.meta.url);
const sources = readdirSync(dir)
  .filter((name) => name.endsWith(".ts") && name !== "localize.ts")
  .map((name) => readFileSync(new URL(name, dir), "utf8"))
  .join("\n");
const table = readFileSync(new URL("localize.ts", dir), "utf8");

/*
 * A string nobody asks for is not harmless: the two tables are kept in step by
 * hand, and every orphan is one more line to keep in step for nothing. Keys
 * built at runtime from a prefix are looked up by that prefix instead.
 */
const keys = [...table.matchAll(/^\s*"(editor\.[^"]+)":/gm)].map((m) => m[1]);
const prefixes = [...sources.matchAll(/[`"'](editor\.[a-z_]+?)\$\{/g)].map((m) => m[1]);

describe("the editor tables", () => {
  it("hold no string the editor never asks for", () => {
    const orphans = [...new Set(keys)].filter(
      (key) => !sources.includes(`"${key}"`) && !prefixes.some((p) => key.startsWith(p))
    );
    expect(orphans, "unused: " + orphans.join(", ")).toEqual([]);
  });
});
