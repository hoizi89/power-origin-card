# Every option

The short version lives in the [readme](../README.md). This page is the reference: every entity, every setting, and the reasoning behind the numbers.

---

## Full configuration

```yaml
type: custom:power-origin-card
title: Solar                     # left empty the card shows no heading
text_scale: 1                    # 1.2 or so for a tablet on a wall
chip: always                     # always | gridfree | never
battery_capacity: 13100          # usable capacity in Wh
battery_reserve: 0               # percent never delivered
battery_invert: false            # true if positive means charging
grid_invert: false               # true if positive means export

entities:
  house: sensor.house_consumption          # the only required entity
  solar: sensor.pv_power
  battery_power: sensor.battery_power
  battery_soc: sensor.battery_state_of_charge
  grid_power: sensor.grid_power
  solar_today: sensor.solar_energy_today
  house_today: sensor.house_energy_today
  export_today: sensor.export_energy_today
  import_today: sensor.import_energy_today
  battery_out_today: sensor.battery_discharge_today
  forecast: sensor.solcast_forecast_remaining_today
  cost_today: sensor.energy_balance_today
  cost_export_today: sensor.export_revenue_today
  cost_import_today: sensor.import_cost_today
  price_import: input_number.electricity_price
  price_export: input_number.feed_in_price
  amortisation: sensor.system_paid_off_percent

sections:
  ring: true
  chart: true
  battery: true
  today: true

ring:
  center: surplus                # power | production | surplus | autarky
  center_dark: power             # what production and surplus fall back to at night
  size: auto                     # auto | s | m | l
  layout: auto                   # auto | beside | below
  caption: true                  # the word under the number
  facts: none                    # bars | plain | inline | none
  meter: true                    # the column beside the ring
  meter_scope: grid              # grid | all
  rings: single                  # single | double | clock
  inner: icon                    # icon | load | none
  meter_shows: grid              # grid | day | balance | money | load | autarky | roof
  meter_style: blocks            # blocks | bar — only when meter_shows is grid
  meter_second_shows: day        # the right column, when columns is two
  meter_second_style: blocks     # blocks | bar — again only for grid
  meter_today: false             # a faint band for today's extremes
  clock_marks: true              # sun and moon, for the clock type
  meter_steps: 6
  meter_scale: 0                 # full deflection up, in kW; 0 derives it
  meter_scale_draw: 0            # full deflection down, in kW; 0 uses 3 kW
  meter_target: 0                # spare worth acting on, in kW; 0 is off

chart:
  style: area                    # area | bars
  height: 84
  consumption: true
  show_forecast: true

battery:
  style: segments                # segments | solid | bar
  segments: 0                    # 0 gives one block per kWh
  runtime: true
  runtime_window: 30             # minutes averaged for the remaining time

today:
  money: true
  breakdown: true                # earned and paid, under the balance
  amortisation: true             # paid-off percentage, in the corner
  origin_bar: true               # where the day's energy came from
  origin_style: bar              # bar | band
  stats: [peak, autarky, export, amortisation]
```

---


---

## Options

### Entities

| Option | What it does |
| --- | --- |
| `house` | **Required.** Instantaneous house consumption. |
| `solar` | PV power. Without it the ring has no sun segment and the column nothing to weigh. |
| `battery_power` | Battery power, **positive while discharging**. |
| `battery_soc` | State of charge in percent. Switches on the battery block. |
| `grid_power` | Grid power, **positive while importing**. Taken as the truth when set. |
| `solar_today`, `house_today`, `export_today`, `import_today`, `battery_out_today` | Daily energy totals for the chart note, the origin bar and the today strip. |
| `forecast_tomorrow` | What the roof expects tomorrow, in kWh. Read after sunset, beside today: the day stays, tomorrow joins it. |
| `forecast` | Energy still expected today, e.g. from Solcast. |
| `cost_today` | Today's balance in your currency. **Negative means earned.** |
| `cost_export_today`, `cost_import_today` | The two sides of the balance. |
| `price_import`, `price_export` | A fixed price per kWh, used only to work the money out — see below. |
| `amortisation` | How much of the system has paid for itself, in percent. |

`forecast_hourly` is a sensor whose attributes carry the day hour by hour — Solcast's *Forecast Today* does (`detailedHourly`); after sunset the card reads `forecast_tomorrow` the same way.

### Card

