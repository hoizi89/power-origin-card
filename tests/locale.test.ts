import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../src/localize.ts", import.meta.url), "utf8");

/** Every "key": "value" pair inside the named table. */
function table(name: string): Record<string, string> {
  const at = source.indexOf(`const ${name}: Table = {`);
  if (at < 0) throw new Error("no table " + name);
  const block = source.slice(at, source.indexOf("\n};", at));
  const out: Record<string, string> = {};
  for (const line of block.split("\n")) {
    const match = line.match(/^\s*"([^"]+)":\s*"(.*)",?\s*$/);
    if (match) out[match[1]] = match[2];
  }
  return out;
}

const en = table("en");
const de = table("de");

describe("the two tables", () => {
  it("carry the same keys", () => {
    expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort());
  });

  it("say something for every key", () => {
    for (const [key, text] of Object.entries(en)) expect(text, key).not.toBe("");
    for (const [key, text] of Object.entries(de)) expect(text, key).not.toBe("");
  });
});

/*
 * A patch that edits one table twice leaves German in the English half, and the
 * card then reads as English to nobody. Umlauts and a few words that exist in
 * neither language's other half catch it without a dictionary.
 */
const GERMAN = /[äöüßÄÖÜ]|\b(?:und|nicht|gegen|jetzt|heute|Haus|Dach|Netz|Speicher|Stunde|wenn|wird|oder)\b/;
const ENGLISH = /\b(?:the|and|what|from|with|today|house|roof|grid|battery|hour|when|which)\b/;

describe("neither table speaks the other's language", () => {
  it("keeps German out of the English one", () => {
    for (const [key, text] of Object.entries(en)) {
      expect(GERMAN.test(text), `${key}: ${text}`).toBe(false);
    }
  });

  it("keeps English out of the German one", () => {
    for (const [key, text] of Object.entries(de)) {
      expect(ENGLISH.test(text), `${key}: ${text}`).toBe(false);
    }
  });
});
