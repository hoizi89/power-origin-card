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
  forecast_tomorrow: "sensor.forecast_tomorrow",
  forecast_hourly: "sensor.forecast_hourly",
  cost_today: "sensor.cost_today",
  cost_export_today: "sensor.cost_export_today",
  cost_import_today: "sensor.cost_import_today",
  battery_out_today: "sensor.battery_out_today",
  battery_in_today: "sensor.battery_in_today",
  price_import: "sensor.price_import"
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

/* What the recorder averaged for the devices lately; the kettle's live reading
   is far above its mean, which is what the window is for. */
const DEVICE_WATTS: Record<string, number> = {
  "sensor.desk_power": 167,
  "sensor.nas_power": 20,
  "sensor.fridge_power": 0,
  "sensor.oven_power": 1800,
  "sensor.kettle_power": 40
};
const DEVICE_KWH: Record<string, number> = {
  "sensor.desk_energy": 1.4,
  "sensor.nas_energy": 0.5,
  "sensor.oven_energy": 2.2
};

/** The day's forecast by hour, the way Solcast attaches it: a bell over the daylight. */
function hourlyRows(dayOffset: number, peakKw: number) {
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  midnight.setDate(midnight.getDate() + dayOffset);
  return Array.from({ length: 24 }, (_, hour) => ({
    period_start: new Date(midnight.getTime() + hour * 3600000).toISOString(),
    pv_estimate: Number((peakKw * Math.max(0, Math.sin(((hour - 6.5) / 13) * Math.PI))).toFixed(3))
  }));
}

function statistics(scenario: Scenario, ids: string[], period?: string, startTime?: string) {
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const now = Date.now();
  const out: Record<string, Array<Record<string, unknown>>> = {};
  const known = new Set([...Object.values(IDS), ...Object.keys(DEVICE_WATTS), ...Object.keys(DEVICE_KWH)]);

  // Days: one row per day from the requested start, with what each meter
  // grew and what the roof averaged; the days differ so a week has a shape.
  if (period === "day") {
    const first = new Date(Date.parse(startTime ?? midnight.toISOString()));
    first.setHours(0, 0, 0, 0);
    for (const id of ids) {
      if (!known.has(id)) continue;
      const rows: Array<Record<string, unknown>> = [];
      for (let day = first.getTime(), index = 0; day <= now; index += 1) {
        const at = new Date(day);
        const factor = 0.55 + 0.45 * Math.abs(Math.sin(index * 1.3));
        rows.push({
          start: at.toISOString(),
          mean: id === IDS.solar ? scenario.pv * factor : scenario.house,
          change:
            id === IDS.solar_today
              ? scenario.solarToday * factor
              : id === IDS.house_today
                ? scenario.houseToday
                : id === IDS.import_today
                  ? scenario.importToday * (1.5 - factor)
                  : id in DEVICE_KWH
                    ? DEVICE_KWH[id]
                    : null
        });
        at.setDate(at.getDate() + 1);
        day = at.getTime();
      }
      out[id] = rows;
    }
    return out;
  }

  // Months: what each money and energy meter grew per month, and the roof's peak.
  if (period === "month") {
    const first = new Date(Date.parse(startTime ?? midnight.toISOString()));
    first.setDate(1);
    first.setHours(0, 0, 0, 0);
    for (const id of ids) {
      if (!known.has(id)) continue;
      const rows: Array<Record<string, unknown>> = [];
      for (let index = 0; index < 12; index += 1) {
        const at = new Date(first);
        at.setMonth(first.getMonth() + index);
        if (at.getTime() > now) break;
        rows.push({
          start: at.toISOString(),
          max: id === IDS.solar ? scenario.pv * 1.1 : scenario.house,
          change:
            id === IDS.cost_today
              ? scenario.cost * 20
              : id === IDS.cost_export_today
                ? 1.2 * 20
                : id === IDS.cost_import_today
                  ? 0.02 * 20
                  : id === IDS.export_today
                    ? scenario.exportToday * 20
                    : id === IDS.import_today
                      ? scenario.importToday * 20
                      : null
        });
      }
      out[id] = rows;
    }
    return out;
  }

  // Hours of one day, for the best day's outline.
  if (period === "hour" && startTime) {
    const first = new Date(Date.parse(startTime));
    for (const id of ids) {
      if (!known.has(id)) continue;
      out[id] = Array.from({ length: 24 }, (_, hour) => ({
        start: new Date(first.getTime() + hour * 3600000).toISOString(),
        mean: id === IDS.solar ? scenario.pv * Math.max(0, Math.sin(((hour - 6.5) / 13) * Math.PI)) : scenario.house
      }));
    }
    return out;
  }

  const count = Math.floor((now - midnight.getTime()) / (5 * 60 * 1000)) + 1;
  for (const id of ids) {
    if (!known.has(id)) continue;
    const rows: Array<Record<string, unknown>> = [];
    for (let t = midnight.getTime(); t <= now; t += 5 * 60 * 1000) {
      const value =
        id === IDS.solar
          ? scenario.pv
          : id === IDS.grid_power
            ? scenario.grid
            : id === IDS.battery_power
              ? scenario.battery
              : id === IDS.battery_soc
                ? Math.min(100, Math.max(0, scenario.soc + 8 * Math.sin(t / 3600000)))
                : id === IDS.price_import
                  ? 0.29
                  : id in DEVICE_WATTS
                  ? DEVICE_WATTS[id]
                  : scenario.house;
      rows.push({
        start: t,
        mean: value,
        max: value * 1.1,
        change: id in DEVICE_KWH ? DEVICE_KWH[id] / count : null
      });
    }
    out[id] = rows;
  }
  return out;
}

