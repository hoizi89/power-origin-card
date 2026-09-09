import { describe, expect, it } from "vitest";
import { byArea, iconFor, rankDevices, type DeviceReading } from "../src/devices";

const r = (id: string, name: string, watts: number | undefined, area?: string): DeviceReading => ({
  id, name, watts, icon: iconFor(name, id), area
});

describe("an icon read off the name", () => {
  it("knows the usual suspects in either language", () => {
    expect(iconFor("Lambda WP")).toBe("mdi:heat-pump-outline");
    expect(iconFor("Wärmepumpe")).toBe("mdi:heat-pump-outline");
    expect(iconFor("Geschirrspüler")).toBe("mdi:dishwasher");
    expect(iconFor("Kühlschränke Küche")).toBe("mdi:fridge-outline");
    expect(iconFor("Alle Lichter")).toBe("mdi:lightbulb-outline");
    expect(iconFor("NAS")).toBe("mdi:server");
    expect(iconFor("Büro Schreibtisch")).toBe("mdi:desktop-tower-monitor");
  });
  it("reads the entity id when the name says nothing", () => {
    expect(iconFor("Rosi", "sensor.rosi_power")).toBe("mdi:power-plug-outline");
    expect(iconFor("", "sensor.waschmaschine_power")).toBe("mdi:washing-machine");
  });
  it("knows a room when the sensor sums one, and keeps a fridge a fridge", () => {
    expect(iconFor("Wohnküche Gesamt power")).toBe("mdi:silverware-fork-knife");
    expect(iconFor("Kühlschrank Küche")).toBe("mdi:fridge-outline");
    expect(iconFor("Heizkörper Bad")).toBe("mdi:radiator");
    expect(iconFor("Lambda Verbrauch Gesamt")).toBe("mdi:heat-pump-outline");
    expect(iconFor("Garage")).toBe("mdi:garage");
  });

  it("does not mistake a heat pump for a pump", () => {
    expect(iconFor("Poolpumpe")).toBe("mdi:pump");
    expect(iconFor("Wärmepumpe Keller")).toBe("mdi:heat-pump-outline");
  });
});

describe("who gets a name", () => {
  const readings = [
    r("a", "Desk", 167), r("b", "NAS", 20), r("c", "Fridge", 0), r("d", "Ghost", undefined), r("e", "Oven", 1800)
  ];
  it("names the loud ones biggest first and folds the small ones", () => {
    const out = rankDevices(readings, 2500, { limit: 5, threshold: 25 });
    expect(out.named.map((x) => x.name)).toEqual(["Oven", "Desk"]);
    expect(out.small.map((x) => x.name)).toEqual(["Fridge", "NAS"]);
    expect(out.rest).toBe(2500 - 1800 - 167);
  });
  it("leaves out what cannot report rather than counting it as zero", () => {
    const out = rankDevices(readings, 2500, { limit: 5, threshold: 25 });
    expect([...out.named, ...out.small].some((x) => x.name === "Ghost")).toBe(false);
  });
  it("keeps to the limit and never owes a negative rest", () => {
    const out = rankDevices(readings, 1000, { limit: 1, threshold: 25 });
    expect(out.named.map((x) => x.name)).toEqual(["Oven"]);
    expect(out.rest).toBe(0);
  });
  it("has no rest to speak of without a house", () => {
    expect(rankDevices(readings, undefined, { limit: 5, threshold: 25 }).rest).toBeUndefined();
  });
});

describe("by room", () => {
  it("sums what stands together and keeps the homeless apart", () => {
    const rooms = byArea([r("a", "Desk", 167, "Büro"), r("b", "Lamp", 12, "Büro"), r("c", "NAS", 20), r("d", "Ghost", undefined, "Keller")], "ohne Raum");
    expect(rooms.map((x) => [x.name, x.watts])).toEqual([["Büro", 179], ["ohne Raum", 20]]);
  });
});
