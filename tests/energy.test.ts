import { describe, expect, it } from "vitest";
import { mergePick, pickFromEnergy } from "../src/energy";
import type { PowerOriginCardConfig } from "../src/types";

/** Shaped after a real Energy dashboard: solar, battery, water and grid. */
const PREFS = {
  energy_sources: [
    { type: "solar", stat_energy_from: "sensor.total_pv_generation", stat_rate: "sensor.pv_power" },
    {
      type: "battery",
      stat_energy_from: "sensor.total_battery_discharge",
      stat_energy_to: "sensor.total_battery_charge",
      power_config: { stat_rate: "sensor.battery_power" },
      stat_soc: "sensor.battery_state_of_charge",
      capacity: 13.2
    },
    { type: "water", stat_energy_from: "sensor.wasser_total" },
    {
      type: "grid",
      stat_energy_from: "sensor.meter_import",
      stat_energy_to: "sensor.meter_export",
      entity_energy_price: "sensor.price_buy",
      entity_energy_price_export: "sensor.price_sell",
      power_config: { stat_rate_from: "sensor.grid_in", stat_rate_to: "sensor.grid_out" },
      stat_rate: "sensor.grid_net_power"
    }
  ]
};

describe("pickFromEnergy", () => {
  it("takes the live sensors, the charge, the capacity and both prices", () => {
    const pick = pickFromEnergy(PREFS);
    expect(pick.entities).toEqual({
      solar: "sensor.pv_power",
      battery_power: "sensor.battery_power",
      battery_soc: "sensor.battery_state_of_charge",
      grid_power: "sensor.grid_net_power",
      price_import: "sensor.price_buy",
      price_export: "sensor.price_sell"
    });
    expect(pick.battery_capacity).toBe(13200);
  });

  it("leaves the daily counters alone", () => {
    // The dashboard's energy figures are lifetime totals; this card wants
    // today's. Reading one as the other would be wrong by years.
    const pick = pickFromEnergy(PREFS);
    expect(pick.entities).not.toHaveProperty("solar_today");
    expect(pick.entities).not.toHaveProperty("import_today");
    expect(pick.entities).not.toHaveProperty("house");
  });

  it("skips a grid source that has no single signed sensor", () => {
    const pick = pickFromEnergy({
      energy_sources: [
        {
          type: "grid",
          power_config: { stat_rate_from: "sensor.in", stat_rate_to: "sensor.out" }
        }
      ]
    });
    // Two one-way sensors cannot say which direction the power is going.
    expect(pick.entities.grid_power).toBeUndefined();
  });

  it("copes with nothing configured", () => {
    expect(pickFromEnergy(undefined).entities).toEqual({});
    expect(pickFromEnergy({}).entities).toEqual({});
  });
});

describe("mergePick", () => {
  it("fills the empty fields and reports which", () => {
    const start: PowerOriginCardConfig = {
      type: "custom:power-origin-card",
      entities: { house: "sensor.house" }
    };
    const { merged, filled } = mergePick(start, pickFromEnergy(PREFS));
    expect(merged.entities.house).toBe("sensor.house");
    expect(merged.entities.solar).toBe("sensor.pv_power");
    expect(merged.battery_capacity).toBe(13200);
    expect(filled).toContain("solar");
    expect(filled).toContain("battery_capacity");
  });

  it("never overwrites a choice someone made", () => {
    const start: PowerOriginCardConfig = {
      type: "custom:power-origin-card",
      entities: { house: "sensor.h", solar: "sensor.my_own_pv" },
      battery_capacity: 9000
    };
    const { merged, filled } = mergePick(start, pickFromEnergy(PREFS));
    expect(merged.entities.solar).toBe("sensor.my_own_pv");
    expect(merged.battery_capacity).toBe(9000);
    expect(filled).not.toContain("solar");
    expect(filled).not.toContain("battery_capacity");
  });

  it("reports nothing filled when there was nothing to add", () => {
    const { filled } = mergePick(
      { type: "custom:power-origin-card", entities: {} } as PowerOriginCardConfig,
      { entities: {} }
    );
    expect(filled).toEqual([]);
  });
});

describe("the devices the dashboard lists", () => {
  const withDevices = {
    ...PREFS,
    device_consumption: [
      { stat_consumption: "sensor.wp_e", stat_rate: "sensor.wp_p", name: "Lambda WP" },
      { stat_consumption: "sensor.dish_e", stat_rate: "sensor.geschirrspuler_power" },
      { stat_consumption: "sensor.meter_only" }
    ]
  };

  it("takes every device with a live sensor, named as the dashboard names it", () => {
    const pick = pickFromEnergy(withDevices);
    expect(pick.devices).toEqual([
      { id: "sensor.wp_p", name: "Lambda WP", energy: "sensor.wp_e" },
      { id: "sensor.geschirrspuler_power", name: "geschirrspuler", energy: "sensor.dish_e" }
    ]);
  });

  it("fills the device list only while it is empty", () => {
    const empty: PowerOriginCardConfig = { type: "custom:power-origin-card", entities: { house: "sensor.h" } };
    const filled = mergePick(empty, pickFromEnergy(withDevices));
    expect(filled.filled).toContain("devices");
    expect(filled.merged.devices?.list).toEqual(["sensor.wp_p", "sensor.geschirrspuler_power"]);
    expect(filled.merged.devices?.names?.["sensor.wp_p"]).toBe("Lambda WP");
    expect(filled.merged.devices?.energy?.["sensor.wp_p"]).toBe("sensor.wp_e");

    const mine: PowerOriginCardConfig = { ...empty, devices: { list: ["sensor.mine"] } };
    const kept = mergePick(mine, pickFromEnergy(withDevices));
    expect(kept.filled).not.toContain("devices");
    expect(kept.merged.devices?.list).toEqual(["sensor.mine"]);
  });
});
