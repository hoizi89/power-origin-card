/**
 * Where the house's power goes right now, device by device.
 *
 * The readings come from the live power sensors the Energy dashboard already
 * lists for its devices; nothing here searches sensors on its own. Consumers
 * are the house, and the house has no colour on this card — they are told
 * apart by brightness and by an icon read off the name.
 */

export interface DeviceReading {
  id: string;
  name: string;
  /** Watts now; undefined when the sensor cannot say. */
  watts: number | undefined;
  icon: string;
  area?: string;
}

export interface DeviceRanking {
  /** Drawing enough to be named, biggest first. */
  named: DeviceReading[];
  /** Reachable but below the threshold, so folded away and shown dim. */
  small: DeviceReading[];
  /** What the house draws beyond the named devices, when the house is known. */
  rest: number | undefined;
  /** The house load the shares are taken against. */
  house: number | undefined;
}

/* Longer, more specific words first: "Wärmepumpe" must not become a pump. */
const ICONS: Array<[RegExp, string]> = [
  [/w[äa]rmepumpe|heat ?pump|\bwp\b|lambda/i, "mdi:heat-pump-outline"],
  [/geschirr|dish/i, "mdi:dishwasher"],
  [/trockner|dryer/i, "mdi:tumble-dryer"],
  [/wasch|wash/i, "mdi:washing-machine"],
  [/k[üu]hl|gefrier|fridge|freezer/i, "mdi:fridge-outline"],
  [/backofen|oven|herd|ceran|stove|kochfeld/i, "mdi:stove"],
  [/mikrowelle|microwave/i, "mdi:microwave"],
  [/thermomix|mixer|blender/i, "mdi:blender"],
  [/licht|light|lampe|beleucht/i, "mdi:lightbulb-outline"],
  [/server|\bnas\b/i, "mdi:server"],
  [/wlan|wifi|router|netzwerk|network|infrastruktur/i, "mdi:router-wireless"],
  [/drucker|printer/i, "mdi:printer-3d"],
  [/\btv\b|fernseh|television/i, "mdi:television"],
  [/wallbox|\bev\b|\bauto\b|\bcar\b|charger/i, "mdi:car-electric"],
  [/pool|pumpe|pump/i, "mdi:pump"],
  [/heiz|heater|infrarot|sauna|radiator/i, "mdi:radiator"],
  [/schreibtisch|desk|b[üu]ro|office|\bpc\b|computer/i, "mdi:desktop-tower-monitor"],
  [/staubsauger|roborock|vacuum|saug/i, "mdi:robot-vacuum"],
  [/rasen|mower|m[äa]her/i, "mdi:robot-mower"],
  [/kompressor|compressor/i, "mdi:engine-outline"],
  [/laufband|treadmill|fitness/i, "mdi:run"],
  [/alexa|echo|speaker|sonos|lautsprecher/i, "mdi:speaker"],
  [/klima|air ?con|\bac\b/i, "mdi:air-conditioner"],
  [/boiler|warmwasser|water ?heater/i, "mdi:water-boiler"],
  // Rooms, for a sensor that sums one; after the devices so a fridge in the
  // kitchen stays a fridge.
  [/k[üu]che|kitchen/i, "mdi:silverware-fork-knife"],
  [/wohnzimmer|wohnbereich|living/i, "mdi:sofa"],
  [/schlaf|bedroom/i, "mdi:bed"],
  [/\bbad\b|bathroom|dusche|shower/i, "mdi:shower"],
  [/garage/i, "mdi:garage"],
  [/keller|cellar|basement/i, "mdi:home-floor-negative-1"],
  [/garten|garden|outdoor|au[ßs]en/i, "mdi:flower"],
  [/heizraum|technik|hwr/i, "mdi:pipe-valve"],
  [/gesamt|total|haus|house|home/i, "mdi:home-lightning-bolt"]
];

/** An icon read off the name, and a plug when the name says nothing. */
export function iconFor(name: string, entityId = ""): string {
  const text = name + " " + entityId.replace(/^sensor\./, "").replace(/_/g, " ");
  for (const [pattern, icon] of ICONS) if (pattern.test(text)) return icon;
  return "mdi:power-plug-outline";
}

/**
 * Who gets a name and who folds into the rest. A device that cannot report is
 * left out rather than counted as zero; a device at zero is reachable and off,
 * which is worth showing dim.
 */
export function rankDevices(
  readings: DeviceReading[],
  house: number | undefined,
  options: { limit: number; threshold: number }
): DeviceRanking {
  const reachable = readings.filter((r) => r.watts !== undefined && Number.isFinite(r.watts));
  const sorted = [...reachable].sort((a, b) => (b.watts ?? 0) - (a.watts ?? 0));
  const loud = sorted.filter((r) => (r.watts ?? 0) >= options.threshold);
  const named = loud.slice(0, Math.max(0, options.limit));
  const small = sorted.filter((r) => !named.includes(r)).sort((a, b) => a.name.localeCompare(b.name));
  const known = named.reduce((sum, r) => sum + (r.watts ?? 0), 0);
  const rest =
    house === undefined || !Number.isFinite(house) ? undefined : Math.max(0, house - known);
  return { named, small, rest, house };
}

/** The same readings summed by the room they stand in. */
export function byArea(readings: DeviceReading[], nowhere: string): DeviceReading[] {
  const rooms = new Map<string, DeviceReading>();
  for (const reading of readings) {
    if (reading.watts === undefined) continue;
    const key = reading.area ?? nowhere;
    const room = rooms.get(key) ?? {
      id: reading.id,
      name: key,
      watts: 0,
      icon: reading.area ? "mdi:floor-plan" : "mdi:help-circle-outline"
    };
    room.watts = (room.watts ?? 0) + reading.watts;
    rooms.set(key, room);
  }
  return [...rooms.values()];
}
