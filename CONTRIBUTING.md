# Working on this card

## Getting it running

```bash
npm install
npm run check     # the whole suite, then the production build
```

`npm run check` is the only command that matters day to day: it type-checks, runs every test, and builds `dist/power-origin-card.js`. If it is green the card works; if it is red nothing else is worth trying.

Run it with `TZ=UTC` on a machine in another timezone — some fixtures measure back from *now*, and a green suite in Vienna that fails in CI is worse than no suite.

## Testing a change against a real Home Assistant

The built file is a single ES module with no dependencies, so a copy is a deploy.

```bash
cp dist/power-origin-card.js /path/to/config/www/community/power-origin-card/
```

HACS installs plugins into exactly that directory and serves them from `/hacsfiles/power-origin-card/`, so a card installed through HACS and a card copied by hand are the same file. Developing on top of a HACS install works: the copy overwrites what HACS put there, and the next HACS update puts the released build back.

Then **bump the version on the Lovelace resource**, or the browser keeps the old file and you will spend an hour debugging a change that never arrived:

**Settings → Dashboards → ⋮ → Resources**, and change the query string on the entry — `?hacstag=…` for a HACS install, `?v=…` for a hand-added one. Any new value works; a timestamp is easiest. This step has been forgotten often enough to be worth its own paragraph.

Only ever have **one** resource pointing at the card. Two — say a leftover `/local/…` beside the HACS one — load the module twice, and the second `customElements.define` throws.

## The readme pictures

They are rendered, not photographed. `tools/screenshots.mjs` writes one HTML page per capture against the built bundle and an invented but consistent day, and Chrome takes them headlessly:

```bash
npm run check                       # dist/ must be current
node tools/screenshots.mjs          # writes tools/*.html

chrome --headless=new --disable-gpu --virtual-time-budget=8000 \\
  --window-size=432,850 --screenshot=docs/card.png tools/card.html
```

The sizes per capture are in the script. Redraw them whenever the card changes rather than re-shooting by hand — a screenshot from two versions ago is how a store page starts lying.

One limit: the day views draw today up to the current hour, because that is what the card asks the recorder for. Take them in the afternoon and the clock and the day strip are satisfyingly full.

---

## Releasing

HACS installs from GitHub releases, so a release is what users actually get.

1. `npm run check` — green, no exceptions.
2. Bump `version` in `package.json` **and** in `custom_components`-style consumers if any exist (this card has none).
3. Commit, push.
4. `git tag -a vX.Y.Z -m "Power Origin X.Y.Z"` and `git push origin vX.Y.Z`.

The tag triggers `.github/workflows/release.yml`, which runs the suite again and attaches `dist/power-origin-card.js` to the release. **Do not attach the file by hand** — a hand-built asset has no guarantee it came from the tagged source.

Check that the release actually carries the asset:

```bash
gh release view vX.Y.Z --json assets -q '.assets[].name'
```

## The HACS default store

The card is submitted as [hacs/default#10752](https://github.com/hacs/default/pull/10752). Until that is merged, users install it as a **custom repository** of type *Dashboard*.

Four things keep it eligible, and all four are easy to break:

- **The HACS action must pass with no `ignore` key.** `.github/workflows/ci.yml` runs `hacs/action@main` with `category: plugin` and nothing else. Adding an ignore to make a check pass disqualifies the repository.
- **`hacs.json` must keep its `name`.**
- **The readme must contain images.** Not a nicety — a documented requirement for plugins.
- **A release must exist that postdates a successful action run.** If validation is fixed after a release, cut a new one.

While the pull request waits, keep working on the repository normally. The reviewer looks at the current state, not at the state when it was filed. Do not comment on the pull request to ask about progress; the bot explicitly lists that as something that delays review.

## Where the parts are

| File | What lives there |
| --- | --- |
| `src/flow.ts` | the split: who is supplying the house right now |
| `src/hours.ts` | the same question per hour, for every day view |
| `src/meter.ts` | the column's geometry, needle and two-column alike |
| `src/battery.ts` | state of charge, runtime, how comfortably it reaches sunrise |
| `src/chart.ts`, `src/bars.ts` | the day chart, as an area and as hourly bars |
| `src/money.ts` | the balance, read or worked out from prices |
| `src/config.ts` | defaults, resolution, and the editor schema |
| `src/localize.ts` | both language tables |
| `src/power-origin-card.ts` | the element: fetching, and every rendering |

Arithmetic goes in its own module with its own test. Rendering is asserted in jsdom against the real shadow DOM — `tests/render.test.ts` mounts the card and reads what it drew.

## Two traps that have cost real time

**The statistics cache is shared between card instances on purpose**, so five cards on a dashboard issue one recorder query instead of five. In tests that means one scenario answers for the next unless the cache is cleared; `render()` calls `clearStatisticsCache()` for exactly that reason. Removing that line makes every test after the first read the first one's data, silently.

**The editor's label and helper maps are flat**, keyed by field name across every group. Two groups cannot both have a field called `style`. That is why the ring's type is called `rings` rather than `style`.

## House rules the card is built on

- **The colour names the participant that is not the house.** Sun gold, battery green, grid blue, house neutral. The same kilowatts wear the same colour everywhere.
- **Nothing is invented for a missing sensor.** No entity, no block. An unreachable inverter says so rather than drawing a zero.
- **A flow that is a rounding error is not named.**
- **The card picks defaults; it never removes what someone asked for.** A default may step aside when the ring already says it. A setting typed by hand is honoured even if it repeats something.
- **A setting that cannot take effect is not shown.** The scale disappears for a column with no needle. This is about dead controls, never about taste.
