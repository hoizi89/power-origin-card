import type { DevicesOptions, PowerOriginEntities } from "./types";

interface EnergySource {
  type?: string;
  stat_rate?: string;
  stat_soc?: string;
  capacity?: number;
  entity_energy_price?: string | null;
  entity_energy_price_export?: string | null;
  power_config?: { stat_rate?: string; stat_rate_from?: string; stat_rate_to?: string };
}

interface EnergyDevice {
  stat_consumption?: string;
  stat_rate?: string;
  name?: string;
}

export interface EnergyPrefs {
  energy_sources?: EnergySource[];
  device_consumption?: EnergyDevice[];
}

export interface EnergyPick {
  entities: Partial<PowerOriginEntities>;
  /** Usable capacity in Wh, when the dashboard knows it. */
  battery_capacity?: number;
  /** The devices with a live power sensor, as the dashboard names them. */
  devices?: Array<{ id: string; name: string; energy?: string }>;
}

const named = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

/**
 * What Home Assistant's own Energy dashboard already knows.
 *
 * Only the live power sensors, the state of charge, the capacity and the two
 * prices are taken. The dashboard's energy figures are lifetime totals, and
 * this card wants today's — reading one as the other would be wrong by years,
 * so those are left for the owner to pick.
 */
export function pickFromEnergy(prefs: EnergyPrefs | undefined): EnergyPick {
  const out: EnergyPick = { entities: {}, devices: [] };
  for (const source of prefs?.energy_sources ?? []) {
    if (source.type === "solar") {
      out.entities.solar = named(source.stat_rate) ?? out.entities.solar;
    }

    if (source.type === "battery") {
      out.entities.battery_power =
        named(source.power_config?.stat_rate) ?? named(source.stat_rate) ?? out.entities.battery_power;
      out.entities.battery_soc = named(source.stat_soc) ?? out.entities.battery_soc;
      if (typeof source.capacity === "number" && source.capacity > 0) {
        out.battery_capacity = Math.round(source.capacity * 1000);
      }
    }

    if (source.type === "grid") {
      // Only a single signed sensor will do: the card reads one direction from
      // its sign. A separate import and export pair cannot answer that.
      out.entities.grid_power = named(source.stat_rate) ?? out.entities.grid_power;
      out.entities.price_import = named(source.entity_energy_price) ?? out.entities.price_import;
      out.entities.price_export =
        named(source.entity_energy_price_export) ?? out.entities.price_export;
    }
  }
  // A device the dashboard lists with a live sensor is a device worth naming;
  // one with only a meter has nothing to say about this minute.
  for (const device of prefs?.device_consumption ?? []) {
    const id = named(device.stat_rate);
    if (!id) continue;
    const fallback = id.replace(/^sensor\./, "").replace(/_power$/, "").replace(/_/g, " ");
    (out.devices ??= []).push({
      id,
      name: (named(device.name) ?? fallback).trim(),
      energy: named(device.stat_consumption)
    });
  }
  return out;
}

/** Fills only what is still empty, so a deliberate choice is never overwritten. */
export function mergePick<
  T extends {
    entities?: Partial<PowerOriginEntities>;
    battery_capacity?: number;
    devices?: DevicesOptions;
  }
>(
  config: T,
  pick: EnergyPick
): { merged: T; filled: string[] } {
  const entities = { ...(config.entities ?? {}) } as Record<string, string | undefined>;
  const filled: string[] = [];

  for (const [key, value] of Object.entries(pick.entities)) {
    // The two invert switches live beside the sensors but are not sensors.
    if (typeof value !== "string" || !value || entities[key]) continue;
    entities[key] = value;
    filled.push(key);
  }

  const merged = { ...config, entities } as T;
  // A list someone made is theirs; only an empty one is filled.
  const devices = pick.devices ?? [];
  if (devices.length > 0 && !(config.devices?.list?.length ?? 0)) {
    merged.devices = {
      ...config.devices,
      list: devices.map((d) => d.id),
      names: Object.fromEntries(devices.map((d) => [d.id, d.name])),
      energy: Object.fromEntries(
        devices.filter((d) => d.energy).map((d) => [d.id, d.energy as string])
      )
    };
    filled.push("devices");
  }
  if (pick.battery_capacity && !config.battery_capacity) {
    merged.battery_capacity = pick.battery_capacity;
    filled.push("battery_capacity");
  }

  return { merged, filled };
}
