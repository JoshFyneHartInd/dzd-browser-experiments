# Retro Ringtone Maker: Spec

## Goal
A small static web app for writing retro cell-phone ringtones on a piano roll, hearing them with "chip" sound presets, sharing them as text, and exporting WAV.

**Stack:** plain HTML, CSS, vanilla JS (ES modules). Tailwind via CDN. Material Symbols icon font via CDN. Web Audio API. No backend, no framework, no build step.

## Core idea
A tune is a list of **layers** (1 to 6). Each layer is one monophonic melody (one note at a time) with its own chip preset. One layer sounds like a classic ringtone; more layers make it polyphonic. There is no mono/poly mode.

## Files
```
index.html          markup, Tailwind config
css/styles.css      small custom styles
js/themes.js        theme registry (classic script loaded in <head>)
js/theme-picker.js  theme dropdown UI
js/main.js          bootstrap, UI wiring
js/state.js         project state, undo/redo, localStorage
js/roll.js          piano roll editor (canvas)
js/audio.js         synth, playback, WAV export
js/presets.js       chip presets
js/rtttl.js         RTTTL parse/serialize
js/share.js         share string encode/decode, URL hash
```

## Data model
```js
project = {
  name: "My Tune",        // max 10 chars
  bpm: 120,               // 20-300
  measures: 4,            // loop length, 1-8, fixed 4/4, total max 30 s
  layers: [{
    id, name, presetId,
    params: { grit: 0.5, bright: 0.5 },
    mute: false, solo: false, volume: 0.8,
    notes: [{ start, length, pitch }]   // start/length in 32nd-note steps, pitch = MIDI number, no overlaps
  }],
  activeLayerId
}
```
- Pitch range C4 to B7.
- Loop seconds = `measures * 4 * 60 / bpm`. Show it next to the measure count. Block settings that push it past 30 s.

## Layout
**Portrait (under 768px wide):** header, roll editor (time runs vertically, keyboard along the bottom), layer list, toolbar.
**Landscape / desktop:** header, roll editor (keyboard on the left, time runs horizontally), layer list, toolbar.
- Same data, two renderers, chosen by viewport.
- The layer list is always directly under the roll editor.

## Layers
- List under the roll editor. Each row: color swatch, name, chip name, mute, solo, volume, delete.
- Tap a row to make it the active layer. Only the active layer is edited.
- "+ Add layer" opens the chip picker. Max 6.
- New project starts with one layer (Brickphone). The last layer can't be deleted.

## Piano roll
- Canvas. Redraws on state, scroll, zoom, or theme change.
- Show about 2 octaves, scroll for more. Pinch to zoom.
- Tapping a piano key plays that pitch with the active layer's chip.
- Notes from other layers show dimmed in their layer color and can't be edited.
- Snap values: 1/4, 1/8, 1/16 (default), 1/32.
- Allowed note lengths (so RTTTL round-trips): 1, 1/2, 1/4, 1/8, 1/16, 1/32, plus dotted versions. No triplets.
- Tools: Draw (tap to add, drag edge to resize), Select (move, delete), Erase.
- No overlaps inside a layer: a new or moved note trims or replaces what it covers.
- Playhead moves during playback.
- Undo/redo (50 steps).
- Desktop shortcuts: Space = play/stop, Delete = remove, Ctrl/Cmd+Z and Shift+Z = undo/redo.

## Chip presets
Each preset is a waveform, envelope, filter, and small quirk, with two sliders: **Grit** and **Brightness**. One flat list in the picker, each with a preview button and a one-line description. Any preset works on any layer.

| Name | Character |
|---|---|
| Brickphone | hard square, narrow band-pass, loud |
| Pocket Piezo | thin 25% pulse, buzzy |
| Dial-Up Dream | square with light vibrato |
| Lobby Beep | soft triangle, rounded |
| Glass FM | bright bell-like FM |
| Sparkle-16 | plucky FM, short decay |
| Flip Phone Orchestra | detuned thin pads |
| Mall Kiosk | cheesy demo-keyboard tone |

Optional global "Phone speaker" toggle: band-pass about 400 Hz to 4 kHz plus mild distortion.

## Audio
- The `AudioContext` is created or resumed on the first user tap.
- Schedule notes with a look-ahead scheduler (about 25 ms timer, about 100 ms ahead), not `setTimeout` timing.
- **Perfect looping:** pass start times are `loopStart + k * loopDuration`, never accumulated increments. Notes and release tails that run past the end keep sounding into the next pass. Nothing fades at the loop point.
- A ~10 ms anti-click ramp on Stop only.
- Mute and solo apply live.

## RTTTL import and share
**One layer = plain RTTTL:** `name:d=4,o=5,b=120:8c,8d,8e,4p`
- Parser supports: optional `d`, `o`, `b` defaults; notes c d e f g a b with `#`; rest `p`; durations 1/2/4/8/16/32; dotted notes (dot after the note, also tolerated before the octave); octaves 4 to 7.
- Forgiving: ignore spaces and case, skip unknown tokens with a warning, report the position of the first real error.
- `b=` sets project BPM. Round the length up to whole measures and pad with a rest.
- Importing asks: **Replace project** or **Add as new layer** (disabled at 6 layers).