| Option | Default | What it does |
| --- | --- | --- |
| `sections.order` | none | The blocks top to bottom. Name the ones you want first, in that order; the rest follow as usual (ring, day chart, week, battery, today, devices). The editor offers the blocks that are on as a list to pick and drag. In the wide shape the ring keeps its side whatever the order says. |
| `text_scale` | `1` | Multiplies every type size at once. |
| `shape` | `standard` | The card's shape: `standard` as it is; `wide` with the ring and its columns on the left and the day, the battery and the rest on the right, for a panel; `compact` as one row — the ring small, three figures (roof, grid, battery) and the chip. |
| `wide_from` | `640` | From this many pixels of card width the wide shape takes hold; narrower it stacks as usual, and below 560 px it stacks in any case, since two columns need the room. |
| `palette` | `standard` | The three source colours as one set, everywhere at once. `standard` follows the Energy dashboard: sun gold, battery green, grid blue. `traffic` reads as a traffic light: sun yellow, battery orange, grid red. `safe` never asks anyone to tell green from red: sun amber, battery blue, grid magenta. `muted` is the same three at low saturation, for a panel on a wall. Each colour can still be set on its own through the theme variables. |
| `night_layout` | `same` | `quiet` once the sun is down: the columns, the week, the tiles and the devices step aside, and the ring, the battery and one line about the day remain. Pairs with `night_dim`. |
| `chip` | `always` | The state word in the corner: `always`, `gridfree`, `never`. |
| `chip_shows` | `state` | What the chip says: `state` (grid-free or from grid) or `autarky` — the day's self-supplied share from the daily meters, green from 80 %, the grid's colour below. |
| `chip_alarm` | `false` | After two minutes of drawing from the grid the chip turns red and carries the kilowatts; five minutes without draw and it is itself again. The same switch as `ring.import_switch`, on the chip alone; it shows even when the chip is otherwise hidden. |
| `head_price` | `false` | This hour's import price beside the title, green under the day's mean, red over it. For a moving tariff; needs `price_import`. |
| `head_sunbar` | `false` | A line under the heading from sunrise to sunset with the sun where it stands; at night the night, with the moon. Offered only without the day chart, which draws the same day. |
| `tap_action` | `more-info` | What tapping a figure does, in Lovelace's own vocabulary. |
| `chart.compare` | `false` | Draws the same weekday a week ago faintly behind today. Costs one more recorder query. |
| `chart.forecast_bars` | `false` | The hours still expected as dashed outlines after now, where their bars will stand; after sunset, tomorrow's whole day over today's axis. Read from the attributes of `forecast_hourly` (or of `forecast_tomorrow` at night), the way Solcast attaches them. |
| `chart.layers` | `false` | What the grid and the battery carried, hour by hour, as areas under the day, in the ring's colours for the same two. |
| `chart.best_day` | `false` | A faint line of the year's best day behind today, with its yield beside the day's figures. Two recorder queries, twice a day. |
| `sections.week` | `false` | Seven days as bars for the roof's yield, a dot above each for the self-supplied share (green from 80 %), today bright. The heading carries the average; a tap on a day puts its figures there instead. Needs the daily roof meter; one query an hour. A meter that only climbs (`total_increasing`), or one that says when it resets, is read by its change per day; a daily meter that resets at midnight without saying so (`total`, no `last_reset`) is read by the state it ended each day at. The month under the balance is read the same way. |
| `battery.capacity` | `0` | Usable capacity in Wh. Needed for kWh figures and the remaining time. |
| `battery.reserve` | `0` | Percent held back and not counted as available. |
| `ring.center` | `power` | Which question the ring answers — see the table above. `money` prices the hour from the two tariffs, plus while exporting and minus while drawing; offered once a price is set. |
| `ring.tap` | `entity` | What tapping the ring does: `entity` opens the house sensor, `cycle` steps the centre on — house, self-supplied, money, and by day production and surplus. Dots under the figure say where it stands; the browser remembers the stop. |
| `ring.night` | `same` | `countdown` turns the outer band into the night once the sun is down: from sunset to sunrise, filled as far as it has come, moon where it began and sun where it ends. The word under the figure counts down to the sun — unless the centre already says how long the battery lasts, which keeps the caption. |
| `ring.size` | `auto` | `auto` grows the ring and column when they have the card to themselves; `s`, `m`, `l` fix it. |
| `ring.facts` | `bars` | The value list: `bars`, `plain`, `inline` or `none`. Defaults to `none` while the column is on. |
| `ring.layout` | `auto` | Whether the values sit beside the ring or under it. |
| `ring.caption` | `true` | The word under the centre figure, which names the source when one carries the whole house. |
| `ring.columns` | `one` | How many columns stand beside the ring: `none`, `one`, `two` — one on each side — or `scale`: no columns, but the left column laid flat under the ring, draw to the left and surplus to the right, with the left column's scope and deflections. |
| `ring.autarky_colours` | `false` | The self-supplied column in three colours: the grid's below half, the sun's up to 80 %, the battery's above — the same line the chip draws. Offered once a column shows the share, by day or by night. |
| `ring.import_switch` | `false` | Grid draw that lasts two minutes turns the right column (or the only one) to the grid exchange and the card red; five minutes without draw and it goes back. A kettle never trips it. Needs a grid sensor. |
| `ring.meter_shows` | `grid` | What the left column measures: `grid`, `day`, `balance`, `money`, `load`, `autarky`, `roof`, `battery` (what it holds on the scale of its own size, the reserve at the foot, at night a dashed line where the charge will stand at sunrise), `night` (sunset at the top, sunrise at the bottom, a line for now, and from now how far the battery reaches — what it does not reach wears the grid colour; the figure is the time it lasts until, unless the centre already says so; reaching the sun, the word is the charge expected there, unless the battery block already says it; an empty battery gives the rest of the night to the grid; by day the column is empty), `devices` (the three drawing most, with their watts, from the devices list) or `none` (no column; the ring has the room). |
| `ring.meter_style` | `blocks` | How it is drawn: `blocks` or `bar`. Offered for the columns that fill from one end — `grid`, `night`, `roof`, `battery`, `autarky`; the others have one shape. Unset, the grid is blocks and the rest are one body, so nothing is redrawn unasked. The night in blocks is one block per hour. |
| `ring.meter_second_shows` | `day` | The same for the right column, when `ring.columns` is `two`. |
| `ring.meter_second_style` | `blocks` | How the right one is drawn, again only for `grid`. |
| `ring.meter_dark` / `ring.meter_second_dark` | `same` | What each column shows once the sun is down: `same`, or a subject that has something to say at night — `night`, `grid`, `day`, `money`, `load`, `autarky`, `battery`, `devices`, `none`. The roof and the roof against the house are not offered here, and `night` is offered only here. |
| `ring.center_dark` | `power` | The centre once the sun is down: `power` leaves a day view alone (production and surplus fall back to the house either way); `autarky`, `money`, or `runtime` — how long the battery lasts, with the time it lasts until as the caption; the battery block then keeps only the energy. |
| `night_dim` | `0` | Percent the card dims by while the sun is below the horizon; the chip stays bright. |
| `ring.meter_top` | `true` | The best the roof managed today above the roof column, or the capacity above the battery column: the mark it fills towards. |
| `ring.meter_second_scale` | `0` | The right column has its own of every setting that shapes a needle: `meter_second_scale`, `meter_second_scale_draw`, `meter_second_target`, `meter_second_steps`, `meter_second_marks`, `meter_second_today`. Each means for the right column what the one without `second` means for the left. |
| `ring.meter_second` | | Written from the two fields above; kept so a card configured before the split still reads. |
| `ring.meter_scope` | `grid` | Whether the column also counts the battery — see the table above. |
| `ring.rings` | `single` | One ring, two rings, the clock, or `dayclock`: the day as an hourly band outside, thinner because it is a memory, with the sources now still inside. At night the countdown takes the band. |
| `ring.inner` | `icon` | Behind the centre figure: `icon`, `load` for the day's consumption curve, `battery` for the charge as a thin ring in the battery's colour, or `none`. |
| `ring.meter_today` | `false` | A faint band for how far the needle swung today, in both directions. |
| `ring.import_red` | `false` | While the house draws from the grid, the grid wears red instead of blue everywhere on the card. The shade is `--power-origin-import-color`. |
| `ring.meter_marks` | `true` | Small arrows at the two ends of a needle column, so which end means which needs no reading. |
| `ring.meter_second_scope` | `all` | Which boundary the second column watches, when it is a needle. Set it to the other one, or both needles draw the same picture. |
| `ring.clock_marks` | `true` | Sun and moon on the clock dial, so it is clear which way round it reads. |
| `today.origin_style` | `bar` | The day bar as shares, or as a `band` with one cell per hour. |
| `ring.meter_scale` | `0` | Full deflection up, in kW. `0` takes the system's peak over the past year. |
| `ring.meter_scale_draw` | `0` | Full deflection down, in kW. `0` uses 3 kW, the band a house lives in. |
| `ring.meter_target` | `0` | Spare power worth acting on. Below it the column is held back and a line marks the level. |
| `chart.style` | `area` | A filled area or one bar per hour. |
| `battery.style` | `segments` | `segments`, `solid`, or `bar` without a casing. |
| `battery.segments` | `0` | `0` gives one block per kilowatt hour of capacity. |
| `battery.runtime_window` | `30` | Minutes averaged before dividing. |
| `battery.full_from` | `rate` | Where the full time comes from while charging. `rate` divides what is missing by the charge rate of the last quarter hour, and says nothing past today's sunset or past a day: “not full today” instead of a clock time that lies in tomorrow. `forecast` reads the hourly forecast from now to sunset, the house's average load taken off, and names the hour it fills; when it does not, it says where the charge will stand at sunset. When the forecast publishes a pessimistic and an optimistic edge (Solcast's `pv_estimate10` and `pv_estimate90`), both are walked: more than two hours apart the card says the span instead of an hour, and when the pessimistic day never fills it says so. Offered once `forecast_hourly` is set. |
| `battery.percent` | `true` | The charge as a figure beside the heading. The bar says it too, so this is the number and not the picture. |
| `battery.reserve_line` | `true` | A dashed line where the reserve begins, so a bar that reads full does not hide power that never comes out. Shown only when a reserve is set. |
| `battery.sunrise_mark` | `false` | A sun under the bar where the charge will stand at sunrise, worked out from today's average load. Shown while the battery carries the house. |
| `battery.extra` | `none` | A second figure beside the bar, which gives up width for it: `range` (lowest and highest today), `cycles`, `saved` (not bought), `given` (given out), `sunrise` (where the charge will stand at sunrise, shown while the battery carries the house), `flow` (what went in and out today, with the cycles; needs `battery_in_today` and `battery_out_today`). |
| `battery.animate` | `false` | A slow wave through the cells while the battery moves: towards the cap while charging, away from it while discharging, still while it rests. Off when the system asks for reduced motion. Segments and bar styles only. |
| `battery.curve` | `false` | The charge as a small curve under the bar: at night since sunset and dashed on to where it will stand at sunrise, by day since midnight and dashed on to full while charging. The reserve is a floor line. Costs the same query as `range`. |
| `today.stats` | `[peak, autarky, export, import]` | Which four values appear at the bottom. |
| `today.month` | `false` | The month so far, small under the day's balance, from twelve months of the money sensors (the balance, the two sides, or the two energies priced). One query an hour. |
| `today.split` | `false` | The day's money split into what was not bought (the house's own share, priced) and what was sold, as a two-colour bar. Needs the daily house and import meters and the import price. |
| `today.payoff_year` | `false` | Beside the paid-off share, the year the system will have paid for itself at this year's pace, with a bar and the figures. Needs the paid-off sensor and `today.investment`. |
| `today.investment` | `0` | What the system cost, in euros; only used for the year. Left at 0, the card reads it off the paid-off sensor when that carries the figure as an attribute (`investment`, `cost`, `anschaffung`, `kosten`, `total`, `price`). |

