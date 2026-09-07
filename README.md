# Power Origin

A Lovelace card that answers the two questions a solar house actually raises: **where is my electricity coming from right now**, and **how much is spare**.

Four blocks, each optional:

- **Ring and meter** — the ring splits a total into its parts; the column beside it shows direction, surplus climbing and grid draw sinking. Set a threshold and the column stays held back until there is enough spare to be worth acting on.
- **Day chart** — production as an area, consumption as a line, on the solar day's axis. Where the line sits above the area, the grid or the battery filled the gap. The words underneath wear the colours of their lines, so it needs no legend.
- **Battery** — segments, a solid bar or a bare bar, coloured by state, with a remaining time averaged over half an hour rather than taken from the instant.
- **Today** — the money balance, plus any four of peak, self-supplied share, exported, imported, produced, used and still expected.

Everything is configurable from the visual editor. None of it needs YAML.

## Install

### HACS

Add this repository as a custom repository of type **Dashboard**, then install *Power Origin*.

### Manual

Copy `power-origin-card.js` from the latest release into `config/www/community/power-origin-card/` and add the resource:

```yaml
url: /local/community/power-origin-card/power-origin-card.js
type: module
```

## Minimal configuration

Only the house consumption sensor is required. Every other entity switches on the part of the card that needs it.

```yaml
type: custom:power-origin-card
entities:
  house: sensor.house_consumption
```

## Full configuration

```yaml
type: custom:power-origin-card
title: Photovoltaik              # left empty the card shows no heading
text_scale: 1                    # 1.2 or so for a tablet on a wall
battery_capacity: 13100          # usable capacity in Wh
battery_reserve: 0               # percent never delivered
battery_invert: false            # true if positive means charging
grid_invert: false               # true if positive means export

entities:
  house: sensor.house_consumption
  solar: sensor.pv_power
  battery_power: sensor.battery_power
  battery_soc: sensor.battery_state_of_charge
  grid_power: sensor.grid_power
  solar_today: sensor.solar_energy_today
  house_today: sensor.house_energy_today
  export_today: sensor.export_energy_today
  import_today: sensor.import_energy_today
  forecast: sensor.solcast_forecast_remaining_today
  cost_today: sensor.energy_balance_today
  cost_export_today: sensor.export_revenue_today
  cost_import_today: sensor.import_cost_today

sections:
  ring: true
  chart: true
  battery: true
  today: true

ring:
  center: surplus                # power | production | surplus | autarky
  layout: auto                   # auto | beside | below
  caption: false                 # label under the number, consumption mode only
  facts: none                    # bars | plain | inline | none
  meter: true                    # the column beside the ring
  meter_scale: 0                 # full deflection in kW, 0 derives it
  meter_target: 2                # spare worth acting on, in kW

chart:
  consumption: true
  show_forecast: true

battery:
  style: segments                # segments | solid | bar
  segments: 10
  runtime: true
  runtime_window: 30             # minutes averaged for the remaining time

today:
  money: true
  stats: [peak, autarky, export, import]
```

## The four ring modes

| Mode | The number in the middle | The ring | Answers |
| --- | --- | --- | --- |
| `power` | house load | where it comes from | What is the house running on? |
| `production` | what the roof makes | where it goes | What is the system doing? |
| `surplus` | spare power | the roof's output, spare highlighted | Can I switch something on? |
| `autarky` | self-supplied share | where it comes from | How independent am I right now? |

`production` and `surplus` fall back to `power` before sunrise: a ring about production has nothing to say when nothing is produced.

The value list beside the ring never repeats the number in the middle, and it defaults to hidden while the meter is on, because the meter already names the grid flow and the battery block names the battery.

## Options

| Option | Default | What it does |
| --- | --- | --- |
| `entities.house` | — | **Required.** Instantaneous house consumption. |
| `entities.solar` | — | PV power. Without it the ring has no sun segment. |
| `entities.battery_power` | — | Battery power, **positive while discharging**. |
| `entities.battery_soc` | — | State of charge in percent. Switches on the battery block. |
| `entities.grid_power` | — | Grid power, **positive while importing**. Taken as the truth when set. |
| `entities.solar_today` … `import_today` | — | Daily energy totals for the chart note and the today strip. |
| `entities.forecast` | — | Energy still expected today, e.g. from Solcast. |
| `entities.cost_today` | — | Today's balance in your currency. **Negative means earned.** |
| `text_scale` | `1` | Multiplies every type size at once. |
| `battery_capacity` | `0` | Usable capacity in Wh. Needed for kWh figures and the remaining time. |
| `battery_reserve` | `0` | Percent held back and not counted as available. |
| `ring.center` | `power` | Which question the ring answers — see the table above. |
| `ring.facts` | `bars` | The value list: `bars`, `plain`, `inline` or `none`. Defaults to `none` while the meter is on. |
| `ring.layout` | `auto` | Whether the values sit beside the ring or under it. |
| `ring.meter` | `true` | The direction column beside the ring. |
| `ring.meter_scale` | `0` | Full deflection in kW. `0` takes the system's peak over the past year. |
| `ring.meter_target` | `0` | Spare power worth acting on. Below it the column is held back and a line marks the level. |
| `battery.style` | `segments` | `segments`, `solid`, or `bar` without a casing. |
| `battery.runtime_window` | `30` | Minutes averaged before dividing. |
| `today.stats` | `[peak, autarky, export, import]` | Which four values appear at the bottom. |

## Sign conventions

Two sensors carry a direction, and inverters disagree about which way is positive:

- `battery_power` — this card expects **positive while discharging**. Set `battery_invert: true` if yours is the other way round.
- `grid_power` — expects **positive while importing**. Set `grid_invert: true` for the other convention.

Get one wrong and the ring shows the wrong colour, which makes it obvious.

## How the numbers are worked out

**The split.** When a grid sensor is configured it is taken first — the billing meter is the most trustworthy device on the wall — then the battery, and the solar share is what remains. Without a grid sensor the card starts from solar instead. Either way the segments add up to exactly the total the ring is drawn from, so the ring cannot lie about its own centre.

**Spare power** is export plus battery charging. Charging counts because it is displaceable: switch something on and the battery simply charges more slowly.

**The meter's scale** is the system's own peak over the past year, rounded up to a whole kilowatt, fetched twice a day. It deliberately does not follow the weather — a meter scaled to a dull day would show 900 W as nearly full, and 900 W does not run a dishwasher.

**The remaining time** is the battery's energy divided by the *averaged* house load, not the instantaneous one: switch on a kettle and an instantaneous estimate drops from eleven hours to forty minutes. If the load is still jumping too much to divide by, the card shows nothing rather than a number that will not hold.

## Colours

One rule throughout: **the colour names the participant that is not the house.** Sun is gold, battery green, grid blue, and the house itself neutral. The same kilowatts therefore wear the same colour wherever they appear — in the ring, in the meter, and in the value list.

Override the accents per card or in a theme:

```yaml
power-origin-sun-color: "#e08700"
power-origin-battery-color: "#2e9e63"
power-origin-grid-color: "#7b8296"
power-origin-house-color: "#171a24"
```

## Languages

English and German ship with the card, chosen from the Home Assistant user's language with English as the fallback. A test keeps the two tables in step, so a missing string fails the build rather than reaching a dashboard. Further languages are welcome — add a table to `src/localize.ts` and nothing else needs touching.

## Development

```bash
npm install
npm run check     # 134 tests, then the production build
npm run build
```

The suite covers the arithmetic and, in jsdom, the rendering: every ring mode against nine system states, including an offline inverter, an empty battery and a system at a standstill.

## Licence

MIT
