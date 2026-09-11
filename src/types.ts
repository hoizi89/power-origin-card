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
  /** The registries the frontend carries, for the room a device stands in. */
  entities?: Record<string, { area_id?: string | null; device_id?: string | null; icon?: string | null }>;
  devices?: Record<string, { area_id?: string | null }>;
  areas?: Record<string, { name: string }>;
}

export type RingCenter = "power" | "production" | "surplus" | "autarky" | "money";
/** What the centre shows once the sun is down; "power" leaves a day view alone. */
export type RingCenterDark = "power" | "autarky" | "runtime" | "money";
export type RingNight = "same" | "countdown";
export type RingTap = "entity" | "cycle";
export type BatteryExtra = "none" | "range" | "cycles" | "saved" | "given" | "sunrise" | "flow";
export type BatteryStyle = "segments" | "solid" | "bar";
/** Where the full time comes from: the charge rate right now, or the hourly forecast. */
export type BatteryFullFrom = "rate" | "forecast";
/** The three source colours as one set. */
export type Palette = "standard" | "traffic" | "safe" | "muted";
/** The face the figures wear: monospace, or the dashboard's own. */
export type FigureFont = "mono" | "system";
/** Where the device list comes from: the configuration, or the Energy dashboard as it stands. */
export type DevicesSource = "list" | "energy";
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
export type RingStyle = "single" | "double" | "clock" | "dayclock";
/** How many columns stand beside the ring; `scale` is one balance bar under it instead. */
export type ColumnCount = "none" | "one" | "two" | "scale";
export type RingInner = "icon" | "load" | "battery" | "none";
export type RingSize = "auto" | "s" | "m" | "l";
export type OriginStyle = "bar" | "band";
export type MeterStyle =
  | "bar"
  | "blocks"
  | "day"
  | "balance"
  | "money"
  | "load"
  | "autarky"
  | "roof"
  | "battery"
  | "night"
  | "devices"
  | "none";
/** What a column measures, as against how it is drawn. */
export type MeterShows =
  | "grid"
  | "day"
  | "balance"
  | "money"
  | "load"
  | "autarky"
  | "roof"
  | "battery"
  | "night"
  | "devices"
  | "none";
export type MeterDrawn = "blocks" | "bar";
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
  /** The sensor counts the other way round. */
  battery_invert?: boolean;
  grid_invert?: boolean;
  solar?: string;
  battery_power?: string;
  battery_soc?: string;
  grid_power?: string;
  solar_today?: string;
  house_today?: string;
  export_today?: string;
  import_today?: string;
  /** Energy still expected today, in kWh. Several, one per roof face, are added up. */
  forecast?: string | string[];
  /** What the roof expects tomorrow, in kWh; read after sunset. Several are added up. */
  forecast_tomorrow?: string | string[];
  /** A sensor carrying the day's forecast by hour in its attributes, the way Solcast does. Several are added up. */
  forecast_hourly?: string | string[];
  cost_today?: string;
  cost_export_today?: string;
  cost_import_today?: string;
  price_import?: string;
  price_export?: string;
  /** Energy taken out of the battery today, in kWh. Splits the day bar in three. */
  battery_out_today?: string;
  /** Energy put into the battery today, in kWh; with the one above, the day's flow. */
  battery_in_today?: string;
  /** How far the system has paid for itself, in percent. */
  amortisation?: string;
}

/** The entities as the card reads them: the forecasts always as lists, empty when unset. */
export type ResolvedEntities = Omit<PowerOriginEntities, "forecast" | "forecast_tomorrow" | "forecast_hourly"> & {
  forecast: string[];
  forecast_tomorrow: string[];
  forecast_hourly: string[];
};

export type BlockName = "ring" | "chart" | "week" | "battery" | "today" | "devices";

export interface SectionToggles {
  /** The blocks top to bottom; any not named follow in the usual order. */
  order?: BlockName[];
  ring?: boolean;
  chart?: boolean;
  battery?: boolean;
  today?: boolean;
  devices?: boolean;
  /** Seven days as bars, with the self-supplied share above each. */
  week?: boolean;
}

export interface RingOptions {
  center?: RingCenter;
  /** The mode to use while nothing is being produced. */
  center_dark?: RingCenterDark;
  /** The outer ring once the sun is down: the night, filled as far as it has come. */
  night?: RingNight;
  /** What a tap on the ring does: open the entity, or step the centre on. */
  tap?: RingTap;
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
  meter_shows?: MeterShows;
  meter_style?: MeterStyle;
  meter_today?: boolean;
  meter_marks?: boolean;
  meter_top?: boolean;
  meter_second_top?: boolean;
  meter_second_scale?: number;
  meter_second_scale_draw?: number;
  meter_second_target?: number;
  meter_second_steps?: number;
  meter_second_marks?: boolean;
  meter_second_today?: boolean;
  meter_second_shows?: MeterShows;
  /** What each column shows once the sun is down; "same" leaves it alone. */
  meter_dark?: MeterShows | "same";
  meter_second_dark?: MeterShows | "same";
  meter_second_style?: MeterDrawn;
  meter_second?: MeterStyle | "none";
  /** How each column is drawn, kept apart from its subject; written by resolution. */
  meter_drawn?: MeterDrawn;
  meter_second_drawn?: MeterDrawn;
  /** Grid draw that lasts turns a column to the grid and the card red; it lets go after a while. */
  import_switch?: boolean;
  /** The self-supplied column in three colours: the grid's below half, the sun's up to 80 %, the battery's above. */
  autarky_colours?: boolean;
  meter_second_scope?: MeterScope;
  meter_scope?: MeterScope;
  size?: RingSize;
  rings?: RingStyle;
  inner?: RingInner;
  clock_marks?: boolean;
  /** While the house draws from the grid, the grid wears red instead of blue. */
  import_red?: boolean;
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
  /** The hours still expected, as outlines after now; after sunset, tomorrow's. */
  forecast_bars?: boolean;
  /** What the grid and the battery carried, as areas under the day. */
  layers?: boolean;
  /** The best day of the year, faintly behind today. */
  best_day?: boolean;
}

