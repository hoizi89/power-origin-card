# Power Origin

**A Home Assistant card that answers one question first: where is the house's power coming from right now.**

[![Buy me a coffee](https://img.shields.io/badge/Buy%20me%20a%20coffee-%E2%98%95-FFB020?style=flat-square&labelColor=1A1E2B)](https://buymeacoffee.com/hoizi89)

<img src="https://raw.githubusercontent.com/hoizi89/power-origin-card/main/docs/card.png" alt="Midday: two rings, the day beside them, and what the day earned" width="430">

The ring splits the house load into its sources. Sun gold, battery green, grid blue — the colour always names the participant that is not the house, everywhere on the card. If you would rather see red the moment the house draws from the grid, one switch (`ring.import_red`) makes the grid wear red instead of blue for exactly as long as that lasts — on the ring, the column and the bar alike. And if your household reads colours as a traffic light, `palette: traffic` makes the sun yellow, the battery orange and the grid red, everywhere at once. Beside it a column with a middle: surplus climbs, grid draw sinks.

Three rules it is built on:

- **Nothing is invented for a missing sensor.** No entity, no block. An unreachable inverter says so instead of drawing a zero.
- **No figure appears twice.** The value list never repeats the ring's own centre.
- **A setting that cannot take effect is not shown.** The editor omits it rather than offering a dead control.

Only the house consumption sensor is required. Everything is configurable from the visual editor; **none of it needs YAML**.

---

## What it looks like

<p>
  <img src="https://raw.githubusercontent.com/hoizi89/power-origin-card/main/docs/evening.png" alt="Evening: the whole house on the battery" width="290">
  <img src="https://raw.githubusercontent.com/hoizi89/power-origin-card/main/docs/grey.png" alt="A grey day: the roof is short and the grid makes up the difference" width="290">
</p>

Left, an evening: the sun is down, the battery carries the house, and the card says how comfortably it reaches sunrise. Right, a grey day: two columns on one scale show the roof is short by two kilowatts, which is the one thing a ring cannot say.

<p>
  <img src="https://raw.githubusercontent.com/hoizi89/power-origin-card/main/docs/two.png" alt="A card with a column either side of the ring" width="290">
  <img src="https://raw.githubusercontent.com/hoizi89/power-origin-card/main/docs/clock.png" alt="The clock: the whole circle is the day" width="230">
</p>

Left, a card with a column either side of the ring: the day strip on one side, what the roof makes against its best today on the other. Each column has its own subject, so the pair answers two questions at once. Right, the clock: the whole circle is the day, noon at the top, sunrise on the left, a dot for now.

<img src="https://raw.githubusercontent.com/hoizi89/power-origin-card/main/docs/modes.png" alt="The four ring modes side by side" width="600">

The four questions the ring can answer, side by side.

<img src="https://raw.githubusercontent.com/hoizi89/power-origin-card/main/docs/no-battery.png" alt="A system without a battery" width="290">

And a system without a battery: no battery block, no green anywhere. Nothing is invented for a sensor that is not there.

---

## Install

**HACS** — add this repository as a custom repository of type **Dashboard**, then install *Power Origin*. (Submitted to the default store; the pull request is in the queue.)

**By hand** — copy `power-origin-card.js` from the [latest release](https://github.com/hoizi89/power-origin-card/releases/latest) into `config/www/community/power-origin-card/` and add the resource `/local/community/power-origin-card/power-origin-card.js` as a **module**.

```yaml
type: custom:power-origin-card
entities:
  house: sensor.house_consumption
```

That is a working card. Every other entity switches on the part that needs it.

### Or let it read your Energy dashboard

Home Assistant already knows most of this. The editor has a button — **Take what the Energy dashboard knows** — that reads your energy preferences and fills in the PV power, the battery power, its state of charge and capacity, the grid power and both prices. Sixteen pickers become one, plus the house sensor.

It only ever fills fields that are still empty, so a choice you made is never overwritten. The daily counters are left alone on purpose: the Energy dashboard tracks lifetime totals and this card wants today, and reading one as the other would be wrong by years.

---

## The ring answers one of four questions

| Mode | The number in the middle | Answers |
| --- | --- | --- |
| `power` | house load | What is the house running on? |
| `production` | what the roof makes | What is the system doing? |
| `surplus` | spare power | Can I switch something on? |
| `autarky` | self-supplied share | How independent am I right now? |
| `money` | euros per hour | What is this hour earning or costing me? |

`production` and `surplus` fall back to `power` before sunrise: a ring about production has nothing to say when nothing is produced. `money` needs a price and is offered once one is set. With `ring.tap: cycle` a tap on the ring steps the centre through these, and dots under the figure say where it stands.

## The ring has a type, the column has a subject

| `ring.rings` | |
| --- | --- |
| `single` | the shares right now |
| `double` | a second ring outside, the same question over the whole day |
| `clock` | the whole circle is the day, noon at the top |
| `dayclock` | the day as an hourly band outside, the sources now inside |

Inside the ring, `ring.inner: battery` draws the charge as a thin ring in the battery's colour. Once the sun is down, `ring.night: countdown` turns the outer band into the night itself — from sunset to sunrise, filled as far as it has come — and the word under the figure counts down to the sun.

<img src="https://raw.githubusercontent.com/hoizi89/power-origin-card/main/docs/ring-day.png" alt="The day as a clock outside with the charge inside, the hour priced, and a tap that steps the centre on" width="700">
<img src="https://raw.githubusercontent.com/hoizi89/power-origin-card/main/docs/ring-night.png" alt="The night around the ring, the battery's time in the centre, and the sunrise mark on the bar" width="700">

Left to right, by day: the day as a clock outside with the charge as a ring inside and the dots of a tap that steps the centre on; the hour priced; two rings with the charge inside. By night: the night around the ring counting down to the sun; the same with the battery's time in the centre; the battery bar with a sun where the charge will stand at sunrise.

A column answers two questions, and they are two settings. **What it measures** is `ring.meter_shows`:

| | |
| --- | --- |
| `grid` | the grid exchange now — surplus up, draw down |
| `day` | 24 bands, one per hour, of where the house drew from |
| `balance` | the roof against the house, on one scale |
| `money` | the same boundary as `grid`, priced per hour |
| `load` | the house now against its own average today |
| `autarky` | the self-supplied share now |
| `roof` | what the roof makes now, against its best today |

<img src="https://raw.githubusercontent.com/hoizi89/power-origin-card/main/docs/subjects.png" alt="The six subjects a column can take" width="700">

The same moment, six times. Top: what the roof makes against its best today, what the hour earns, how much of the house is self-supplied. Bottom: where the house drew from hour by hour, the roof against the house, the house against its own average.

Four more: `battery` is the battery as a store — what it holds on the scale of its own size, and at night a dashed line where the charge will stand at sunrise; `night` is the night itself — sunset at the top, sunrise at the bottom, a line for now, and from now how far the battery reaches, the rest in the grid’s colour because that is who will supply it; `devices` is the three drawing most, with their watts; `none` is no column at all, so the ring has the room. A column may say something else once the sun is down (`meter_dark`): a roof column has nothing to say at night, so it can become the night until sunrise and the roof again after. Instead of columns, `ring.columns: scale` lays one needle flat under the ring — draw to the left, surplus to the right. And `ring.import_switch` turns a column to the grid and the card red once the house has drawn from the grid for two minutes, letting go five minutes after the draw ends, so a kettle never trips it.

<img src="https://raw.githubusercontent.com/hoizi89/power-origin-card/main/docs/columns-night.png" alt="The night as a column in blocks and as one body, and the battery as a store" width="700">
<img src="https://raw.githubusercontent.com/hoizi89/power-origin-card/main/docs/columns-day.png" alt="The scale under the ring, the devices as a column, and a card with one column and none" width="700">

Top: the night as a column, in blocks and as one body — the second with the battery's time in the centre, so the column keeps only the gap — and the battery as a store with the sunrise level dashed. Bottom: the scale under the ring, the three devices drawing most, and a roof column alone. The ring’s centre can do the same with `center_dark: runtime` — how long the battery lasts. The battery block can mark where the charge will stand at sunrise (`battery.sunrise_mark`): a sun under the bar, and the cells the night will use stand back. It can also draw the charge as a curve under the bar (`battery.curve`) — since sunset, dashed on to sunrise — and, as its second figure, the day's flow: what went in and out, with the cycles (`battery.extra: flow`). For a panel on the wall, `night_dim` steps the card back while the sun is below the horizon; the chip stays bright.

**How it is drawn** is `ring.meter_style`: `blocks` or `bar`, for every column that fills from one end — the grid's needle, the night's hours, the roof, the battery and the share. Unset, the grid is blocks and the rest are one body. The others each have one honest shape, so the editor does not offer a drawing it would ignore.

## Three shapes, and a quiet night

The card has three shapes (`shape`): as it is; `wide`, with the ring and its columns on the left and the day, the battery and the rest on the right, for a tablet on the wall — it takes hold from `wide_from` pixels and stacks as usual below that; and `compact`, one row with the ring small, three figures and the chip, for an overview page where the card only has to say all is well. And once the sun is down, `night_layout: quiet` lets everything that has nothing to say at night step aside: the columns, the tiles, the devices and the week go, and the ring, the battery and one line about the day remain.

<img src="https://raw.githubusercontent.com/hoizi89/power-origin-card/main/docs/shapes.png" alt="The wide shape for a panel, the compact row, and the quiet night" width="700">

## The corner

The chip in the corner can say the day's self-supplied share instead of the state (`chip_shows: autarky`), and it can turn red with the kilowatts once the house has drawn from the grid for two minutes (`chip_alarm`), letting go five minutes after the draw ends. Beside the title, `head_price` puts this hour's import price, green under the day's mean and red over it. Without the day chart, `head_sunbar` draws the sun's day as a line under the heading, and the night at night.

<img src="https://raw.githubusercontent.com/hoizi89/power-origin-card/main/docs/head.png" alt="The price beside the title with the day's share in the chip, the sun line under the heading, and the plain corner" width="700">

## What the money says

The balance can carry the month beside it (`today.month`), split itself into what was not bought and what was sold (`today.split`) — most systems earn by not buying, and this is the first place that shows — and, with what the system cost (`today.investment`), name the year it will have paid for itself at this year's pace (`today.payoff_year`).

<img src="https://raw.githubusercontent.com/hoizi89/power-origin-card/main/docs/money.png" alt="The month beside the day and the split into not bought and sold; the year the system is paid off" width="700">

## The day, and the days around it

The day chart can carry three more things, each off by default. `chart.forecast_bars` stands the hours still expected as dashed outlines where their bars will be, read hour by hour off a forecast sensor such as Solcast's; after sunset it lays tomorrow's whole day over today's axis. `chart.layers` draws what the grid and the battery carried as areas under the day. `chart.best_day` puts a faint line of the year's best day behind today, with its yield beside the day's figures, so today can be read against as good as it gets. And `sections.week` adds seven days as bars with a dot above each for the self-supplied share — today bright, the rest already happened; a tap on a day puts its figures in the heading.

<img src="https://raw.githubusercontent.com/hoizi89/power-origin-card/main/docs/today.png" alt="The day with the expected hours as outlines and the best day behind it, and the week as bars" width="700">

<img src="https://raw.githubusercontent.com/hoizi89/power-origin-card/main/docs/battery-block.png" alt="The charge as a curve under the bar, and the day's flow through the battery" width="700">

The battery block at night: the charge since sunset as a curve, dashed on to sunrise, with the sunrise mark on the bar; and, on the right, the day's flow through the battery with its cycles.

`day` and `balance` are the two that are never empty — a needle reads zero all night. **`balance` answers what no ring can**: a ring shows what a total is made of, never whether the total is enough. Set `ring.columns` to `two` for a second column on the other side of the ring, with its own `ring.meter_second_shows`, so a day strip and a live needle can stand together.

---

## The battery block

Ten cells in a casing, each one a tenth. The reserve you never get to use is drawn
filled but dimmed, so a bar that reads full is not read as available.

| Setting | What it does |
| --- | --- |
| `battery.style` | `segments` a cell per tenth, `solid` one body, `bar` no casing at all |
| `battery.percent` | the state of charge as a number beside the bar |
| `battery.reserve_line` | marks where the reserve begins |
| `battery.extra` | a second figure to the right: the day’s low and high, cycles today, what was not bought, or what was given out |
| `battery.runtime` | how long the charge lasts, or when it is full |
| `battery.full_from` | where the full time comes from: the charge rate of the last quarter hour, or the hourly forecast up to sunset. Either way a time that would land after sunset is not shown; the bar says “not full today” and, from the forecast, where the charge will stand at sunset |

The bar gives up width for whatever stands to its right, and only ever one thing does.
Everything but the low and high is worked out from readings the card already holds.

---

## Where the power goes

The ring says where the house's power comes from. This block says where it goes.

<img src="https://raw.githubusercontent.com/hoizi89/power-origin-card/main/docs/devices.png" alt="The house load split by device: a bar with icons, and an icon row with levels" width="700">

Left, a bar: the house load now, split by device, with the part no device accounts for as *rest* — which is often the most interesting number on it. Right, the same as icons with a level each; what is off goes dim. Names and watts appear on tap.

**You configure nothing.** Home Assistant's Energy dashboard already lists your devices with a live power sensor each; the editor's *Take what the Energy dashboard knows* button adopts them, names included. The card never searches your sensors on its own — that list holds phase readings, switches at 0.0 and a fitness tracker's watts per kilo, and none of those are devices.

Four ways to look at them, each off by default: `devices.style: tiles` for one tile per device, readable from across the room; `devices.top` for the biggest as a row of its own, with how long it has been drawing and what it cost today; `devices.spark` for a line per device over the last hour; and by room (`devices.group: area`), where a tap on a room opens the devices standing in it. An icon can be chosen per device in the editor, under *Icons*.

<img src="https://raw.githubusercontent.com/hoizi89/power-origin-card/main/docs/wohin.png" alt="The devices as tiles, as rows with the biggest on top and a line each, and by room" width="700">

Two periods, one setting: **now**, averaged over a window (fifteen minutes by default) so a kettle does not light up as a hog, or **today**, read from each device's meter since midnight. Grouping by **room** sums the devices standing in one, from the device registry. Anything under a threshold folds into the rest, and at most a handful are named — both adjustable.

Each device gets the icon you gave its entity in Home Assistant; without one, the card reads an icon off the name — heat pump, dishwasher, fridge, lights, NAS — and falls back to a plug.

Consumers are the house, and the house has no colour on this card. The block is told apart by brightness alone, so it stays quiet beside the sun, the battery and the grid.

---

## Where the money comes from

The card has no idea what you pay, so the money comes from sensors. There are two ways to give it to them.

**From an integration that tracks the tariff.** Point `cost_today`, `cost_export_today`, `cost_import_today` and `amortisation` at its sensors and the card just reads them. This is the way to do it **on a spot tariff**: the price moves through the day, so only something that accumulates as it goes can be right.

**From a fixed price.** On a fixed tariff you can skip three of those pickers. Give the card `price_import` and `price_export` — a number helper each — and it works the two sides out from the energy it already reads, and the balance out of those. Any sensor you do configure wins over the arithmetic, so you can mix the two.

Without either, the money line simply does not appear and everything else works unchanged.

### Integrations that pair well

| Integration | What it feeds |
| --- | --- |
| [PV Energy Management+](https://github.com/hoizi89/pv_management_fix) | Balance, export revenue, import cost and the paid-off percentage — every money figure this card can show, on a fixed or a spot tariff. |
| [Solcast PV Forecast](https://github.com/BJReplay/ha-solcast-solar) | `forecast` — how much the roof still expects today. |
| [Home Assistant's Energy dashboard](https://www.home-assistant.io/docs/energy/) | The daily energy totals, if your inverter integration does not already provide them. |

The card only asks for numbers and units, never for a particular brand: anything that exposes power in watts and daily energy in kilowatt hours will do. Developed against a **GoodWe** system.

---

## Tapping a figure

Any figure that comes from one entity opens that entity in Home Assistant's own more-info dialog, the way every other card does it: the ring’s centre figure, the battery percentage, the balance, the paid-off share, the reading beside the day heading, and the tiles for exported, imported, produced, used and expected.

Figures the card works out itself lead nowhere, and are not made to look as though they do. The peak and the self-supplied share have no entity behind them, so they stay plain text.

`tap_action` changes what a tap does — navigate somewhere, open a URL, call a service, or nothing at all — in Lovelace's own vocabulary.

---

## More

- **[Every option](https://github.com/hoizi89/power-origin-card/blob/main/docs/OPTIONS.md)** — the full reference: entities, settings, sign conventions, how the numbers are worked out, and the colour tokens you can override.
- **[Contributing](https://github.com/hoizi89/power-origin-card/blob/main/CONTRIBUTING.md)** — building, testing, releasing.

## Languages

English and German ship with the card, chosen from the Home Assistant user's language with English as the fallback. A test reads both tables and fails the build on a key one of them lacks, or on German text that ended up in the English table — which is a mistake a patch makes easily and a dashboard shows plainly. Further languages are welcome — add a table to `src/localize.ts` and nothing else needs touching.

---

## Licence

MIT

## Support

Power Origin is free and stays free. If it earns its place on your wall, you can [buy me a coffee](https://buymeacoffee.com/hoizi89) — that is what keeps the night shifts going. Bug reports and ideas are just as welcome, in the [issues](https://github.com/hoizi89/power-origin-card/issues), in English or German.

<a href="https://buymeacoffee.com/hoizi89"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy me a coffee" height="50"></a>
