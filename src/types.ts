export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed?: string;
  last_updated?: string;
}

export interface HomeAssistant {
  states: Record<string, HassEntity>;
  locale?: { language?: string };
  language?: string;
  themes?: unknown;
  callWS<T>(message: Record<string, unknown>): Promise<T>;
  callApi<T>(method: string, path: string): Promise<T>;
}

export type RingCenter = "power" | "production" | "surplus" | "autarky";
export type BatteryStyle = "segments" | "solid" | "bar";
export type ChartStyle = "area" | "bars";
export type FactsStyle = "bars" | "plain" | "inline" | "none";
export type RingLayout = "auto" | "beside" | "below";
export type TodayStat =
  | "peak"
  | "autarky"
  | "export"
  | "import"
  | "solar"
  | "house"
  | "forecast";

export interface PowerOriginEntities {
  house: string;
  solar?: string;
  battery_power?: string;
  battery_soc?: string;
  grid_power?: string;
  solar_today?: string;
  house_today?: string;
  export_today?: string;
  import_today?: string;
  forecast?: string;
  cost_today?: string;
  cost_export_today?: string;
  cost_import_today?: string;
  price_import?: string;
  price_export?: string;
}

export interface SectionToggles {
  ring?: boolean;
  chart?: boolean;
  battery?: boolean;
  today?: boolean;
}

export interface RingOptions {
  center?: RingCenter;
  layout?: RingLayout;
  caption?: boolean;
  facts?: FactsStyle;
  /** A vertical meter beside the ring: surplus upwards, import downwards. */
  meter?: boolean;
  /** Full deflection in kW. 0 derives it from the system's yearly peak. */
  meter_scale?: number;
  /** Surplus worth acting on, in kW. Below it the column is held back. */
  meter_target?: number;
}

/** Configurations written before the facts option existed. */
export interface LegacyRingOptions {
  legend?: boolean;
}

export interface ChartOptions {
  style?: ChartStyle;
  consumption?: boolean;
  show_forecast?: boolean;
  /** Drawing height in pixels. */
  height?: number;
}

export interface BatteryOptions {
  style?: BatteryStyle;
  segments?: number;
  runtime?: boolean;
  runtime_window?: number;
}

export interface TodayOptions {
  money?: boolean;
  /** The small "exported / imported" note beside the balance. */
  breakdown?: boolean;
  stats?: TodayStat[];
}

export interface PowerOriginCardConfig {
  type: string;
  title?: string;
  /** Multiplies every type size. 1.2 suits a tablet on a wall. */
  text_scale?: number;
  battery_capacity?: number;
  battery_reserve?: number;
  battery_invert?: boolean;
  grid_invert?: boolean;
  sections?: SectionToggles;
  ring?: RingOptions;
  chart?: ChartOptions;
  battery?: BatteryOptions;
  today?: TodayOptions;
  entities: PowerOriginEntities;
}

export interface ResolvedConfig extends Required<Omit<PowerOriginCardConfig, "title" | "entities">> {
  title?: string;
  entities: PowerOriginEntities;
  sections: Required<SectionToggles>;
  ring: Required<RingOptions>;
  chart: Required<ChartOptions>;
  battery: Required<BatteryOptions>;
  today: Required<TodayOptions>;
}

export interface StatisticPoint {
  start: number;
  mean?: number | null;
  min?: number | null;
  max?: number | null;
}

export interface DaySeries {
  timestamps: number[];
  solar: number[];
  house: number[];
  solarPeak?: number;
  houseAverage?: number;
  houseSpread?: number;
}

declare global {
  interface Window {
    customCards?: Array<Record<string, unknown>>;
    loadCardHelpers?: () => Promise<{
      createCardElement(config: Record<string, unknown>): Promise<HTMLElement> | HTMLElement;
    }>;
  }
}
