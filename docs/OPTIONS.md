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
  meter_style: blocks            # blocks | bar | day | balance | money | load | autarky
  meter_today: false             # a faint band for today's extremes
  meter_second: none             # none | blocks | bar | day | balance
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
| `forecast` | Energy still expected today, e.g. from Solcast. |
| `cost_today` | Today's balance in your currency. **Negative means earned.** |
| `cost_export_today`, `cost_import_today` | The two sides of the balance. |
| `price_import`, `price_export` | A fixed price per kWh, used only to work the money out — see below. |
| `amortisation` | How much of the system has paid for itself, in percent. |

### Card

| Option | Default | What it does |
| --- | --- | --- |
| `text_scale` | `1` | Multiplies every type size at once. |
| `chip` | `always` | The state word in the corner: `always`, `gridfree`, `never`. |
| `tap_action` | `more-info` | What tapping a figure does, in Lovelace's own vocabulary. |
| `chart.compare` | `false` | Draws the same weekday a week ago faintly behind today. Costs one more recorder query. |
| `battery.capacity` | `0` | Usable capacity in Wh. Needed for kWh figures and the remaining time. |
| `battery.reserve` | `0` | Percent held back and not counted as available. |
| `ring.center` | `power` | Which question the ring answers — see the table above. |
| `ring.size` | `auto` | `auto` grows the ring and column when they have the card to themselves; `s`, `m`, `l` fix it. |
| `ring.facts` | `bars` | The value list: `bars`, `plain`, `inline` or `none`. Defaults to `none` while the column is on. |
| `ring.layout` | `auto` | Whether the values sit beside the ring or under it. |
| `ring.caption` | `true` | The word under the centre figure, which names the source when one carries the whole house. |
| `ring.columns` | `one` | How many columns stand beside the ring: `none`, `one`, or `two` — one on each side. |
| `ring.meter_style` | `blocks` | What the left column is: `blocks`, `bar`, `day`, `balance`, `money`, `load` or `autarky`. |
| `ring.meter_second` | | What the right column is, when there are two. Defaults to `day`, the type that says what a needle cannot. |
| `ring.meter_scope` | `grid` | Whether the column also counts the battery — see the table above. |
| `ring.rings` | `single` | One ring, two rings, or the clock. |
| `ring.inner` | `icon` | Behind the centre figure: `icon`, `load` for the day's consumption curve, or `none`. |
| `ring.meter_today` | `false` | A faint band for how far the needle swung today, in both directions. |
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
| `battery.percent` | `true` | The charge as a figure beside the heading. The bar says it too, so this is the number and not the picture. |
| `battery.reserve_line` | `true` | A dashed line where the reserve begins, so a bar that reads full does not hide power that never comes out. Shown only when a reserve is set. |
| `battery.extra` | `none` | A second figure beside the bar, which gives up width for it: `range` (lowest and highest today), `cycles`, `saved` (not bought), `given` (given out). |
| `today.stats` | `[peak, autarky, export, import]` | Which four values appear at the bottom. |

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

