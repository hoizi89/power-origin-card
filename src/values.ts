import type { HassEntity, HomeAssistant } from "./types";

const UNAVAILABLE = new Set(["unavailable", "unknown", "none", ""]);

export function isUsable(entity: HassEntity | undefined): entity is HassEntity {
  return !!entity && !UNAVAILABLE.has(String(entity.state).toLowerCase());
}

export function numberOf(entity: HassEntity | undefined): number | undefined {
  if (!isUsable(entity)) return undefined;
  const value = Number(entity.state);
  return Number.isFinite(value) ? value : undefined;
}

export function unitOf(entity: HassEntity | undefined): string {
  return String(entity?.attributes?.unit_of_measurement ?? "");
}

/** Power in kW, whatever the sensor reports it in. */
export function powerKw(entity: HassEntity | undefined): number | undefined {
  const value = numberOf(entity);
  if (value === undefined) return undefined;
  const unit = unitOf(entity).toLowerCase();
  if (unit === "kw") return value;
  if (unit === "mw") return value * 1000;
  return value / 1000;
}

/** Energy in kWh, whatever the sensor reports it in. */
export function energyKwh(entity: HassEntity | undefined): number | undefined {
  const value = numberOf(entity);
  if (value === undefined) return undefined;
  const unit = unitOf(entity).toLowerCase();
  if (unit === "wh") return value / 1000;
  if (unit === "mwh") return value * 1000;
  return value;
}

export function stateOf(hass: HomeAssistant | undefined, entityId: string | undefined) {
  if (!hass || !entityId) return undefined;
  return hass.states[entityId];
}

export function localeOf(hass: HomeAssistant | undefined): string {
  return hass?.locale?.language ?? hass?.language ?? "en";
}

export function formatNumber(value: number, locale: string, digits: number): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(value);
}

/** One decimal below 10, none above — the way a person would say it. */
export function formatPower(value: number, locale: string): string {
  return formatNumber(value, locale, Math.abs(value) < 10 ? 2 : 1);
}

/** Kilowatt hours in a tile: a small figure keeps two decimals, so 0.12 is not 0.1. */
export function formatEnergyFine(value: number, locale: string): string {
  return formatNumber(value, locale, Math.abs(value) < 10 ? 2 : Math.abs(value) < 100 ? 1 : 0);
}

export function formatEnergy(value: number, locale: string): string {
  return formatNumber(value, locale, Math.abs(value) < 100 ? 1 : 0);
}

export function formatMoney(value: number, locale: string): string {
  return formatNumber(value, locale, 2);
}

export function formatDuration(hours: number, locale: string): string {
  const total = Math.max(0, Math.round(hours * 60));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${formatNumber(h, locale, 0)} h`;
  return `${formatNumber(h, locale, 0)} h ${String(m).padStart(2, "0")}`;
}

export function formatClock(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

/** One entity or a list of them, as a list; nothing as an empty one. */
export function idsOf(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value.filter((id) => typeof id === "string" && id.length > 0);
  return typeof value === "string" && value.length > 0 ? [value] : [];
}

/** The energies of several sensors added up, in kWh; undefined when none of them can say. */
export function sumEnergyKwh(entities: Array<HassEntity | undefined>): number | undefined {
  let sum: number | undefined;
  for (const entity of entities) {
    const value = energyKwh(entity);
    if (value !== undefined) sum = (sum ?? 0) + value;
  }
  return sum;
}

/** What a price entity's number is worth in €/kWh: a helper kept in ct/kWh is a hundredth. */
export function priceScale(entity: HassEntity | undefined): number {
  const unit = unitOf(entity).toLowerCase();
  return /\bct\b|cent/.test(unit) ? 0.01 : 1;
}

/** A price in €/kWh, whether the entity is kept in euros or in cents. */
export function priceOf(entity: HassEntity | undefined): number | undefined {
  const value = numberOf(entity);
  return value === undefined ? undefined : value * priceScale(entity);
}