Options that cannot take effect in the current mode are **not shown in the editor at all** — no switch that does nothing.

---

---

## What a needle measures

For `blocks` and `bar`, one setting decides which boundary it watches:

| `ring.meter_scope` | Up | Down |
| --- | --- | --- |
| `grid` *(default)* | export | import |
| `all` | export and battery charging | import and battery discharge |

`grid` keeps the column on the billing meter, so the ring can name the battery without the two saying the same thing twice. Below fifty watts the column prints no figure at all and says *no grid exchange* — a hundredth of a kilowatt is the meter breathing, not a flow worth a decision.

Its scale is **absolute, not weather-following**: three kilowatts down and the system's yearly peak up, both overridable. A meter scaled to a dull day would show 900 W as nearly full, and 900 W does not run a dishwasher.

---


---

## What the battery says

| State | Caption |
| --- | --- |
| Empties before sunrise | **Lasts until 03:15** · 1.2 kWh left |
| Only just gets through | **Only just reaches sunrise** |
| Gets through | **Lasts until sunrise** |
| Gets through with room to spare | **Well past sunrise** |
| Down to the reserve | **At the reserve** |
| Load still jumping | *(nothing)* |

The distinction matters: knowing whether you have to save power tonight or can afford to spend it is the whole point of the line. The remaining time divides by the **averaged** house load, not the instantaneous one — switch on a kettle and an instantaneous estimate drops from eleven hours to forty minutes.

