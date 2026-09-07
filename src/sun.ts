import type { HassEntity } from "./types";

export interface SunTimes {
  rising?: Date;
  setting?: Date;
}

const DAY = 24 * 60 * 60 * 1000;

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * `sun.sun` only knows the next event, so today's sunrise has to be walked
 * back a day once it has already happened.
 */
function eventToday(iso: unknown, now: Date): Date | undefined {
  const time = Date.parse(String(iso ?? ""));
  if (!Number.isFinite(time)) return undefined;

  const next = new Date(time);
  if (sameDay(next, now)) return next;

  const previous = new Date(time - DAY);
  return sameDay(previous, now) ? previous : next;
}

export function sunTimes(entity: HassEntity | undefined, now = new Date()): SunTimes {
  if (!entity) return {};
  return {
    rising: eventToday(entity.attributes?.next_rising, now),
    setting: eventToday(entity.attributes?.next_setting, now)
  };
}
