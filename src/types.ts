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
export type BatteryExtra = "none" | "range" | "cycles" | "saved" | "given";
export type BatteryStyle = "segments" | "solid" | "bar";
export type ChartStyle = "area" | "bars";
export type MeterScope = "grid" | "all";
/** The subset of Lovelace's action config this card acts on. */
export interface ActionConfig {
  action: "more-info" | "navigate" | "url" | "toggle" | "call-service" | "perform-action" | "none";
  entity?: string;
  navigation_path?: string;
  url_path?: string;
  service?: string;
  perform_action?: string;
  target?: Record<string, unknown>;
  data?: Record<string, unknown>;
}

export type ChipMode = "always" | "gridfree" | "never";
export type RingStyle = "single" | "double" | "clock";
export type ColumnCount = "none" | "one" | "two";
export type RingInner = "icon" | "load" | "none";
export type RingSize = "auto" | "s" | "m" | "l";
export type OriginStyle = "bar" | "band";
export type MeterStyle = "bar" | "blocks" | "day" | "balance";
export type FactsStyle = "bars" | "plain" | "inline" | "none";
export type RingLayout = "auto" | "beside" | "below";
export type TodayStat =
  | "peak"
  | "autarky"
  | "export"
  | "import"
  | "solar"
  | "house"
  | "forecast"
  | "amortisation";

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
  /** Energy taken out of the battery today, in kWh. Splits the day bar in three. */
  battery_out_today?: string;
  /** How far the system has paid for itself, in percent. */
  amortisation?: string;
}

export interface SectionToggles {
  ring?: boolean;
  chart?: boolean;
  battery?: boolean;
  today?: boolean;
}

export interface RingOptions {
  center?: RingCenter;
  /** The mode to use while nothing is being produced. */
  center_dark?: RingCenter;
  layout?: RingLayout;
  caption?: boolean;
  facts?: FactsStyle;
  /** A vertical meter beside the ring: surplus upwards, import downwards. */
  meter?: boolean;
  columns?: ColumnCount;
  /** Full deflection in kW. 0 derives it from the system's yearly peak. */
  meter_scale?: number;
  /** Surplus worth acting on, in kW. Below it the column is held back. */
  meter_target?: number;
  /** Full deflection downwards in kW. 0 derives it from the house's yearly peak. */
  meter_scale_draw?: number;
  /** Blocks per direction. */
  meter_steps?: number;
  /** A continuous band or stepped blocks. */
  meter_style?: MeterStyle;
  meter_today?: boolean;
  meter_marks?: boolean;
  meter_second?: MeterStyle | "none";
  meter_second_scope?: MeterScope;
  meter_scope?: MeterScope;
  size?: RingSize;
  rings?: RingStyle;
  inner?: RingInner;
  clock_marks?: boolean;
}

/** Configurations written before the facts option existed. */
export interface LegacyRingOptions {
  legend?: boolean;
}

export interface ChartOptions {
  style?: ChartStyle;
  consumption?: boolean;
  show_forecast?: boolean;
  compare?: boolean;
  /** Drawing height in pixels. */
  height?: number;
}

export interface BatteryOptions {
  style?: BatteryStyle;
  segments?: number;
  runtime?: boolean;
  runtime_window?: number;
  reserve_line?: boolean;
  percent?: boolean;
  capacity?: number;
  reserve?: number;
  extra?: BatteryExtra;
}

export interface TodayOptions {
  money?: boolean;
  /** A slim bar splitting the day's consumption by where it came from. */
  origin_bar?: boolean;
  origin_style?: OriginStyle;
  /** The small "exported / imported" note beside the balance. */
  breakdown?: boolean;
  /** How far the system has paid for itself, in the corner beside the balance. */
  amortisation?: boolean;
  stats?: TodayStat[];
}

export interface PowerOriginCardConfig {
  type: string;
  title?: string;
  /** Multiplies every type size. 1.2 suits a tablet on a wall. */
  text_scale?: number;
  chip?: ChipMode;
  tap_action?: ActionConfig;
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
  today: Required<TodayOptions> & { stats_chosen: boolean };
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
