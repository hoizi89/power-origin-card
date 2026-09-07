import type { HassEntity, HomeAssistant } from "../src/types";

export const IDS = {
  house: "sensor.house",
  solar: "sensor.solar",
  battery_power: "sensor.battery_power",
  battery_soc: "sensor.battery_soc",
  grid_power: "sensor.grid",
  solar_today: "sensor.solar_today",
  house_today: "sensor.house_today",
  export_today: "sensor.export_today",
  import_today: "sensor.import_today",
  forecast: "sensor.forecast",
  cost_today: "sensor.cost_today",
  cost_export_today: "sensor.cost_export_today",
  cost_import_today: "sensor.cost_import_today"
};

export interface Scenario {
  name: string;
  house: number;
  pv: number;
  battery: number;
  grid: number;
  soc: number;
  solarToday: number;
  houseToday: number;
  exportToday: number;
  importToday: number;
  forecast: number;
  cost: number;
  unavailable?: boolean;
}

/** Every shape the real system takes, including the ones that break naive code. */
export const SCENARIOS: Scenario[] = [
  {
    name: "sunny afternoon",
    house: 800, pv: 8600, battery: -40, grid: -7760, soc: 99,
    solarToday: 50.3, houseToday: 14.3, exportToday: 29.4, importToday: 0.1,
    forecast: 15.5, cost: -2.03
  },
  {
    name: "evening on battery",
    house: 1180, pv: 0, battery: 1180, grid: 0, soc: 78,
    solarToday: 52.1, houseToday: 19.8, exportToday: 30.2, importToday: 0.1,
    forecast: 0, cost: -2.14
  },
  {
    name: "foggy morning, three sources",
    house: 3100, pv: 380, battery: 800, grid: 1920, soc: 46,
    solarToday: 0.6, houseToday: 4.1, exportToday: 0, importToday: 2.5,
    forecast: 3.2, cost: 0.74
  },
  {
    name: "charging",
    house: 900, pv: 6200, battery: -4400, grid: -900, soc: 52,
    solarToday: 18.4, houseToday: 5.2, exportToday: 3.1, importToday: 0.1,
    forecast: 34.8, cost: -0.31
  },
  {
    name: "reserve at night",
    house: 620, pv: 0, battery: 300, grid: 320, soc: 9,
    solarToday: 0, houseToday: 3.4, exportToday: 0, importToday: 1.8,
    forecast: 41.2, cost: 0.39
  },
  {
    name: "nothing produced, empty battery",
    house: 620, pv: 0, battery: 0, grid: 620, soc: 5,
    solarToday: 0, houseToday: 8.9, exportToday: 0, importToday: 6.2,
    forecast: 41.2, cost: 1.35
  },
  {
    name: "covered, ten watts spare",
    house: 1190, pv: 1200, battery: 0, grid: -10, soc: 100,
    solarToday: 9.4, houseToday: 7.1, exportToday: 1.2, importToday: 0.2,
    forecast: 2.1, cost: -0.11
  },
  {
    name: "little sun, battery helping",
    house: 3100, pv: 400, battery: 800, grid: 1900, soc: 34,
    solarToday: 6.2, houseToday: 12.4, exportToday: 0.3, importToday: 4.1,
    forecast: 0.4, cost: 0.82
  },
  {
    name: "everything at zero",
    house: 0, pv: 0, battery: 0, grid: 0, soc: 0,
    solarToday: 0, houseToday: 0, exportToday: 0, importToday: 0,
    forecast: 0, cost: 0
  },
  {
    name: "inverter offline",
    unavailable: true,
    house: 0, pv: 0, battery: 0, grid: 0, soc: 0,
    solarToday: 0, houseToday: 0, exportToday: 0, importToday: 0,
    forecast: 12.1, cost: 0
  }
];

const entity = (
  id: string,
  state: string | number,
  unit: string,
  deviceClass?: string
): HassEntity => ({
  entity_id: id,
  state: String(state),
  attributes: { unit_of_measurement: unit, device_class: deviceClass }
});

function sunEntity(): HassEntity {
  const rise = new Date();
  rise.setHours(6, 28, 0, 0);
  const set = new Date();
  set.setHours(19, 36, 0, 0);
  return {
    entity_id: "sun.sun",
    state: "above_horizon",
    attributes: {
      next_rising: new Date(rise.getTime() + 86400000).toISOString(),
      next_setting: set.toISOString()
    }
  };
}

function statistics(scenario: Scenario, ids: string[]) {
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const now = Date.now();
  const out: Record<string, Array<Record<string, unknown>>> = {};

  for (const id of ids) {
    const rows: Array<Record<string, unknown>> = [];
    for (let t = midnight.getTime(); t <= now; t += 5 * 60 * 1000) {
      const value = id === IDS.solar ? scenario.pv : scenario.house;
      rows.push({ start: t, mean: value, max: value * 1.1 });
    }
    out[id] = rows;
  }
  return out;
}

export function makeHass(scenario: Scenario): HomeAssistant {
  const v = (value: number) => (scenario.unavailable ? "unavailable" : value);

  const states: Record<string, HassEntity> = {
    "sun.sun": sunEntity(),
    [IDS.house]: entity(IDS.house, v(scenario.house), "W", "power"),
    [IDS.solar]: entity(IDS.solar, v(scenario.pv), "W", "power"),
    [IDS.battery_power]: entity(IDS.battery_power, v(scenario.battery), "W", "power"),
    [IDS.battery_soc]: entity(IDS.battery_soc, v(scenario.soc), "%", "battery"),
    [IDS.grid_power]: entity(IDS.grid_power, v(scenario.grid), "W", "power"),
    [IDS.solar_today]: entity(IDS.solar_today, v(scenario.solarToday), "kWh", "energy"),
    [IDS.house_today]: entity(IDS.house_today, v(scenario.houseToday), "kWh", "energy"),
    [IDS.export_today]: entity(IDS.export_today, v(scenario.exportToday), "kWh", "energy"),
    [IDS.import_today]: entity(IDS.import_today, v(scenario.importToday), "kWh", "energy"),
    [IDS.forecast]: entity(IDS.forecast, scenario.forecast, "kWh", "energy"),
    [IDS.cost_today]: entity(IDS.cost_today, v(scenario.cost), "€", "monetary"),
    [IDS.cost_export_today]: entity(IDS.cost_export_today, v(1.2), "€", "monetary"),
    [IDS.cost_import_today]: entity(IDS.cost_import_today, v(0.02), "€", "monetary")
  };

  return {
    states,
    locale: { language: "de" },
    async callWS(message: Record<string, unknown>) {
      if (message.type !== "recorder/statistics_during_period") return {} as never;
      if (scenario.unavailable) return {} as never;
      return statistics(scenario, (message.statistic_ids as string[]) ?? []) as never;
    },
    async callApi() {
      return {} as never;
    }
  };
}
