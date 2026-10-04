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
- `tests/themes.test.js` checks all 46 themes for token completeness, WCAG contrast, state separation (including colour-vision simulation for Core), and the mono-theme rules. It prints warnings for text pairs near the floor in Dark and Light themes. Failures exit non-zero.

## Debug

Add `?debug=1`. A collapsed "Debug" tab appears at the bottom: speed x1/x10/x60, force an event, and show true values beside displayed ones. `window.deepwatch` is exposed for scripting.

## Notes on the design

- **Time:** 1 real second = 24 game seconds, so one game day is 60 real minutes. (The spec said 2.4 in one place, which gives 10 hours per day, so I used 24.)
- **Simulation:** fixed 4 Hz step, separate from the DOM, with a seeded RNG so runs and tests are repeatable.
- **Countdown:** the lose timer reads true state, not displayed state. A broken gauge can hide a problem but never the countdown banner.
- **Instruments:** its self-test reports sensor errors truthfully. It is how you find out which other gauge is lying.
- **Saves:** one run in `localStorage` (`deepwatch.run`), autosaved every 30 s and on pause or tab hide. Settings and best scores are under `deepwatch.global`.
- **Icons:** if the icon font fails to load, buttons fall back to text labels. Status icons are inline SVG with distinct shapes, so they never depend on the font or on colour.

## Adding a theme

Open `js/themes.js` and add one line to the registry with `d(...)` for dark or `l(...)` for light. Give the id, the name, and the core colours (bg, surface, text, accent, and the four state colours). Missing tokens are derived and contrast-corrected by `expandTokens`. Then run `npm test`. A new theme must pass the contrast checks before it ships.
