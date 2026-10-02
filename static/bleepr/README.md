# Bleepr

Write retro cell-phone ringtones on a piano roll, hear them with chip presets, share them as RTTTL text, and export WAV.

Plain HTML, CSS and ES modules. No build step, no backend.

## Run it

ES modules don't load from `file://`, so serve the folder with any static server:

```sh
cd bleepr
python3 -m http.server 8000
# open http://localhost:8000
```

It also works as-is on GitHub Pages, Netlify, or any static host.

## Files

```
index.html          markup, Tailwind config
css/styles.css      custom styles
js/themes.js        theme registry (classic script in <head>)
js/theme-picker.js  theme dropdown
js/main.js          bootstrap, UI wiring
js/state.js         project state, note rules, undo/redo, localStorage
js/roll.js          piano roll (canvas, two orientations)
js/audio.js         synth, look-ahead scheduler, WAV export
js/presets.js       chip presets
js/rtttl.js         RTTTL parse/serialize
js/share.js         RTMX1 wrapper, URL hash
js/examples.js      built-in public-domain examples
js/welcome.js       first-launch tour (reopen with the Help button)
```

## Notes on the spec

- **Dotted 1/32 is not allowed.** It is 1.5 steps, which can't be stored in 32nd-note steps. The importer turns it into a 1/16 and warns.
- **Notes stay inside the loop.** Only release tails carry over into the next pass.
- **"Add as new layer" keeps the project tempo.** `b=` only sets the tempo on "Replace project". If the imported part is longer, the project grows to fit (up to 8 measures / 30 s).
- **Portrait time runs downward**, measure 1 at the top.
- **RTMX1 extras.** The wrapper header also carries `name=` and each layer can carry `(grit,brightness,volume)` as 0–100, e.g. `GlassFM(30,45,60)~...`. Both are optional; plain `Chip~rtttl` lines import fine.
- **Seamless WAV loops.** Notes are placed on exact sample frames, FM is rendered into buffers, vibrato and tremolo use automation curves, and the limiter is a memoryless soft clipper. Audio-rate modulation and compressors in Web Audio depend on render-block alignment, which made each pass differ slightly and could leave a click at the loop point.
- **Phones** get a menu button for My tunes, Share, Export and Phone speaker, and undo/redo move to the header, so everything fits at 360 px.
