import { css } from "lit";

export const cardStyles = css`
  :host {
    --sst-sun: var(--power-origin-sun-color, var(--energy-solar-color, #e08700));
    --sst-leaf: var(--power-origin-battery-color, var(--energy-battery-out-color, #2e9e63));
    --sst-grid: var(--power-origin-grid-color, var(--energy-grid-consumption-color, #7b8296));
    --sst-track: var(--power-origin-track-color, var(--divider-color, #dde0ea));
    --sst-house: var(--power-origin-house-color, var(--primary-text-color, #171a24));
    --sst-ink: var(--primary-text-color, #171a24);
    --sst-muted: var(--secondary-text-color, #666e88);
    --sst-hairline: var(--divider-color, #d6d9e4);
    --sst-inset: var(--power-origin-inset-color, rgba(127, 133, 155, 0.09));
    --sst-mono: var(--code-font-family, ui-monospace, "SFMono-Regular", "Menlo", monospace);
    --sst-scale: 1;
    display: block;
  }

  /* Chosen, not inferred: the grid is still the participant the colour names,
     the colour just says it is the one you pay for right now. */
  ha-card.import-alarm {
    --sst-grid: var(--power-origin-import-color, #e5484d);
  }

  /* One set for the whole card: the sun as the sun, the battery as energy
     that went through a converter twice, the grid as the one that costs. */
  ha-card.palette-traffic {
    --sst-sun: #f2c200;
    --sst-leaf: #f28c28;
    --sst-grid: #e5484d;
  }

  ha-card {
    position: relative;
    container-type: inline-size;
    padding: 16px 16px 0;
    display: flex;
    flex-direction: column;
    gap: 14px;
    overflow: hidden;
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .head.bare {
    justify-content: flex-end;
  }

  /* With nothing to the right of the ring the chip has a whole row to itself,
     which is a row of height for one word. It floats into the corner instead. */
  @container (min-width: 340px) {
    .head.bare.float {
      position: absolute;
      top: 14px;
      right: 16px;
      z-index: 1;
    }

    /* and the pair steps aside far enough not to sit under it */
    .head.bare.float + .ring-block {
      padding-right: 26px;
    }
  }

  .title {
    font-size: calc(15px * var(--sst-scale));
    font-weight: 600;
    margin: 0;
  }

  .chip {
    font-family: var(--sst-mono);
    font-size: calc(10px * var(--sst-scale));
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 4px 9px;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
  }

  .chip::before {
    content: "";
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
  }

  .chip.gridfree {
    color: var(--sst-leaf);
    background: color-mix(in srgb, var(--sst-leaf) 14%, transparent);
  }

  .chip.importing {
    color: var(--sst-grid);
    background: color-mix(in srgb, var(--sst-grid) 16%, transparent);
  }

  /* Lasting draw: the chip wears the import colour whatever the card wears. */
  .chip.alarm {
    color: var(--power-origin-import-color, #e5484d);
    background: color-mix(in srgb, var(--power-origin-import-color, #e5484d) 16%, transparent);
  }

  .head-left {
    display: flex;
    align-items: baseline;
    gap: 10px;
    min-width: 0;
  }

  /* The price of this hour, against the day's mean: cheap, dear, or neither. */
  .head-price {
    font-family: var(--sst-mono);
    font-size: calc(11px * var(--sst-scale));
    letter-spacing: 0.04em;
    color: var(--sst-muted);
    white-space: nowrap;
  }

  .head-price.cheap {
    color: var(--sst-leaf);
  }

  .head-price.dear {
    color: var(--power-origin-import-color, #e5484d);
  }

  /* The sun's day as a line: where it stands, and how much day is left. */
  .sunbar {
    display: flex;
    flex-direction: column;
    gap: 3px;
    margin-top: -4px;
  }

  .sunbar-track {
    position: relative;
    display: block;
    height: 2px;
    border-radius: 1px;
    background: var(--sst-track);
  }

  .sunbar-done {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    border-radius: 1px;
    background: var(--sst-sun);
    transition: width 0.6s ease;
  }

  .sunbar.night .sunbar-done {
    background: var(--sst-muted);
  }

  .sunbar-mark {
    position: absolute;
    top: 50%;
    transform: translate(-50%, -50%);
    color: var(--sst-sun);
    --mdc-icon-size: 12px;
    line-height: 0;
    background: var(--ha-card-background, #1a1e2b);
    border-radius: 50%;
  }

  .sunbar.night .sunbar-mark {
    color: var(--sst-muted);
  }

  .sunbar-ends {
    display: flex;
    justify-content: space-between;
    font-family: var(--sst-mono);
    font-size: calc(8.5px * var(--sst-scale));
    color: var(--sst-muted);
  }

  .ring-group {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 0 1 auto;
    min-width: 0;
  }

  /* A column is as wide as its drawing and no wider, whatever stands under
     it: a word that changes must not move the ring. */
  .meter-block {
    --meter-w: 66px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    flex: 0 0 var(--meter-w);
    width: var(--meter-w);
  }

  .meter {
    display: block;
    width: var(--meter-w);
    height: auto;
    flex: 0 0 auto;
  }

  /* The label is a fixed box centred under the column, wider than the column
     and allowed to stand out on both sides; two lines beat half a word. */
  .meter-label {
    display: flex;
    flex-direction: column;
    align-items: center;
    line-height: 1.25;
    text-align: center;
    width: calc(112px * var(--sst-scale));
    margin: 0 calc((var(--meter-w) - 112px * var(--sst-scale)) / 2);
  }

  .meter-value {
    font-size: calc(14px * var(--sst-scale));
    font-weight: 600;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }

  .meter-value small {
    font-family: var(--sst-mono);
    font-size: calc(9.5px * var(--sst-scale));
    font-weight: 400;
    color: var(--sst-muted);
  }

  /* The figure the column is measured against, where the column reaches it. */
  .meter-top {
    font-family: var(--sst-mono);
    font-size: calc(9px * var(--sst-scale));
    letter-spacing: 0.06em;
    color: var(--sst-muted);
    opacity: 0.6;
  }

  .meter-word {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-family: var(--sst-mono);
    font-size: calc(9.5px * var(--sst-scale));
    letter-spacing: 0.08em;
    color: var(--sst-muted);
  }

  .meter-glyph {
    width: calc(12px * var(--sst-scale));
    height: calc(12px * var(--sst-scale));
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
    opacity: 0.85;
  }

  .meter-label.up .meter-value {
    color: var(--sst-sun);
  }

  .meter-label.down .meter-value {
    color: var(--sst-grid);
  }

  .meter-label.idle .meter-value {
    color: var(--sst-muted);
  }

  .meter-zero {
    stroke: var(--sst-muted);
    stroke-width: 1;
    opacity: 0.45;
  }

  /* The instrument shows its value, not its empty scale. */
  .meter-off {
    fill: var(--sst-track);
    opacity: 0.3;
  }

  .meter-band {
    transition: y 0.5s ease, height 0.5s ease;
  }

  .meter-band.grid {
    fill: var(--sst-grid);
  }
  .meter-band.battery,
  .meter-band.discharge {
    fill: var(--sst-leaf);
  }
  .meter-band.import {
    fill: var(--sst-grid);
  }

  .meter-on {
    transition: height 0.5s ease, y 0.5s ease;
  }

  .meter-on.grid {
    fill: var(--sst-grid);
  }

  .meter-on.battery {
    fill: var(--sst-leaf);
  }

  .meter-on.import {
    fill: var(--sst-grid);
  }

  .meter-on.discharge {
    fill: var(--sst-leaf);
  }

  /* Not a warning colour — the same hue, simply held back until the surplus is
     worth acting on. A second meaning on one scale cannot be read. */
  .meter-on.held,
  .meter-band.held {
    opacity: 0.42;
  }

  .ring-block {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
  }

  .ring {
    display: block;
    width: 100%;
    height: auto;
    max-width: 200px;
  }

  .ring-day-track {
    fill: none;
    stroke: var(--sst-track);
    stroke-width: 5;
    opacity: 0.5;
  }

  .ring-day {
    fill: none;
    stroke-width: 5;
    opacity: 0.85;
    transition: stroke-dasharray 0.6s ease, stroke-dashoffset 0.6s ease;
  }

  .ring-track {
    fill: none;
    stroke: var(--sst-track);
    stroke-width: 11;
  }

  .seg {
    fill: none;
    stroke-width: 11;
    transition: stroke-dasharray 0.6s ease, stroke-dashoffset 0.6s ease;
  }

  .seg.solar {
    stroke: var(--sst-sun);
  }
  .seg.battery {
    stroke: var(--sst-leaf);
  }
  .seg.grid {
    stroke: var(--sst-grid);
  }
  /* Surplus ring: sun already claimed recedes, sun still free leads. Not so
     far that gold turns to brown — it still has to read as the same sun. */
  .seg.house {
    stroke: var(--sst-sun);
    stroke-opacity: 0.45;
  }

  .seg.free {
    stroke: var(--sst-grid);
  }

  .seg.single {
    stroke-linecap: round;
  }

  .ring-value {
    font-size: calc(34px * var(--sst-scale));
    font-weight: 700;
    letter-spacing: -0.03em;
    fill: var(--sst-ink);
  }

  .ring-value tspan {
    font-family: var(--sst-mono);
    font-size: calc(13px * var(--sst-scale));
    font-weight: 400;
    letter-spacing: 0;
    fill: var(--sst-muted);
  }

  /* A watermark, not a picture: it fills the ring without asking to be read. */
  .ring-mark {
    fill: var(--sst-ink);
    opacity: 0.075;
  }

  .ring-caption {
    font-family: var(--sst-mono);
    font-size: calc(10.5px * var(--sst-scale));
    letter-spacing: 0.12em;
    text-transform: uppercase;
    fill: var(--sst-muted);
  }

  /* A time is read, not shouted; and with its words it is the longest caption
     the ring carries, so it is set a size smaller to stay inside the hole. */
  .ring-caption.plain {
    font-size: calc(9px * var(--sst-scale));
    text-transform: none;
    letter-spacing: 0.03em;
  }

  .facts {
    display: flex;
    flex-direction: column;
    gap: 7px;
    width: 100%;
    max-width: 280px;
  }

  .fact {
    position: relative;
    display: flex;
    align-items: center;
    gap: 9px;
    font-size: calc(13.5px * var(--sst-scale));
    padding: 3px 6px;
    border-radius: 6px;
  }

  /* The row is the chart: bar width is the share of the largest value. */
  .bar {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    border-radius: 6px;
    opacity: 0.16;
    pointer-events: none;
    transition: width 0.6s ease;
  }

  .fact > :not(.bar) {
    position: relative;
  }

  .facts.inline {
    flex-direction: row;
    flex-wrap: wrap;
    justify-content: center;
    gap: 4px 14px;
    max-width: none;
  }

  .facts.inline .fact {
    padding: 0;
    gap: 6px;
    font-size: calc(12.5px * var(--sst-scale));
  }

  .facts.inline .fact-value {
    margin-left: 0;
  }

  .fact i {
    width: 9px;
    height: 9px;
    border-radius: 3px;
    flex: 0 0 auto;
  }

  .fact > .fact-value {
    flex: 0 0 auto;
  }

  .fact-label {
    color: var(--sst-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .fact-value {
    margin-left: auto;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .fact-unit {
    font-family: var(--sst-mono);
    font-size: calc(10.5px * var(--sst-scale));
    font-weight: 400;
    color: var(--sst-muted);
  }

  .ring-block.beside {
    flex-direction: row;
    flex-wrap: wrap;
    justify-content: center;
    gap: 18px 24px;
  }

  .ring-block.beside .ring {
    max-width: 178px;
    min-width: 132px;
  }

  .ring-block.beside .facts {
    flex: 1 1 190px;
    max-width: 240px;
    min-width: 0;
  }

  /* Only the automatic layout waits for room; the explicit ones do not. */
  @container (min-width: 380px) {
    .ring-block.auto {
      flex-direction: row;
      flex-wrap: wrap;
      justify-content: center;
      gap: 18px 24px;
    }

    .ring-block.auto .ring {
      max-width: 178px;
      min-width: 132px;
    }

    .ring-block.auto .facts {
      flex: 1 1 190px;
      max-width: 240px;
      min-width: 0;
    }
  }

  .row {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-top: 14px;
    border-top: 1px solid var(--sst-hairline);
  }

  .row-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 10px;
  }

  .row-title {
    font-family: var(--sst-mono);
    font-size: calc(10px * var(--sst-scale));
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--sst-muted);
  }

  .row-note {
    font-size: calc(13px * var(--sst-scale));
    color: var(--sst-ink);
  }

  .dim {
    color: var(--sst-muted);
  }

  /* The words are the legend: each one wears the colour of its line. */
  .key-solar {
    color: var(--sst-sun);
  }

  .unit {
    font-family: var(--sst-mono);
    font-size: calc(10.5px * var(--sst-scale));
    color: var(--sst-muted);
  }

  .key-house {
    color: var(--sst-ink);
    opacity: 0.8;
  }

  svg.full {
    display: block;
    width: 100%;
    height: auto;
    overflow: visible;
  }

  .prod-area {
    fill: var(--sst-sun);
    opacity: 0.2;
  }

  .prod-area.graded {
    opacity: 1;
  }

  .prod-bar {
    fill: var(--sst-sun);
    opacity: 0.75;
  }

  .prod-line {
    fill: none;
    stroke: var(--sst-sun);
    stroke-width: 2.5;
    stroke-linejoin: round;
    stroke-linecap: round;
  }

  .cons-line {
    fill: none;
    stroke: var(--sst-ink);
    stroke-width: 2.2;
    stroke-linejoin: round;
    stroke-linecap: round;
  }

  .nowline {
    stroke: var(--sst-muted);
    stroke-width: 1;
    stroke-dasharray: 2 3;
  }

  .gridline {
    stroke: var(--sst-hairline);
    stroke-width: 1;
  }

  .gridlabel {
    font-family: var(--sst-mono);
    font-size: calc(9.5px * var(--sst-scale));
    fill: var(--sst-muted);
  }

  .axis {
    font-family: var(--sst-mono);
    font-size: calc(10px * var(--sst-scale));
    fill: var(--sst-muted);
  }

  /* The casing has to read against the cells it holds, and the divider colour
     is too close to the card to do that. */
  .bat-shell {
    fill: none;
    stroke: var(--sst-muted);
    stroke-width: 2;
    opacity: 0.55;
  }

  .bat-cap {
    fill: var(--sst-muted);
    opacity: 0.55;
  }

  .bat-fill {
    transition: width 0.6s ease, fill 0.6s ease;
  }

  .fill-leaf {
    fill: var(--sst-leaf);
  }
  .fill-sun {
    fill: var(--sst-sun);
  }
  .fill-grid {
    fill: var(--sst-grid);
  }
  .fill-off {
    fill: var(--sst-track);
  }

  .today {
    margin: 2px -16px 0;
    padding: 14px 16px 15px;
    background: var(--sst-inset);
    border-top: 1px solid var(--sst-hairline);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  /* A day in credit is worth a hairline of its own. */
  .today.earning {
    box-shadow: inset 0 2px 0 -1px var(--sst-leaf);
  }

  .money {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }

  .money-v {
    font-size: calc(30px * var(--sst-scale));
    font-weight: 700;
    letter-spacing: -0.03em;
    line-height: 1;
  }

  .money-v.plus {
    color: var(--sst-leaf);
  }

  .money-v.minus {
    color: var(--sst-ink);
  }

  .money-v small {
    font-family: var(--sst-mono);
    font-weight: 400;
    font-size: calc(13px * var(--sst-scale));
    color: var(--sst-muted);
  }

  .corner {
    margin-left: auto;
    font-family: var(--sst-mono);
    font-size: calc(9.5px * var(--sst-scale));
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--sst-ink);
    white-space: nowrap;
    align-self: flex-start;
  }

  /* The month, small under the day: the same sign, a longer breath. */
  .money-month {
    display: block;
    font-family: var(--sst-mono);
    font-size: calc(10.5px * var(--sst-scale));
    letter-spacing: 0.04em;
    color: var(--sst-muted);
    margin-top: 5px;
  }

  .money-month b {
    color: var(--sst-ink);
    font-weight: 500;
  }

  /* Not bought against sold: two colours for two kinds of money. */
  .split {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .split-bar {
    display: flex;
    height: 6px;
    border-radius: 3px;
    overflow: hidden;
    background: var(--sst-track);
  }

  .split-bar span {
    transition: width 0.6s ease;
  }

  .split-bar .saved {
    background: var(--sst-leaf);
  }

  .split-bar .sold {
    background: var(--sst-sun);
  }

  .split-keys {
    display: flex;
    gap: 14px;
    flex-wrap: wrap;
    font-family: var(--sst-mono);
    font-size: calc(10.5px * var(--sst-scale));
    color: var(--sst-muted);
  }

  .split-keys span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .split-keys i {
    width: 8px;
    height: 8px;
    border-radius: 2px;
  }

  .split-keys b {
    color: var(--sst-ink);
    font-weight: 500;
  }

  /* How far along, and how far to go, in years as well as percent. */
  .payoff {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .payoff-bar {
    height: 6px;
    border-radius: 3px;
    background: var(--sst-track);
    overflow: hidden;
  }

  .payoff-bar span {
    display: block;
    height: 100%;
    background: var(--sst-leaf);
    transition: width 0.6s ease;
  }

  .payoff-line {
    font-family: var(--sst-mono);
    font-size: calc(9.5px * var(--sst-scale));
    letter-spacing: 0.04em;
    color: var(--sst-muted);
  }

  .payoff-line b {
    color: var(--sst-ink);
    font-weight: 500;
  }

  .money-k {
    font-family: var(--sst-mono);
    font-size: calc(9.5px * var(--sst-scale));
    letter-spacing: 0.13em;
    text-transform: uppercase;
    color: var(--sst-muted);
    text-align: right;
    line-height: 1.5;
  }

  .stats {
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }

  .origin {
    display: flex;
    flex-direction: column;
    gap: 7px;
  }

  .origin-bar {
    display: flex;
    height: 7px;
    border-radius: 4px;
    overflow: hidden;
    background: var(--sst-track);
  }

  .origin-bar span {
    transition: width 0.6s ease;
  }

  .origin-keys {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 14px;
    font-family: var(--sst-mono);
    font-size: calc(10.5px * var(--sst-scale));
    color: var(--sst-muted);
  }

  .origin-keys span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .origin-keys i {
    width: 8px;
    height: 8px;
    border-radius: 2px;
  }

  .origin-keys b {
    color: var(--sst-ink);
    font-weight: 500;
  }

  .stat {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .stat-k {
    font-family: var(--sst-mono);
    font-size: calc(9.5px * var(--sst-scale));
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--sst-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .stat-v {
    font-size: calc(15px * var(--sst-scale));
    font-weight: 600;
    letter-spacing: -0.02em;
  }

  .stat-v small {
    font-family: var(--sst-mono);
    font-weight: 400;
    font-size: calc(10px * var(--sst-scale));
    color: var(--sst-muted);
  }

  .warn {
    padding: 16px;
    color: var(--sst-muted);
    font-size: calc(14px * var(--sst-scale));
  }

  @media (prefers-reduced-motion: reduce) {
    .seg,
    .bat-fill {
      transition: none;
    }
  }

  /* With no list beside it the pair has the whole card to itself; on a tablet
     across the room the extra size is the whole point. */
  @container (min-width: 360px) {
    .ring-group.solo {
      gap: 26px;
    }

    .ring-group.solo .ring {
      max-width: 248px;
    }

    .ring-group.solo .meter-block {
      --meter-w: 82px;
    }
  }

  /* A chosen size beats the automatic one, whatever the room. */
  .ring-group.size-s .ring {
    max-width: 168px;
  }

  .ring-group.size-s .meter-block {
    --meter-w: 60px;
  }

  .ring-group.size-m .ring {
    max-width: 200px;
  }

  .ring-group.size-m .meter-block {
    --meter-w: 66px;
  }

  .ring-group.size-l .ring {
    max-width: 252px;
  }

  .ring-group.size-l .meter-block {
    --meter-w: 82px;
  }

  /* The day views share one palette with everything else on the card. */
  .day-band, .day-cell {
    transition: fill 0.4s ease, background 0.4s ease;
  }

  .day-band.solar { fill: var(--sst-sun); }
  .day-band.battery { fill: var(--sst-leaf); }
  .day-band.grid { fill: var(--sst-grid); }
  .day-band.empty { fill: var(--sst-track); opacity: 0.35; }

  .day-now {
    stroke: var(--sst-ink);
    stroke-width: 1.4;
    opacity: 0.8;
  }

  .origin-bar.band { gap: 1px; }

  .day-cell { display: block; height: 100%; }
  .day-cell.solar { background: var(--sst-sun); }
  .day-cell.battery { background: var(--sst-leaf); }
  .day-cell.grid { background: var(--sst-grid); }
  .day-cell.empty { background: var(--sst-track); opacity: 0.4; }

  .origin-hours {
    display: flex;
    justify-content: space-between;
    font-family: var(--sst-mono);
    font-size: calc(8.5px * var(--sst-scale));
    color: var(--sst-muted);
    margin-top: 3px;
  }

  .clock-hour {
    fill: none;
    stroke-width: 11;
  }

  .clock-hour.solar { stroke: var(--sst-sun); }
  .clock-hour.battery { stroke: var(--sst-leaf); }
  .clock-hour.grid { stroke: var(--sst-grid); }
  .clock-hour.empty { stroke: var(--sst-track); opacity: 0.5; }

  .clock-now {
    fill: var(--sst-ink);
    opacity: 0.9;
  }

  /* The day outside, now inside: the outer band is a memory, so it is thinner. */
  .clock-hour.out {
    stroke-width: 5;
  }

  /* The night around the ring: how far it has come, and how much is left. */
  .night-track {
    fill: none;
    stroke: var(--sst-track);
    stroke-width: 5;
    opacity: 0.35;
  }

  .night-arc {
    fill: none;
    stroke: var(--sst-muted);
    stroke-width: 5;
    opacity: 0.75;
    transition: stroke-dasharray 0.6s ease;
  }

  /* The charge as a thin ring inside the sources: a level, not a share. */
  .ring-soc-track {
    fill: none;
    stroke: var(--sst-track);
    stroke-width: 4;
    opacity: 0.5;
  }

  .ring-soc {
    fill: none;
    stroke: var(--sst-leaf);
    stroke-width: 4;
    transition: stroke-dasharray 0.6s ease;
  }

  /* Where the centre stands in its round. */
  .ring-dots circle {
    fill: var(--sst-muted);
    opacity: 0.35;
  }

  .ring-dots circle.on {
    fill: var(--sst-ink);
    opacity: 0.8;
  }

  .ring.cycle {
    cursor: pointer;
  }

  .ring.cycle:focus-visible {
    outline: 2px solid var(--sst-sun);
    outline-offset: 2px;
    border-radius: 50%;
  }

  .bal-track {
    fill: var(--sst-track);
    opacity: 0.3;
  }

  .bal-roof { fill: var(--sst-sun); }
  .bal-house { fill: var(--sst-house, var(--sst-muted)); opacity: 0.85; }

  .ring-day.faint {
    opacity: 0.28;
  }

  .ring-curve {
    fill: none;
    stroke: var(--sst-muted);
    stroke-width: 2.4;
    stroke-linejoin: round;
    stroke-linecap: round;
    opacity: 0.32;
  }

  .meter-swing {
    opacity: 0.32;
  }

  /* Both ways across the meter, so both wear the grid. The direction is the
     half of the track it sits in. */
  .meter-swing.up { fill: var(--sst-grid); }
  .meter-swing.down { fill: var(--sst-grid); }

  .clock-mark {
    fill: var(--sst-muted);
    stroke: var(--sst-muted);
    stroke-width: 1.3;
    stroke-linecap: round;
    opacity: 0.55;
  }

  .clock-mark.sun path { fill: none; }
  .clock-mark.moon { stroke: none; }

  .tap {
    cursor: pointer;
  }

  .tap:focus-visible {
    outline: 2px solid var(--sst-sun);
    outline-offset: 2px;
    border-radius: 3px;
  }

  /* Last week, behind this week: the same hue, far enough back that it reads
     as a memory rather than as a second measurement. */
  .earlier-line {
    fill: none;
    stroke: var(--sst-sun);
    stroke-width: 1.6;
    stroke-dasharray: 3 3;
    opacity: 0.4;
  }

  /* What is still to come stands where it will stand, drawn as an outline
     because it is not there yet. */
  .prod-ghost {
    fill: none;
    stroke: var(--sst-sun);
    stroke-width: 1.2;
    stroke-dasharray: 3 2;
    opacity: 0.55;
  }

  .ghost-line {
    fill: none;
    stroke: var(--sst-sun);
    stroke-width: 1.6;
    stroke-dasharray: 3 2;
    opacity: 0.5;
  }

  /* The best day is a memory of the year: further back than last week. */
  .best-line {
    fill: none;
    stroke: var(--sst-sun);
    stroke-width: 1.4;
    stroke-dasharray: 2 2.5;
    opacity: 0.6;
  }

  /* Who carried each hour, under the day: the grid at the foot, the battery
     on it, in the colours the ring uses for the same two. */
  .layer-grid {
    fill: var(--sst-grid);
    opacity: 0.22;
  }

  .layer-battery {
    fill: var(--sst-leaf);
    opacity: 0.22;
  }

  /* Seven days: bars for the roof, a dot above each for how much of the house
     it carried. Today is bright; the others have already happened. */
  .week-bar {
    fill: var(--sst-sun);
    opacity: 0.45;
    cursor: pointer;
    transition: opacity 0.3s ease;
  }

  .week-bar.today,
  .week-bar.picked {
    opacity: 1;
  }

  .week-hit {
    fill: transparent;
    cursor: pointer;
  }

  .week-dot.good {
    fill: var(--sst-leaf);
  }

  .week-dot.weak {
    fill: var(--sst-grid);
  }

  .week-dot.faint {
    opacity: 0.55;
  }

  .week-label {
    font-family: var(--sst-mono);
    font-size: calc(9px * var(--sst-scale));
    fill: var(--sst-muted);
  }

  .week-label.today {
    fill: var(--sst-ink);
  }

  .meter-mark {
    fill: none;
    stroke: var(--sst-muted);
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
    opacity: 0.5;
  }

  /* The reserve is full of power that never comes out, so it is drawn as
     not coming out rather than marked with a line across the bar. */
  .bat-fill.held {
    opacity: 0.28;
  }

  .bat-held {
    fill: var(--sst-bg, #000);
    opacity: 0.55;
  }

  /* What the night will use stands back; what the morning keeps stays bright. */
  .bat-fill.night {
    opacity: 0.6;
  }

  .bat-night {
    fill: var(--ha-card-background, #000);
    opacity: 0.6;
  }

  /* The charge over the night: what happened as a line, what will happen
     dashed, and the floor of the reserve to read both against. */
  .bat-curve {
    fill: none;
    stroke: var(--sst-leaf);
    stroke-width: 2;
    stroke-linejoin: round;
    stroke-linecap: round;
  }

  .bat-curve.ahead {
    stroke-dasharray: 3 3;
    opacity: 0.6;
  }

  .bat-curve-floor {
    stroke: var(--sst-hairline);
    stroke-width: 1;
  }

  .bat-curve-now {
    stroke: var(--sst-muted);
    stroke-width: 1;
    stroke-dasharray: 2 3;
  }

  .bat-curve-label {
    font-family: var(--sst-mono);
    font-size: calc(9px * var(--sst-scale));
    fill: var(--sst-muted);
  }

  .bat-sun {
    fill: var(--sst-sun);
    stroke: var(--sst-sun);
    stroke-width: 1.2;
    stroke-linecap: round;
  }

  .bat-sun path {
    fill: none;
  }

  .bat-extra {
    fill: var(--sst-ink);
    font-size: calc(15px * var(--sst-scale));
    font-weight: 600;
    letter-spacing: -0.02em;
  }

  .bat-extra-k {
    fill: var(--sst-muted);
    font-family: var(--sst-mono);
    font-size: calc(9.5px * var(--sst-scale));
    letter-spacing: 0.06em;
  }

  /* The figure, not the picture: the bar already says how full it is. */
  .row-pct {
    margin-left: 10px;
    font-size: calc(13px * var(--sst-scale));
    font-weight: 600;
    letter-spacing: -0.01em;
    color: var(--sst-ink);
  }

  .bat-pct {
    fill: var(--sst-ink);
    font-size: calc(26px * var(--sst-scale));
    font-weight: 700;
    letter-spacing: -0.03em;
  }

  .bat-pct tspan {
    font-family: var(--sst-mono);
    font-size: calc(11px * var(--sst-scale));
    font-weight: 400;
    fill: var(--sst-muted);
  }

  /* Where the power goes: the house split by device, in the house's own
     colour. Brightness tells the segments apart; no hue is spent here. */
  .wohin-bar {
    display: flex;
    gap: 2px;
    height: 8px;
    border-radius: 4px;
    overflow: hidden;
    background: var(--sst-track);
    margin-top: 2px;
  }
  .wohin-style-both .wohin-bar {
    height: 16px;
  }
  .wohin-seg {
    position: relative;
    background: var(--sst-ink);
    transition: width 0.6s ease;
  }
  .wohin-seg.rest {
    background: transparent;
  }
  .wohin-keys {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 14px;
    margin-top: 8px;
    font-family: var(--sst-mono);
    font-size: calc(10.5px * var(--sst-scale));
    color: var(--sst-muted);
  }
  .wohin-keys span {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .wohin-keys ha-icon {
    --mdc-icon-size: 14px;
    color: var(--sst-muted);
  }
  .wohin-keys b {
    color: var(--sst-ink);
    font-weight: 500;
  }
  .wohin-keys .rest {
    opacity: 0.6;
  }
  .wohin-icons {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    align-items: flex-end;
    margin-top: 6px;
  }
  .dev {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    color: var(--sst-ink);
    --mdc-icon-size: 20px;
  }
  /* The level is a short bar under the icon, so the icon stays an icon. */
  .dev .lvl {
    display: block;
    width: 28px;
    height: 4px;
    border-radius: 2px;
    background: var(--sst-track);
    position: relative;
    overflow: hidden;
  }
  .dev .lvl b {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    display: block;
    background: var(--sst-ink);
  }
  .dev small {
    font-family: var(--sst-mono);
    font-size: calc(9.5px * var(--sst-scale));
    color: var(--sst-muted);
  }
  .dev.off {
    opacity: 0.32;
  }

  /* The biggest device as a row of its own: what it is, since when, what it cost. */
  .wohin-top {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-radius: 9px;
    background: var(--sst-inset);
    margin-top: 4px;
    --mdc-icon-size: 22px;
  }

  .wohin-top-name {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    font-size: calc(13px * var(--sst-scale));
    font-weight: 500;
  }

  .wohin-top-name small {
    font-family: var(--sst-mono);
    font-size: calc(9.5px * var(--sst-scale));
    font-weight: 400;
    color: var(--sst-muted);
  }

  .wohin-top b {
    font-size: calc(17px * var(--sst-scale));
    font-weight: 600;
    letter-spacing: -0.02em;
    white-space: nowrap;
  }

  /* Tiles: readable from across the room, the biggest first. */
  .wohin-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
    gap: 8px;
    margin-top: 6px;
  }

  .tile {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px 10px;
    border-radius: 9px;
    background: var(--sst-inset);
    min-width: 0;
    --mdc-icon-size: 18px;
    color: var(--sst-muted);
  }

  .tile.room {
    cursor: pointer;
  }

  .tile-name {
    font-family: var(--sst-mono);
    font-size: calc(9.5px * var(--sst-scale));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tile b {
    font-size: calc(15px * var(--sst-scale));
    font-weight: 600;
    letter-spacing: -0.02em;
    color: var(--sst-ink);
  }

  .tile.off {
    opacity: 0.4;
  }

  /* Rows with a line each: the last hour of every device. */
  .wohin-rows {
    display: flex;
    flex-direction: column;
    margin-top: 6px;
  }

  .wohin-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 5px 0;
    border-bottom: 1px solid var(--sst-hairline);
    --mdc-icon-size: 16px;
    color: var(--sst-muted);
  }

  .wohin-row.room {
    cursor: pointer;
  }

  .wohin-row-name {
    flex: 1;
    min-width: 0;
    font-size: calc(12.5px * var(--sst-scale));
    color: var(--sst-ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .wohin-row b {
    font-family: var(--sst-mono);
    font-size: calc(11px * var(--sst-scale));
    font-weight: 500;
    color: var(--sst-ink);
    white-space: nowrap;
    min-width: 54px;
    text-align: right;
  }

  .wohin-row.rest {
    opacity: 0.6;
  }

  .spark {
    width: 60px;
    height: 18px;
    flex: 0 0 auto;
  }

  .spark polyline {
    fill: none;
    stroke: var(--sst-sun);
    stroke-width: 1.4;
    stroke-linejoin: round;
    stroke-linecap: round;
  }

  /* A room opened: the devices standing in it, one step in. */
  .wohin-keys .room,
  .wohin-keys .room b {
    cursor: pointer;
  }

  .wohin-sub {
    display: flex;
    flex-wrap: wrap;
    gap: 3px 12px;
    padding: 3px 0 4px 14px;
    font-family: var(--sst-mono);
    font-size: calc(9.5px * var(--sst-scale));
    color: var(--sst-muted);
    width: 100%;
  }

  .wohin-sub b {
    color: var(--sst-ink);
    font-weight: 500;
  }

  /* The battery column wears the battery’s colour whichever way it moves. */
  .meter-label.leaf .meter-value {
    color: var(--sst-leaf);
  }

  /* The share graded: below half the grid carries the house, up to eighty
     the sun does with help, above that the house is its own. */
  .fill-share-low,
  .meter-label.share-low .meter-value {
    fill: var(--sst-grid);
    color: var(--sst-grid);
  }

  .fill-share-mid,
  .meter-label.share-mid .meter-value {
    fill: var(--sst-sun);
    color: var(--sst-sun);
  }

  .fill-share-good,
  .meter-label.share-good .meter-value {
    fill: var(--sst-leaf);
    color: var(--sst-leaf);
  }

  /* A wave through the cells: each one breathes a little later than the
     one before, so the eye reads a direction. Towards the cap while charging,
     back from it while discharging; nothing moves while the battery rests. */
  @keyframes bat-wave {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.45; }
  }

  .bat-flow .bat-fill.cell {
    animation: bat-wave 4.2s ease-in-out infinite;
    animation-delay: calc(var(--i, 0) * 0.28s);
  }

  .bat-flow.discharging .bat-fill.cell {
    animation-delay: calc(var(--i, 0) * -0.28s);
  }

  @media (prefers-reduced-motion: reduce) {
    .bat-flow .bat-fill.cell {
      animation: none;
    }
  }

  /* The night as a column: what has passed is spent, what the battery reaches
     is its own colour, and what is left over is the grid's, because that is
     who will supply it. */
  .night-past {
    fill: var(--sst-track);
    opacity: 0.55;
  }
  .night-reach {
    fill: var(--sst-leaf);
  }
  .night-short {
    fill: var(--sst-grid);
    opacity: 0.45;
  }
  .night-now {
    stroke: var(--sst-ink);
    stroke-width: 1.4;
    opacity: 0.85;
  }
  .night-tick {
    stroke: var(--sst-muted);
    stroke-width: 1;
    opacity: 0.6;
  }
  .night-hour {
    font-family: var(--sst-mono);
    font-size: 11px;
    fill: var(--sst-muted);
  }

  /* A dashed line across a column marks a level the column will reach. */
  .range-mark {
    stroke: var(--sst-ink);
    stroke-width: 1.5;
    stroke-dasharray: 3 3;
    opacity: 0.8;
  }

  /* The devices as a column: a narrow list, the house's own colour. */
  /* The devices column is a list, so its block is as wide as the list. */
  .ring-group .meter-block.wide {
    --meter-w: calc(118px * var(--sst-scale));
  }

  .devs {
    display: flex;
    flex-direction: column;
    gap: 5px;
    width: calc(118px * var(--sst-scale));
    font-family: var(--sst-mono);
    font-size: calc(10px * var(--sst-scale));
    color: var(--sst-muted);
  }
  .devs .dev-row {
    display: flex;
    justify-content: space-between;
    gap: 6px;
    padding-bottom: 4px;
    border-bottom: 1px solid var(--sst-hairline);
  }
  .devs .dev-row span:first-child {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
  .devs b {
    color: var(--sst-ink);
    font-weight: 500;
    white-space: nowrap;
  }
  .devs .rest {
    opacity: 0.6;
  }

  /* The scale: one needle laid flat, draw to the left, surplus to the right. */
  .scale {
    width: 100%;
    max-width: 300px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .scale-track {
    fill: var(--sst-track);
    opacity: 0.3;
  }
  .scale-on.grid {
    fill: var(--sst-sun);
  }
  .scale-on.battery {
    fill: var(--sst-leaf);
  }
  .scale-on.import {
    fill: var(--sst-grid);
  }
  .scale-on.discharge {
    fill: var(--sst-leaf);
  }
  .scale-zero {
    stroke: var(--sst-muted);
    stroke-width: 1;
    opacity: 0.6;
  }
  .scale-ends {
    display: flex;
    justify-content: space-between;
    font-family: var(--sst-mono);
    font-size: calc(9px * var(--sst-scale));
    letter-spacing: 0.08em;
    color: var(--sst-muted);
  }
  .scale-ends .meter-glyph {
    vertical-align: -2px;
  }
  .scale-value {
    text-align: center;
    font-size: calc(14px * var(--sst-scale));
    font-weight: 600;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }
  .scale-value small {
    font-family: var(--sst-mono);
    font-size: calc(9.5px * var(--sst-scale));
    font-weight: 400;
    color: var(--sst-muted);
  }
  .scale-value .meter-word {
    margin-left: 8px;
  }
  .scale.up .scale-value {
    color: var(--sst-sun);
  }
  .scale.down .scale-value {
    color: var(--sst-grid);
  }
  .scale.idle .scale-value {
    color: var(--sst-muted);
  }

  /* At night the chip stays bright; everything under it steps back. */
  ha-card.night > :not(.head) {
    opacity: var(--sst-night, 1);
  }

  /* Wide: the ring keeps the left, the day takes the right. The inset panel
     no longer bleeds to the card's edges, since it has a column to sit in. */
  ha-card.wide {
    display: grid;
    grid-template-columns: minmax(280px, 1fr) minmax(300px, 1.5fr);
    grid-template-rows: auto 1fr;
    column-gap: 24px;
    padding-bottom: 16px;
  }

  ha-card.wide > .head,
  ha-card.wide > .sunbar {
    grid-column: 1 / -1;
  }

  ha-card.wide > .side {
    grid-column: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  ha-card.wide > .main {
    grid-column: 2;
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-width: 0;
  }

  ha-card.wide .main > .row:first-child {
    border-top: 0;
    padding-top: 0;
  }

  ha-card.wide .today {
    margin: 0;
    border-radius: 10px;
    border-top: 0;
  }

  /* Compact: one row that says "all is well" and leaves the rest to a tap. */
  .compact {
    display: flex;
    align-items: center;
    gap: 14px;
    padding-bottom: 16px;
  }

  .compact .ring-block {
    flex: 0 0 auto;
  }

  .compact .ring {
    max-width: 96px;
    min-width: 88px;
  }

  .compact .ring-value {
    font-size: calc(30px * var(--sst-scale));
  }

  .compact-stats {
    flex: 1;
    display: flex;
    justify-content: space-around;
    gap: 10px;
    min-width: 0;
  }

  .compact-stats .stat-v {
    white-space: nowrap;
  }

  .compact-stats .stat-v.sun {
    color: var(--sst-sun);
  }

  .compact-stats .stat-v.grid {
    color: var(--sst-grid);
  }

  .compact-stats .stat-v.leaf {
    color: var(--sst-leaf);
  }
`;