export interface WeekDay {
  /** Midnight that starts the day, in milliseconds. */
  day: number;
  solar?: number;
  house?: number;
  imported?: number;
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
  /** A sun under the bar where the charge will stand at sunrise. */
  sunrise_mark?: boolean;
  /** A moon under the bar where the charge will stand at sunset, when the forecast cannot fill it. Unset, it follows `sunrise_mark`. */
  sunset_mark?: boolean;
  /** The charge over the night, or the day, as a small curve under the bar, with where it is heading. */
  curve?: boolean;
  /** A slow wave through the cells, towards the cap while charging and away from it while discharging. */
  animate?: boolean;
  full_from?: BatteryFullFrom;
}

export type DevicesStyle = "rows" | "band" | "icons";
/** Names the block went by before: the two bars read as the band, the tiles as rows. */
export type LegacyDevicesStyle = "bar" | "both" | "tiles";
export type DevicesGroup = "device" | "area";
export type DevicesMode = "now" | "today";

export interface DevicesOptions {
  /** `energy` follows the Energy dashboard's device list, refreshed every hour; the list below is then not read. Unset, a list of your own means `list`, none means `energy`. */
  source?: DevicesSource;
  /** Live power sensors, one per device. */
  list?: string[];
  /** What the Energy dashboard calls each one, by entity. */
  names?: Record<string, string>;
  /** This minute, averaged over the window, or the day since midnight. */
  mode?: DevicesMode;
  /** Minutes the live reading is averaged over, so a kettle does not count. */
  window?: number;
  /** The meter behind each power sensor, by entity, for the day's total. */
  energy?: Record<string, string>;
  style?: DevicesStyle | LegacyDevicesStyle;
  /** The word and the period above the block. */
  head?: boolean;
  /** A colour per device, as the Energy dashboard gives them; otherwise brightness alone. */
  colours?: boolean;
  /** Print the watts beside the names. */
  values?: boolean;
  group?: DevicesGroup;
  /** How many are named; the rest fold together. */
  limit?: number;
  /** Below this many watts a device is not worth a name. */
  threshold?: number;
  /** An icon chosen for a device, by entity; beats the sensor's own and the name. */
  icons?: Record<string, string>;
  /** The biggest device as a row of its own, with how long it has run and what it cost today. */
  top?: boolean;
  /** A line per device for the last hour. */
  spark?: boolean;
  /** The editor writes one icon field per device under this prefix. */
  [key: `icon:${string}`]: string | undefined;
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
  /** The month so far, small beside the day. */
  month?: boolean;
  /** The day's money split into what was not bought and what was sold. */
  split?: boolean;
  /** The year the system will have paid for itself, at this year's pace. */
  payoff_year?: boolean;
  /** What the system cost, in euros; needed for the year. */
  investment?: number;
}

export interface PowerOriginCardConfig {
  type: string;
  title?: string;
  /** Multiplies every type size. 1.2 suits a tablet on a wall. */
  text_scale?: number;
  /** Percent the card dims by while the sun is down; 0 leaves it. */
  night_dim?: number;
  chip?: ChipMode;
  /** What the chip says: the state, or the day's self-supplied share. */
  chip_shows?: "state" | "autarky";
  /** Lasting grid draw turns the chip red with the kilowatts. */
  chip_alarm?: boolean;
  /** The import price beside the title, coloured against the day's mean. */
  head_price?: boolean;
  /** A line under the heading from sunrise to sunset with the sun on it; the night at night. */
  head_sunbar?: boolean;
  /** The card's shape: as it is, side by side for a wide panel, or one row. */
  shape?: "standard" | "wide" | "compact";
  /** From this many pixels the wide layout takes hold; 0 always. */
  wide_from?: number;
  /** Once the sun is down: as it is, or quiet — the columns, the tiles and the devices go. */
  night_layout?: "same" | "quiet";
  /** `traffic`: sun yellow, battery orange, grid red, everywhere at once. */
  palette?: Palette;
  /** `system` sets the figures in Home Assistant's own font instead of monospace. */
  font?: FigureFont;
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
  devices?: DevicesOptions;
  entities: PowerOriginEntities;
}

export interface ResolvedConfig extends Required<Omit<PowerOriginCardConfig, "title" | "entities">> {
  title?: string;
  entities: ResolvedEntities;
  sections: Required<SectionToggles>;
  ring: Required<RingOptions>;
  chart: Required<ChartOptions>;
  battery: Required<BatteryOptions>;
  today: Required<TodayOptions> & { stats_chosen: boolean };
  devices: Required<Omit<DevicesOptions, "style">> & { style: DevicesStyle };
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