---


---

## Sign conventions

Two sensors carry a direction, and inverters disagree about which way is positive:

- `battery_power` — this card expects **positive while discharging**. Set `battery_invert: true` if yours is the other way round.
- `grid_power` — expects **positive while importing**. Set `grid_invert: true` for the other convention.

Get one wrong and the ring shows the wrong colour, which makes it obvious.

---


---

## How the numbers are worked out

**The split.** When a grid sensor is configured it is taken first — the billing meter is the most trustworthy device on the wall — then the battery, and the solar share is what remains. Without a grid sensor the card starts from solar instead. Either way the segments add up to exactly the total the ring is drawn from, so the ring cannot lie about its own centre.

**Spare power** is export plus battery charging. Charging counts because it is displaceable: switch something on and the battery simply charges more slowly.

**A flow that is a rounding error is not named.** A share under eight per cent *and* under fifty watts is left out of the list rather than given a row of its own.

---


---

## Colours

One rule throughout: **the colour names the participant that is not the house.** Direction is never a colour: power leaving for the grid and power drawn from it are both blue, and which way it is going is said by where it sits and by the word beside it. Sun is gold, battery green, grid blue, and the house itself neutral. The same kilowatts therefore wear the same colour wherever they appear — in the ring, in the column, in the origin bar and in the value list. There are no traffic lights, which would put a second meaning on the same scale.

