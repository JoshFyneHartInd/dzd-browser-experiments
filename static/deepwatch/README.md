# Deepwatch

A browser game about running a deep-sea research station. You can't trust every gauge, and every control answers with a delay.

Client-only: HTML, CSS, vanilla ES modules, Tailwind (CDN), Phosphor icons (CDN), the Inter font (Google Fonts) and Web Audio. No build step, no server code.

## Run it

```
python3 -m http.server 8080      # or: npm start
# open http://localhost:8080
```

ES modules need a server, so opening `index.html` from disk will not work. The window must be at least 1024 px wide and landscape. Smaller windows see a "use a larger screen" message.

## Tests

```
npm test
```

- `tests/sim.test.js` runs the simulation headless: control lag and overshoot, sensor faults, event chaining, the lose condition, crisis warning times at every difficulty, save/restore, and pause.
- `npm run test:ui` (optional) drives the real game in a browser: opens every detail screen and operates each control type. It needs Playwright and the game served on port 8080, and skips itself otherwise.
- `tests/themes.test.js` checks all 46 themes for token completeness, WCAG contrast, state separation (including colour-vision simulation for Core), and the mono-theme rules. It prints warnings for text pairs near the floor in Dark and Light themes. Failures exit non-zero.

## Debug

Add `?debug=1`. A collapsed "Debug" tab appears at the bottom: speed x1/x10/x60, force an event, and show true values beside displayed ones. `window.deepwatch` is exposed for scripting.

## Notes on the design

- **Time:** 1 real second = 24 game seconds, so one game day is 60 real minutes. (The spec said 2.4 in one place, which gives 10 hours per day, so I used 24.)
- **Simulation:** fixed 4 Hz step, separate from the DOM, with a seeded RNG so runs and tests are repeatable.
- **Countdown:** the lose timer reads true state, not displayed state. A broken gauge can hide a problem but never the countdown banner.
- **Instruments:** its self-test reports sensor errors truthfully. It is how you find out which other gauge is lying.
- **Wear:** only systems with a Maintenance control wear out (`hasWear` in `js/config.js`). Supplies and Fuel cannot be serviced, so they have no wear and no Wear section.
- **Saves:** one run in `localStorage` (`deepwatch.run`), autosaved every 30 s and on pause or tab hide. Settings and best scores are under `deepwatch.global`.
- **Icons:** if the icon font fails to load, buttons fall back to text labels. Status icons are inline SVG with distinct shapes, so they never depend on the font or on colour.

## Meters and controls

Each system has its own meter shape, and the detail screens mix control types. Both are chosen in `js/config.js`.

- **Meters** (`js/meters.js`): set `meter: 'tank'` on a channel. Kinds: `arc`, `dial`, `tank`, `ruler`, `cell`, `crates`, `signal`, `drop`, `shield`, `porthole`, `ring`. Each shows level through shape (fill height, lit segments, needle angle), not only colour, and draws its threshold bands as a dashed rail. To add one, add an entry to `KINDS` with a text layout, an `svg()` and an `update()`.
- **Controls** (`js/widgets.js`): set `ui` on a control. Faders: `slider` (default), `vslider`, `knob` (add `skin: 'valve'` for a handwheel), `steps` (give it `stops`). Toggles: `switch` (default), `lever`, `guarded`. Jobs: `arm` (two-step). These change only how a control looks and is operated. The simulation sees the same set-point, lag and overshoot either way.

## Adding a theme

Open `js/themes.js` and add one line to the registry with `d(...)` for dark or `l(...)` for light. Give the id, the name, and the core colours (bg, surface, text, accent, and the four state colours). Missing tokens are derived and contrast-corrected by `expandTokens`. Then run `npm test`. A new theme must pass the contrast checks before it ships.
