import fs from "node:fs";

const here = new URL(".", import.meta.url).pathname.replace(/^\//, "");
const bundle = fs.readFileSync(here + "../dist/power-origin-card.js", "utf8");

const HARNESS = `
/* A capture may set globalThis.__at = "22:30" before the card loads; the
   clock then reads that time today, and the day’s statistics run up to it. */
(() => {
  const Real = Date;
  const at = globalThis.__at;
  if (!at) return;
  const [h, m] = at.split(":").map(Number);
  const target = new Real(); target.setHours(h, m, 0, 0);
  const offset = target.getTime() - Real.now();
  globalThis.Date = class extends Real {
    constructor(...args) { if (args.length) super(...args); else super(Real.now() + offset); }
    static now() { return Real.now() + offset; }
  };
})();
const KEYS = [
  "house", "solar", "battery_power", "battery_soc", "grid_power", "solar_today",
  "house_today", "export_today", "import_today", "forecast", "cost_today",
  "battery_out_today", "cost_export_today", "cost_import_today", "amortisation",
  "price_import", "price_export"
];

let seq = 0;
const freshIds = () => {
  const n = seq++;
  return Object.fromEntries(KEYS.map((k) => [k, "sensor." + k + "_" + n]));
};

const entity = (id, state, unit, dc) => ({
  entity_id: id, state: String(state),
  attributes: { unit_of_measurement: unit, device_class: dc }
});

function sun() {
  const rise = new Date(); rise.setHours(6, 28, 0, 0);
  const set = new Date(); set.setHours(19, 36, 0, 0);
  return {
    entity_id: "sun.sun", state: globalThis.__night ? "below_horizon" : "above_horizon",
    attributes: {
      next_rising: new Date(rise.getTime() + 86400000).toISOString(),
      next_setting: set.toISOString()
    }
  };
}

function profile(hour, weak) {
  const daylight = Math.max(0, Math.sin(((hour - 6.5) / 13) * Math.PI));
  const clouds = hour > 13 ? 0.4 + 0.3 * Math.abs(Math.sin(hour * 4.1)) : 1;
  const pv = daylight * (weak ? 1500 : 8200) * clouds;
  const house = 950 + 750 * Math.abs(Math.sin(hour * 1.7)) + (hour > 17 ? 900 : 0);
  const battery = hour < 7 || hour > 18
    ? Math.min(house, 1300)
    : -Math.max(0, (pv - house) * 0.45);
  const grid = house - Math.max(0, pv) - Math.max(0, battery);
  return { pv, house, battery, grid };
}

/* The screenshots must not depend on the hour they were taken, so the day runs
   from midnight to a fixed evening rather than to now. */
const UNTIL = new Date().getHours() + new Date().getMinutes() / 60;

function stats(ids, map, weak) {
  const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
  const out = {};
  for (const id of ids) {
    const rows = [];
    for (let m = 0; m <= UNTIL * 60; m += 5) {
      const hour = m / 60;
      const p = profile(hour, weak);
      const value =
        id === map.solar ? p.pv
        : id === map.grid_power ? p.grid
        : id === map.battery_power ? p.battery
        : globalThis.__dev && id in globalThis.__dev ? globalThis.__dev[id]
        : p.house;
      rows.push({ start: midnight.getTime() + m * 60000, mean: value, max: value * 1.1 });
    }
    out[id] = rows;
  }
  return out;
}

function hass(ids, s, weak) {
  return {
    states: {
      "sun.sun": sun(),
      [ids.house]: entity(ids.house, s.house, "W", "power"),
      [ids.solar]: entity(ids.solar, s.pv, "W", "power"),
      [ids.battery_power]: entity(ids.battery_power, s.battery, "W", "power"),
      [ids.battery_soc]: entity(ids.battery_soc, s.soc, "%", "battery"),
      [ids.grid_power]: entity(ids.grid_power, s.grid, "W", "power"),
      [ids.solar_today]: entity(ids.solar_today, s.solarToday, "kWh", "energy"),
      [ids.house_today]: entity(ids.house_today, s.houseToday, "kWh", "energy"),
      [ids.export_today]: entity(ids.export_today, s.exportToday, "kWh", "energy"),
      [ids.import_today]: entity(ids.import_today, s.importToday, "kWh", "energy"),
      [ids.forecast]: entity(ids.forecast, s.forecast, "kWh", "energy"),
      [ids.cost_today]: entity(ids.cost_today, s.cost, "EUR", "monetary"),
      [ids.battery_out_today]: entity(ids.battery_out_today, s.batteryOut, "kWh", "energy"),
      [ids.cost_export_today]: entity(ids.cost_export_today, s.moneyOut, "EUR", "monetary"),
      [ids.cost_import_today]: entity(ids.cost_import_today, s.moneyIn, "EUR", "monetary"),
      [ids.amortisation]: entity(ids.amortisation, s.paid, "%", null),
      [ids.price_import]: entity(ids.price_import, 0.29, "EUR/kWh", "monetary"),
      [ids.price_export]: entity(ids.price_export, 0.08, "EUR/kWh", "monetary")
    },
    locale: { language: "en" },
    async callWS(message) {
      if (message.type !== "recorder/statistics_during_period") return {};
      return stats(message.statistic_ids || [], ids, weak);
    },
    async callApi() { return {}; }
  };
}

const MIDDAY = {
  house: 2300, pv: 8100, battery: -2600, grid: -3200, soc: 64,
  solarToday: 38.4, houseToday: 14.1, exportToday: 16.8, importToday: 0.5,
  forecast: 11.2, cost: -3.18, batteryOut: 3.4,
  moneyOut: 3.42, moneyIn: 0.24, paid: 31
};

const EVENING = {
  house: 1240, pv: 0, battery: 1240, grid: 0, soc: 71,
  solarToday: 41.6, houseToday: 21.3, exportToday: 18.2, importToday: 0.4,
  forecast: 0, cost: -2.74, batteryOut: 6.8,
  moneyOut: 3.02, moneyIn: 0.28, paid: 31
};

const GREY = {
  house: 3100, pv: 980, battery: 420, grid: 1700, soc: 22,
  solarToday: 4.8, houseToday: 18.9, exportToday: 0, importToday: 9.6,
  forecast: 1.4, cost: 2.86, batteryOut: 2.1,
  moneyOut: 0.02, moneyIn: 2.88, paid: 31
};

const STATES = { MIDDAY, EVENING, GREY };

function place(target, config, stateName, weak) {
  const ids = freshIds();
  const el = document.createElement("power-origin-card");
  el.setConfig({
    type: "custom:power-origin-card",
    battery_capacity: 13100,
    battery_reserve: 15,
    entities: { ...ids },
    ...config
  });
  el.hass = hass(ids, STATES[stateName], weak);
  target.append(el);
}
`;

/* `pre` runs before the card loads: the place to set __night or __at. */
const page = (body, width, pre = "") => `<title>0</title>
<script>${pre}</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500&display=swap">
<script>
  /* Home Assistant provides ha-icon; the capture page stands in for it with
     the same Material Design icons, fetched by name. */
  customElements.define("ha-icon", class extends HTMLElement {
    static get observedAttributes() { return ["icon"]; }
    attributeChangedCallback() { this.load(); }
    connectedCallback() { this.load(); }
    async load() {
      const name = (this.getAttribute("icon") || "").replace(/^mdi:/, "");
      if (!name || this.dataset.loaded === name) return;
      this.dataset.loaded = name;
      const r = await fetch("https://cdn.jsdelivr.net/npm/@mdi/svg@7.4.47/svg/" + name + ".svg");
      if (!r.ok) return;
      this.innerHTML = await r.text();
      const svg = this.querySelector("svg");
      if (svg) { svg.style.width = "var(--mdc-icon-size, 24px)"; svg.style.height = "var(--mdc-icon-size, 24px)"; svg.style.fill = "currentColor"; svg.style.display = "block"; }
      this.style.display = "inline-block";
    }
  });
</script>
<style>
  :root {
    color-scheme: dark;
    --ha-card-background: #1A1E2B;
    --primary-text-color: #EEF0F7;
    --secondary-text-color: #868DA8;
    --divider-color: #2A3143;
    --energy-solar-color: #FFB020;
    --energy-battery-out-color: #4ECDC4;
    --energy-grid-consumption-color: #6E93D6;
    --code-font-family: "IBM Plex Mono", ui-monospace, monospace;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 16px;
    background: #0B0D14;
    font-family: "IBM Plex Sans", system-ui, sans-serif;
  }
  ha-card {
    display: block;
    background: var(--ha-card-background);
    border-radius: 14px;
    color: var(--primary-text-color);
    font-family: inherit;
  }
  #stage { width: ${width}px; }
  .row { display: flex; gap: 12px; }
  .row > div { width: 196px; }
</style>
<div id="stage"></div>
<script type="module">
${bundle}
</scr` + `ipt>
<script type="module">
${HARNESS}
const stage = document.getElementById("stage");
${body}

// Two frames plus the statistics microtask, then publish the height.
await new Promise((r) => setTimeout(r, 400));
await new Promise((r) => requestAnimationFrame(() => r()));
document.title = String(Math.ceil(document.body.scrollHeight));
</scr` + `ipt>
`;

const full = {
  money: true,
  origin_bar: true,
  origin_style: "band",
  amortisation: true,
  stats: ["peak", "autarky", "export", "import"]
};

const bare = { sections: { ring: true, chart: false, battery: false, today: false } };

const shots = {
  card: {
    width: 400,
    body: `place(stage, {
      title: "Solar",
      ring: { center: "surplus", rings: "double", meter: true, meter_shows: "day",
              facts: "none" },
      today: ${JSON.stringify(full)}
    }, "MIDDAY", false);`
  },
  evening: {
    width: 400,
    body: `place(stage, {
      title: "Solar",
      ring: { center: "power", rings: "double", meter: true, meter_shows: "day", facts: "none" },
      battery: { extra: "given" },
      today: ${JSON.stringify(full)}
    }, "EVENING", false);`
  },
  grey: {
    width: 400,
    body: `place(stage, {
      title: "Solar",
      ring: { center: "power", meter: true, meter_shows: "balance", facts: "none" },
      today: ${JSON.stringify({ ...full, origin_style: "bar" })}
    }, "GREY", true);`
  },
  clock: {
    width: 300,
    body: `place(stage, {
      title: "", chip: "never",
      sections: { ring: true, chart: false, battery: false, today: false },
      ring: { center: "power", rings: "clock", meter: false, facts: "none", size: "l" }
    }, "MIDDAY", false);`
  },
  subjects: {
    width: 960,
    body: `const SUBJECTS = ["roof", "money", "autarky", "day", "balance", "load"];
        const grid = document.createElement('div');
        grid.style.display = 'grid';
        grid.style.gridTemplateColumns = 'repeat(3, 300px)';
        grid.style.gap = '14px';
        stage.append(grid);
        for (const shows of SUBJECTS) {
          const cell = document.createElement('div');
          grid.append(cell);
          place(cell, {
            title: '', chip: 'never',
            sections: { ring: true, chart: false, battery: false, today: false },
            ring: { center: 'power', meter: true, meter_shows: shows, facts: 'none', size: 'm' }
          }, 'MIDDAY', false);
        }`
  },
  two: {
    width: 400,
    body: `place(stage, {
      title: 'Energie',
      ring: { center: 'power', columns: 'two', meter_shows: 'day',
              meter_second_shows: 'roof', facts: 'none' },
      battery: { extra: 'saved' },
      today: ${JSON.stringify(full)}
    }, 'MIDDAY', false);`
  },
  devices: {
    width: 860,
    body: `const DEV = [
      ["sensor.wp_power", "Wärmepumpe", 1840], ["sensor.dish_power", "Geschirrspüler", 1120],
      ["sensor.desk_power", "Büro Schreibtisch", 167], ["sensor.nas_power", "NAS", 20],
      ["sensor.lights_power", "Alle Lichter", 12], ["sensor.wash_power", "Waschmaschine", 0],
      ["sensor.fridge_power", "Kühlschrank", 0]
    ];
    const row = document.createElement("div");
    row.style.display = "grid"; row.style.gridTemplateColumns = "repeat(2, 400px)"; row.style.gap = "16px";
    stage.append(row);
    for (const style of ["both", "icons"]) {
      const cell = document.createElement("div"); row.append(cell);
      const ids = freshIds();
      const el = document.createElement("power-origin-card");
      el.setConfig({
        type: "custom:power-origin-card", title: "", chip: "never",
        entities: { ...ids },
        sections: { ring: false, chart: false, battery: false, today: false, devices: true },
        devices: { list: DEV.map((d) => d[0]), names: Object.fromEntries(DEV.map((d) => [d[0], d[1]])), style, values: style === "both" }
      });
      const h = hass(ids, { ...MIDDAY, house: 3420 }, false);
      for (const [id, , w] of DEV) h.states[id] = entity(id, w, "W", "power");
      el.hass = h;
      cell.append(el);
    }`
  },
  modes: {
    width: 820,
    body: `const row = document.createElement("div");
    row.className = "row";
    stage.append(row);
    for (const mode of ["power", "production", "surplus", "autarky"]) {
      const cell = document.createElement("div");
      row.append(cell);
      place(cell, {
        title: "", chip: "never",
        sections: { ring: true, chart: false, battery: false, today: false },
        ring: { center: mode, meter: false, facts: "bars", layout: "below" }
      }, "MIDDAY", false);
    }`
  },
  "no-battery": {
    width: 400,
    body: `const ids = freshIds();
    const el = document.createElement("power-origin-card");
    el.setConfig({
      type: "custom:power-origin-card",
      title: "Solar",
      entities: {
        house: ids.house, solar: ids.solar, grid_power: ids.grid_power,
        solar_today: ids.solar_today, house_today: ids.house_today,
        export_today: ids.export_today, import_today: ids.import_today,
        forecast: ids.forecast
      },
      ring: { center: "surplus", meter: true, facts: "bars", layout: "beside" },
      today: { origin_bar: true, stats: ["peak", "autarky", "export", "import"] }
    });
    el.hass = hass(ids, { ...MIDDAY, battery: 0, grid: -5800 }, false);
    stage.append(el);`
  }
};

/* A row of small cards, one per configuration, for the ring alone. */
const ringRow = (configs, state, weak = false) => `const row = document.createElement("div");
    row.style.display = "grid"; row.style.gridTemplateColumns = "repeat(${configs.length}, 300px)"; row.style.gap = "14px";
    stage.append(row);
    for (const cfg of ${JSON.stringify(configs)}) {
      const cell = document.createElement("div"); row.append(cell);
      place(cell, { title: "", chip: "never", ...cfg }, "${state}", ${weak});
    }`;

const RING_ONLY = { sections: { ring: true, chart: false, battery: false, today: false } };

shots["ring-day"] = {
  width: 3 * 300 + 28,
  body: ringRow(
    [
      { ...RING_ONLY, ring: { center: "power", rings: "dayclock", inner: "battery", tap: "cycle", meter: true, meter_shows: "roof", facts: "none", size: "m" } },
      { ...RING_ONLY, ring: { center: "money", meter: true, meter_shows: "grid", facts: "none", size: "m" } },
      { ...RING_ONLY, ring: { center: "autarky", rings: "double", inner: "battery", tap: "cycle", meter: false, facts: "none", size: "m" } }
    ],
    "MIDDAY"
  )
};

shots["ring-night"] = {
  width: 3 * 300 + 28,
  pre: `globalThis.__night = true; globalThis.__at = "22:30";`,
  body: ringRow(
    [
      { ...RING_ONLY, ring: { center: "power", night: "countdown", inner: "battery", meter: true, meter_shows: "grid", facts: "none", size: "m" } },
      { ...RING_ONLY, ring: { center: "power", night: "countdown", center_dark: "runtime", meter: true, meter_shows: "grid", facts: "none", size: "m" } },
      { sections: { ring: false, chart: false, battery: true, today: false }, battery: { sunrise_mark: true, extra: "sunrise" } }
    ],
    "EVENING"
  )
};

shots["columns-night"] = {
  width: 3 * 300 + 28,
  pre: `globalThis.__night = true; globalThis.__at = "22:30";`,
  body: ringRow(
    [
      { ...RING_ONLY, ring: { center: "power", meter: true, meter_shows: "night", meter_style: "blocks", facts: "none", size: "m" } },
      { ...RING_ONLY, ring: { center: "power", meter: true, meter_shows: "night", meter_style: "bar", center_dark: "runtime", facts: "none", size: "m" } },
      { ...RING_ONLY, ring: { center: "power", meter: true, meter_shows: "battery", facts: "none", size: "m" } }
    ],
    "EVENING"
  )
};

shots["columns-day"] = {
  width: 3 * 300 + 28,
  body: `const DEV = [["sensor.wp_power", "Wärmepumpe", 1840], ["sensor.dish_power", "Geschirrspüler", 1120], ["sensor.desk_power", "Büro", 167], ["sensor.nas_power", "NAS", 20]];
    globalThis.__dev = Object.fromEntries(DEV.map((d) => [d[0], d[2]]));
    const row = document.createElement("div");
    row.style.display = "grid"; row.style.gridTemplateColumns = "repeat(3, 300px)"; row.style.gap = "14px";
    stage.append(row);
    const cfgs = [
      { ring: { center: "power", columns: "scale", facts: "none", size: "m" } },
      { ring: { center: "power", meter: true, meter_shows: "devices", facts: "none", size: "m" }, devices: { list: DEV.map((d) => d[0]), names: Object.fromEntries(DEV.map((d) => [d[0], d[1]])) } },
      { ring: { center: "power", columns: "two", meter_shows: "roof", meter_second_shows: "none", facts: "none", size: "m" } }
    ];
    for (const cfg of cfgs) {
      const cell = document.createElement("div"); row.append(cell);
      const ids = freshIds();
      const el = document.createElement("power-origin-card");
      el.setConfig({ type: "custom:power-origin-card", title: "", chip: "never", battery_capacity: 13100, battery_reserve: 15,
        entities: { ...ids }, sections: { ring: true, chart: false, battery: false, today: false, devices: false }, ...cfg });
      const h = hass(ids, MIDDAY, false);
      for (const [id, , w] of DEV) h.states[id] = entity(id, w, "W", "power");
      el.hass = h;
      cell.append(el);
    }`
};

shots["today"] = {
  width: 2 * 400 + 16,
  body: `const row = document.createElement("div");
    row.style.display = "grid"; row.style.gridTemplateColumns = "repeat(2, 400px)"; row.style.gap = "16px";
    stage.append(row);
    const hourly = Array.from({ length: 24 }, (_, h) => ({
      period_start: new Date(new Date().setHours(h, 0, 0, 0)).toISOString(),
      pv_estimate: Math.max(0, Math.sin(((h - 6.5) / 13) * Math.PI)) * 7.4
    }));
    for (const cfg of [
      { chart: { style: "bars", forecast_bars: true, layers: true, best_day: true } },
      { chart: { style: "area", forecast_bars: true, layers: true, best_day: true }, sections: { ring: false, chart: true, battery: false, today: false, week: true } }
    ]) {
      const cell = document.createElement("div"); row.append(cell);
      const ids = freshIds();
      const el = document.createElement("power-origin-card");
      el.setConfig({ type: "custom:power-origin-card", title: "Solar", battery_capacity: 13100,
        entities: { ...ids, forecast_hourly: "sensor.forecast_hourly" },
        sections: { ring: false, chart: true, battery: false, today: false }, ...cfg });
      const h = hass(ids, MIDDAY, false);
      h.states["sensor.forecast_hourly"] = { entity_id: "sensor.forecast_hourly", state: "49.6",
        attributes: { unit_of_measurement: "kWh", device_class: "energy", detailedHourly: hourly } };
      const base = h.callWS;
      h.callWS = async (m) => {
        if (m.type !== "recorder/statistics_during_period") return {};
        if (m.period === "day") {
          const out = {}; const first = new Date(m.start_time); first.setHours(0, 0, 0, 0);
          for (const id of m.statistic_ids) { out[id] = []; for (let i = 0; i < 400; i++) { const d = new Date(first); d.setDate(first.getDate() + i); if (d > new Date()) break;
            const f = 0.35 + 0.65 * Math.abs(Math.sin(i * 1.3)); out[id].push({ start: d.toISOString(), mean: id === ids.solar ? 8200 * f : 1500, change: id === ids.solar_today ? 41 * f : id === ids.house_today ? 17 + 4 * f : id === ids.import_today ? 3 * (1.2 - f) : null }); } }
          return out;
        }
        if (m.period === "hour") {
          const out = {}; const first = new Date(m.start_time);
          for (const id of m.statistic_ids) out[id] = Array.from({ length: 24 }, (_, hr) => ({ start: new Date(first.getTime() + hr * 3600000).toISOString(), mean: id === ids.solar ? 9600 * Math.max(0, Math.sin(((hr - 6) / 14) * Math.PI)) : 1500 }));
          return out;
        }
        return base(m);
      };
      el.hass = h;
      cell.append(el);
    }`
};

shots["battery-block"] = {
  width: 2 * 400 + 16,
  pre: `globalThis.__night = true; globalThis.__at = "22:30";`,
  body: `const row = document.createElement("div");
    row.style.display = "grid"; row.style.gridTemplateColumns = "repeat(2, 400px)"; row.style.gap = "16px";
    stage.append(row);
    for (const cfg of [
      { battery: { curve: true, extra: "sunrise", sunrise_mark: true } },
      { battery: { curve: true, extra: "flow" } }
    ]) {
      const cell = document.createElement("div"); row.append(cell);
      const ids = freshIds();
      const el = document.createElement("power-origin-card");
      el.setConfig({ type: "custom:power-origin-card", title: "", chip: "never", battery_capacity: 13100, battery_reserve: 15,
        entities: { ...ids, battery_in_today: "sensor.bat_in" },
        sections: { ring: false, chart: false, battery: true, today: false }, ...cfg });
      const h = hass(ids, EVENING, false);
      h.states["sensor.bat_in"] = entity("sensor.bat_in", 9.8, "kWh", "energy");
      const base = h.callWS;
      h.callWS = async (m) => {
        const out = await base(m);
        if (m.type === "recorder/statistics_during_period" && out[ids.battery_soc]) {
          out[ids.battery_soc] = out[ids.battery_soc].map((r) => { const hr = new Date(r.start).getHours() + new Date(r.start).getMinutes() / 60;
            const soc = hr < 7 ? 40 - hr * 3 : hr < 15 ? 20 + (hr - 7) * 10 : Math.max(71, 100 - (hr - 15) * 4); return { ...r, mean: Math.min(100, soc), max: soc }; });
        }
        return out;
      };
      el.hass = h;
      cell.append(el);
    }`
};

for (const [name, shot] of Object.entries(shots)) {
  fs.writeFileSync(here + name + ".html", page(shot.body, shot.width, shot.pre));
}
console.log(Object.keys(shots).join(" "));
console.log(
  Object.entries(shots)
    .map(([n, s]) => n + ":" + (s.width + 32))
    .join(" ")
);