**Multi-layer tunes** (RTTTL can't hold layers or chip choice) use a text wrapper with one RTTTL per layer:
```
RTMX1|bpm=120|m=4
Brickphone~name:d=4,o=5,b=120:8c,8d,...
GlassFM~name:d=4,o=4,b=120:2c,2g,...
```
- Share menu: **Copy RTTTL** (active layer), **Copy full tune** (wrapper), **Copy link** (wrapper in the URL hash).
- Importer auto-detects: starts with `RTMX1|` means wrapper, otherwise RTTTL.
- Opening a link with a hash loads it (confirm first if there are unsaved edits).

## WAV export
- Render offline with `OfflineAudioContext`, 16-bit PCM, 44.1 kHz.
- **Perfect loop by default.** Loop length is `round(loopSeconds * 44100)` samples. Render one extra pre-roll pass, discard it, and keep the next N passes, so tails from the end wrap into the start. Test: the jump between the last and first sample is no bigger than a normal sample-to-sample step.
- **Repeats:** 1 to N loops, total max 30 s.
- **Fade out at end:** checkbox, off by default; 0.5, 1, or 2 s. Export only, never in-app. When on, skip the pre-roll and warn "A faded file won't loop seamlessly."
- Filename `<tune name>.wav`. On mobile use `navigator.share({ files })` if available, otherwise a normal download.

## Themes
- Tailwind `darkMode: 'class'`. The `dark` class is set when the active theme's `scheme` is `dark`.
- Components use semantic Tailwind colors mapped to CSS variables (e.g. `bg-bg text-fg`). No hardcoded colors.
- Variables: `--bg --surface --surface-2 --border --fg --fg-muted --accent --accent-fg --note --note-selected --key-white --key-black --danger --layer-1` to `--layer-6`.

| Variable | Paper (light) | Midnight (dark) |
|---|---|---|
| `--bg` | `#f6f5f1` | `#14161a` |
| `--surface` | `#ffffff` | `#1d2026` |
| `--surface-2` | `#ebeae4` | `#272b33` |
| `--border` | `#d4d2c8` | `#363b45` |
| `--fg` | `#1b1c1f` | `#e8e9ec` |
| `--fg-muted` | `#62646b` | `#9aa0ab` |
| `--accent` | `#2f6fed` | `#6c9bff` |
| `--accent-fg` | `#ffffff` | `#0b1020` |
| `--note` | `#e0702a` | `#ffa05c` |
| `--note-selected` | `#b3470a` | `#ffc89a` |
| `--key-white` | `#ffffff` | `#d9dbe0` |
| `--key-black` | `#2a2b2f` | `#0f1013` |
| `--danger` | `#c62f3a` | `#ff7a85` |

**Registry (`js/themes.js`)** is the single source of truth. A theme is one object:
```js
{ id: "phosphor", name: "Phosphor", group: "Retro", scheme: "dark",
  vars: { "--bg": "#050a05", "--surface": "#0b140b" /* ... */ } }
```
- Missing variables fall back to Paper (light schemes) or Midnight (dark schemes).
- `themes.js` is a classic script in `<head>`. It injects one `<style>` with a `[data-theme="id"]` block per theme and sets `data-theme` and the `dark` class from localStorage before first paint (no flash).
- Starter themes: Paper, Midnight, Phosphor (green on black), Amber Glow (orange on black), Grape Soda, Lobby Beige.
- Contrast: body text on background at least 4.5:1; notes on the roll background at least 3:1.

**Theme picker (custom dropdown, not a native select)**
- Header button shows a swatch strip plus the theme name.
- Opens a panel with a max height (about 60% of the viewport) and its own vertical scroll. On phones it opens as a bottom sheet.
- Options are grouped under sticky headings. Each shows a swatch strip (`--bg`, `--surface`, `--accent`, `--note`), the name, and a check on the current one.
- Search box when there are more than 12 themes.
- Hover or arrow-key over an option to preview it. Closing without choosing restores the previous theme.
- First entry is **System (auto)**: follows the OS, using Paper or Midnight.
- ARIA listbox pattern: Up/Down, Home/End, type-ahead, Enter, Esc.
- Choice saved in localStorage.

## Icons
Use the **Material Symbols Outlined** icon font (Google Fonts CDN, loaded with `display=block`) for all button and control labels where an icon is clear.
- Markup: `<span class="material-symbols-outlined" aria-hidden="true">play_arrow</span>`.
- Icons inherit `currentColor`, so every theme styles them automatically. No hardcoded icon colors.
- **Icon-only buttons** (toolbar, layer row, transport) need an `aria-label` and a `title` tooltip.
- **Icon + text** for primary actions (Export, Share, Add layer) at desktop widths. On narrow screens, text may collapse to icon only.
- Default size 24px inside a touch target of at least 44px.
- Hide icon spans until the font has loaded (`document.fonts.ready`), so raw ligature names like `play_arrow` never flash on screen.
- Suggested icons:

| Control | Icon name |
|---|---|
| Play / Stop | `play_arrow` / `stop` |
| Loop toggle | `repeat` |
| Undo / Redo | `undo` / `redo` |
| Draw / Select / Erase tool | `edit` / `arrow_selector_tool` / `ink_eraser` |
| Add layer | `add` |
| Delete | `delete` |
| Mute / Unmute | `volume_off` / `volume_up` |
| Solo | `headphones` |
| Reorder handle | `drag_handle` |
| Chip preset preview | `play_circle` |
| Theme picker | `palette` |
| Share | `share` |
| Copy | `content_copy` |
| Copy link | `link` |
| Export WAV | `download` |
| My tunes menu | `folder_open` |
| Save | `save` |
| Menu / Close | `menu` / `close` |
| Search | `search` |
| Current item check | `check` |
| Dropdown arrow | `keyboard_arrow_down` |

## Persistence
- Auto-save the current project to localStorage (debounced).
- "My tunes" menu: save, rename, delete.
- Built-in examples: original or traditional public-domain melodies only.

## Accessibility
- All controls labeled, with visible focus.
- Color is never the only signal.
- Respect `prefers-reduced-motion`.
- Touch targets at least 44px.