Override the accents per card or in a theme:

```yaml
power-origin-sun-color: "#e08700"
power-origin-battery-color: "#2e9e63"
power-origin-grid-color: "#7b8296"
power-origin-house-color: "#171a24"
```

---

## Devices

```yaml
sections:
  devices: true
devices:
  list: [sensor.heat_pump_power, sensor.dishwasher_power]   # live power sensors; the adopt button fills this
  mode: now                      # now | today — today needs the meters the Energy dashboard knows
  window: 15                     # minutes averaged for "now"
  style: both                    # both | bar | icons
  values: true                   # print the watts
  group: device                  # device | area
  limit: 5                       # how many are named
  threshold: 25                  # watts below which a device folds into the rest
```

| Option | Default | Meaning |
| --- | --- | --- |
| `devices.list` | `[]` | The live power sensors, one per device. The editor's adopt button takes them from the Energy dashboard's device list. |
| `devices.mode` | `now` | `now` averages each sensor over the window; `today` sums each device's meter since midnight. Offered only once meters are known. |
| `devices.window` | `15` | Minutes the live readings are averaged over. |
| `devices.style` | `rows` | `rows` a bar chart lying down: icon, name, a bar for the share of the house and the figure, one device a row, the rest last with how many it holds. `band` the house load as one strip, the biggest first, with the names below keyed by shade. `icons` an icon per device on a fixed grid, with a level and the figure under the ones that draw. The older `bar` and `both` read as `band`, `tiles` as `rows`. |
| `devices.top` | `false` | The biggest device as a row of its own above the list, with how long it has been drawing (from its last three hours, five minutes at a time) and what it cost today (its meter times the import price). It leaves the list below, so it never stands there twice. |
| `devices.spark` | `false` | A line per device for the last hour in place of its bar: the fridge's rhythm, the heat pump's ramp, the kettle's spike. Rows only. |
| `devices.icons` | `{}` | An icon chosen per device, by entity — in the editor one field per device under *Icons*, written as `icon:<entity>` keys. A chosen icon beats the one set on the entity, which beats the one read off the name. |
| `devices.values` | `true` | Print watts (or kWh) beside the names. |
| `devices.head` | `true` | The word and the period above the block. Off, the block starts where the line above ends. |
| `devices.colours` | `false` | A colour per device on its bar, its segment, its swatch or its icon, fixed to the device's place in the list so it never changes with the ranking. Otherwise the block is told apart by brightness alone. |
| `devices.group` | `device` | `area` sums devices by the room they stand in; a tap on a room opens the devices standing in it. |
| `devices.limit` | `5` | How many devices get a name in rows and band; the others fold into the rest. Icons have no rest, so they show no more than this. |
| `devices.threshold` | `25` | Watts below which a device is not named. Shown for `now` only. |
| *(icons)* | | Without a chosen icon, the one set on the entity in Home Assistant wins; otherwise one is read off the name, with a plug as the fallback. |
| `devices.names`, `devices.energy` | | Written by the adopt button: the dashboard's name and meter for each sensor. Data, not settings. |