export function makeHass(scenario: Scenario): HomeAssistant {
  const v = (value: number) => (scenario.unavailable ? "unavailable" : value);

  const states: Record<string, HassEntity> = {
    // The sun is where the scenario puts it: producing means day.
    "sun.sun": { ...sunEntity(), state: scenario.pv > 0 ? "above_horizon" : "below_horizon" },
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
    [IDS.forecast_tomorrow]: {
      ...entity(IDS.forecast_tomorrow, 24.7, "kWh", "energy"),
      attributes: { unit_of_measurement: "kWh", device_class: "energy", detailedHourly: hourlyRows(1, 6.4) }
    },
    [IDS.forecast_hourly]: {
      ...entity(IDS.forecast_hourly, scenario.forecast + scenario.solarToday, "kWh", "energy"),
      attributes: { unit_of_measurement: "kWh", device_class: "energy", detailedHourly: hourlyRows(0, 7.1) }
    },
    [IDS.cost_today]: entity(IDS.cost_today, v(scenario.cost), "€", "monetary"),
    [IDS.cost_export_today]: entity(IDS.cost_export_today, v(1.2), "€", "monetary"),
    [IDS.cost_import_today]: entity(IDS.cost_import_today, v(0.02), "€", "monetary"),
    [IDS.battery_out_today]: entity(IDS.battery_out_today, v(4.1), "kWh", "energy"),
    [IDS.battery_in_today]: entity(IDS.battery_in_today, v(7.9), "kWh", "energy"),
    "sensor.price_import": entity("sensor.price_import", v(0.29), "€/kWh", "monetary"),
    "sensor.price_export": entity("sensor.price_export", v(0.08), "€/kWh", "monetary"),
    // Three devices: one drawing, one small, one off. A fourth id is never
    // listed, so a card asking for it learns nothing.
    "sensor.desk_power": entity("sensor.desk_power", 167, "W", "power"),
    "sensor.nas_power": entity("sensor.nas_power", 20, "W", "power"),
    "sensor.fridge_power": entity("sensor.fridge_power", 0, "W", "power"),
    "sensor.oven_power": entity("sensor.oven_power", 1800, "W", "power"),
    "sensor.kettle_power": entity("sensor.kettle_power", 2000, "W", "power")
  };

  return {
    entities: {
      "sensor.desk_power": { area_id: "office" },
      "sensor.nas_power": { device_id: "nas-1" },
      "sensor.fridge_power": { area_id: "kitchen" }
    },
    devices: { "nas-1": { area_id: "cellar" } },
    areas: { office: { name: "Büro" }, cellar: { name: "Keller" }, kitchen: { name: "Küche" } },
    states,
    locale: { language: "de" },
    async callWS(message: Record<string, unknown>) {
      if (message.type !== "recorder/statistics_during_period") return {} as never;
      if (scenario.unavailable) return {} as never;
      return statistics(
        scenario,
        (message.statistic_ids as string[]) ?? [],
        message.period as string | undefined,
        message.start_time as string | undefined
      ) as never;
    },
    async callApi() {
      return {} as never;
    }
  };
}
