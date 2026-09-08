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

  .ring-group {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 0 1 auto;
    min-width: 0;
  }

  .meter-block {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    flex: 0 0 auto;
  }

  .meter {
    display: block;
    width: 66px;
    height: auto;
    flex: 0 0 auto;
  }

  .meter-label {
    display: flex;
    flex-direction: column;
    align-items: center;
    line-height: 1.25;
    text-align: center;
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

  .meter-word {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-family: var(--sst-mono);
    font-size: calc(9.5px * var(--sst-scale));
    letter-spacing: 0.08em;
    color: var(--sst-muted);
    white-space: nowrap;
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

  .bat-shell {
    fill: none;
    stroke: var(--sst-track);
    stroke-width: 1.5;
    opacity: 0.7;
  }

  .bat-cap {
    fill: var(--sst-track);
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

  .bat-pct {
    font-size: calc(23px * var(--sst-scale));
    font-weight: 700;
    letter-spacing: -0.02em;
    fill: var(--sst-ink);
  }

  .bat-pct tspan {
    font-family: var(--sst-mono);
    font-weight: 400;
    font-size: calc(11px * var(--sst-scale));
    fill: var(--sst-muted);
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

    .ring-group.solo .meter {
      width: 82px;
    }
  }

  /* A chosen size beats the automatic one, whatever the room. */
  .ring-group.size-s .ring {
    max-width: 168px;
  }

  .ring-group.size-s .meter {
    width: 60px;
  }

  .ring-group.size-m .ring {
    max-width: 200px;
  }

  .ring-group.size-m .meter {
    width: 66px;
  }

  .ring-group.size-l .ring {
    max-width: 252px;
  }

  .ring-group.size-l .meter {
    width: 82px;
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
    opacity: 0.16;
  }

  .meter-swing.up { fill: var(--sst-sun); }
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

  .meter-mark {
    fill: none;
    stroke: var(--sst-muted);
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
    opacity: 0.5;
  }

  /* Where the reserve begins: below it the bar is full of power that never
     comes out, which a plain bar cannot say. */
  .bat-reserve {
    stroke: var(--sst-ink);
    stroke-width: 1.6;
    stroke-dasharray: 3 3;
    opacity: 0.55;
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
`;
