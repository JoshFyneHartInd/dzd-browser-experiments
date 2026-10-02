Based on the work done here: [https://www.davidc.net/sites/default/subnets/subnets.html](https://www.davidc.net/sites/default/subnets/subnets.html)

# Visual Subnet Calculator

Split an IPv4 network into subnets visually: divide rows in half, and join them back with nested bracket buttons. Responsive, keyboard and screen reader friendly, and themable (41 themes). A clean reimplementation; credit for the original concept and design goes to its author (Sargasso Networks / davidc.net).

## Run it

It's a static site: no backend, no build step.

```sh
python3 -m http.server 8000     # or any static server, then open http://localhost:8000
```

Or deploy the folder as-is to GitHub Pages, Netlify, etc.

> **Don't open `index.html` by double-clicking it (`file://`).** The app code uses ES modules, and Chrome (and some other browsers) refuse to load module scripts from `file://` URLs. Firefox may work, but use a local server to be safe. Hosted on any `http(s)` page it works everywhere.

## Dependencies

Only two, both loaded from CDNs:

- **Tailwind CSS**, browser build, pinned to `@tailwindcss/browser@4.3.3`. This build is meant for prototyping (it compiles styles in the browser). That's fine here, but for production you may want to swap it for a build step (Tailwind CLI) that outputs a static CSS file. The `@theme inline` block in `index.html` is what maps the theme tokens to utilities like `bg-surface`.
- **Material Symbols Rounded** icon font from Google Fonts (only the icons used). If you add or remove an icon, update the `icon_names` list in `index.html` (it must stay in alphabetical order).

## Files

```
index.html              page, Tailwind CDN, icon font, @theme mapping, theme-init script
css/tokens.css          Midnight fallback values + derived tokens (--focus)
css/app.css             .icon, focus ring, buttons, join brackets, tooltip (small)
js/themes.js            THEMES array (classic script, copied unchanged from the spec)
js/theme-picker.js      builds the picker, applies and saves themes
js/subnet.js            pure IPv4 math, division tree, row layout, CSV (no DOM)
js/state.js             URL encode/decode
js/ui.js                rendering, events, focus, announcements
js/main.js              wiring and app state
tests/*.test.js         unit tests (node --test)
tools/contrast.js       contrast checker for every theme (not part of the app)
package.json            only sets "type": "module" and npm scripts so Node can run the tests
```

## Tests

```sh
node --test          # or: npm test
node tools/contrast.js   # prints the contrast report below
```

Tested with Node 22. No dependencies.

## Shared link format

The URL query holds everything except the theme:

| Param | Meaning | Example |
|---|---|---|
| `n` | network address | `10.0.0.0` |
| `m` | mask bits | `16` |
| `t` | division tree (omitted if nothing is divided) | `gA` |
| `c` | visible columns as a number (omitted if all are shown) | `111` |

**Tree (`t`).** Walk the tree in pre-order (node, then lower half, then upper half). Write one bit per node: `1` = divided, `0` = leaf. A `/32` can't be divided, so it gets no bit. Pack the bits into bytes, most significant bit first, pad the last byte with zeros, then encode as base64url without `=` padding. Example: `/24` divided once is bits `1 0 0` -> byte `0x80` -> `gA`. Only this exact (canonical) form is accepted when reading a link. Links that would produce more than 4096 subnets are rejected.

**Columns (`c`).** A bitmask, in the order Subnet address (1), Netmask (2), Range (4), Usable IPs (8), Hosts (16), Divide (32), Join (64). All shown = 127, which is left out of the URL.

Host bits in `n` are cleared when a link is read. Links from the original tool's URL format are not imported (it was a nice-to-have).

## Behaviour notes

- **Update** applies the fields and starts from one row. **Reset** goes back to a single row for the network last applied with Update, and restores the fields to it.
- A CIDR pasted into the address field (for example `10.0.0.0/16`) is split into the two fields. If the address has host bits set (`192.168.1.5/24`), it's changed to the network address and a notice says so.
- `/31` counts as 2 usable hosts (RFC 3021) and `/32` as 1 host. Those rows carry a small note (shown next to Usable IPs, or Hosts if that one is hidden).
- The Divide button shows the size of the resulting halves, e.g. "Divide /27" on a /26 row. At `/32` it just says "Divide" and is `aria-disabled` rather than `disabled`, so keyboard focus isn't lost.
- Below Tailwind's `sm` width (40rem) the table becomes one card per subnet, indented by depth. Each internal node gets a "Join /N" button on the card where its bracket would start.
- Export CSV includes the visible data columns (all five if none are visible), one row per subnet.
- **Density:** the layout is compact. On windows at least 40rem wide with a mouse or trackpad (`pointer: fine`), buttons and inputs are 32px tall. On touch screens and narrow windows they stay 44px, as the spec requires. Controls are never smaller than WCAG 2.2's 24px minimum.
- Per-row Copy buttons are icon-only with an `aria-label` ("Copy 192.168.0.0/24") and a tooltip on hover and focus (Esc closes it).
- The Copy button sits to the left of each subnet address so the addresses line up.
- **Network address** (open by default) and **Columns** (closed by default) are collapsible. The collapsed Network panel shows the current network. A validation error re-opens it so the field can take focus.
- **How to use** is the help icon next to the theme picker. It opens a dialog (Esc, the Close button or a click outside closes it). Like the Copy buttons, it is icon-only with an `aria-label` and a tooltip.

## Theme contrast

`node tools/contrast.js` checks every theme against the pairs in the spec (`--focus` is `--accent`; bracket tints are `color-mix(in srgb, accent N%, surface)`). `themes.js` was **not** edited. Result: 41 themes, 17 failing pairs, listed here:

| Theme | Pair | Colors | Ratio | Needs |
|---|---|---|---|---|
| paper | --accent (text) on --bg | #2f6fed on #f6f5f1 | 4.17 | 4.5:1 |
| one-dark | --fg on bracket tint 25% (hover/focus) | #abb2bf on #445245 | 3.88 | 4.5:1 |
| blueprint | --fg on bracket tint 25% (hover/focus) | #eaf4ff on #4a779b | 4.29 | 4.5:1 |
| ghost | --fg-muted on --bg | #616874 on #d3d3d3 | 3.75 | 4.5:1 |
| ghost | --danger on --bg | #c81e35 on #d3d3d3 | 3.80 | 4.5:1 |
| candy | --accent (text) on --bg | #c43d82 on #ffe5f1 | 4.09 | 4.5:1 |
| candy | --accent (text) on --surface | #c43d82 on #ffe5f1 | 4.09 | 4.5:1 |
| citrus | --accent (text) on --bg | #d0711e on #f1f5c9 | 3.08 | 4.5:1 |
| citrus | --accent (text) on --surface | #d0711e on #f1f5c9 | 3.08 | 4.5:1 |
| arizona-green-tea | --danger on --bg | #be4253 on #d7ecd9 | 4.13 | 4.5:1 |
| arizona-green-tea | --accent (text) on --bg | #e0559a on #d7ecd9 | 2.85 | 4.5:1 |
| arizona-green-tea | --accent (text) on --surface | #e0559a on #e8f5e9 | 3.15 | 4.5:1 |
| arizona-green-tea | --focus on --bg | #e0559a on #d7ecd9 | 2.85 | 3:1 |
| diablo | --accent (text) on --bg | #d42222 on #0c0505 | 3.90 | 4.5:1 |
| diablo | --accent (text) on --surface | #d42222 on #150808 | 3.79 | 4.5:1 |
| xmas | --accent (text) on --bg | #e0303a on #0b1a12 | 3.97 | 4.5:1 |
| xmas | --accent (text) on --surface | #e0303a on #10241a | 3.61 | 4.5:1 |

The other 32 themes pass every pair.

**What the app does about these** (so the failures above are theme values, not visible problems in the app):

- **`--accent` and `--danger` as text:** the app doesn't use them for text. Links, notices, success and error messages use `--fg`; the colour sits in the icon, the underline or a border. (`--danger` and `--accent` icons and borders are non-text, which only needs 3:1; the lowest is 2.85:1 for the accent in Arizona Green Tea, see below.)
- **`--fg-muted` on `--bg`:** muted text is only placed on `--surface` or `--surface-2` panels, never directly on the page background.
- **Bracket hover and focus tint:** the app uses 18% instead of 25%. `--fg` on that tint passes 4.5:1 in all 41 themes (the checker has a row for it). Hover also thickens the bracket's left border, so the change isn't colour alone.
- **`--focus` on `--bg`:** the focus ring is `--focus` plus an outer `--fg` edge, so it stays visible even where `--accent` is weak (Arizona Green Tea).
- **Still open for the project owner:** theme values that fall short as raw colours, mainly Arizona Green Tea's accent (2.85:1 on its page background, which also affects accent icons and the focus colour there) and the pairs in the table if you want them fixed at the source.

## Manual checklist

Run these before a release.

- [ ] **Keyboard only:** Tab through the header, form, columns, buttons, and every row. Divide a subnet with Enter or Space: focus lands on the first new row's Divide button. Join: focus lands on the merged row's Divide button. Focus ring is visible everywhere. Esc closes a tooltip. Collapse and expand the Network and Columns panels with Enter or Space. The help button opens a dialog that traps focus and returns it to the button when closed.
- [ ] **Screen reader** (VoiceOver or NVDA): icons aren't read; Divide and Join announce with the subnet name ("Join into 192.168.0.0/23"); the live region says "Divided ... into two /25 subnets"; "Link copied" is announced; field errors are read with the field.
- [ ] **320px width:** no horizontal page scroll; cards indent by depth; all buttons at least 44x44px. Also check a touch device or a tablet in landscape: targets stay 44px there.
- [ ] **Themes:** try Midnight, Paper, High Contrast, a light one (Candy) and a dark one (Matrix). Reload to check the choice is remembered and there's no flash.
- [ ] **Windows High Contrast / forced colors:** icons, buttons and brackets are still visible.
- [ ] **Link sharing:** divide a few rows, hide a column, Copy link, open it in a private window: same layout. The theme is not carried over.
- [ ] **Edge cases:** `255.255.255.0/24`, `0.0.0.0/0`, `/31`, `/32`, `192.168.1.5/24` (notice), pasted CIDR, bad input (inline errors, no alerts).
- [ ] **Lighthouse accessibility = 100 and axe with no violations**, in Midnight and Paper. (Not run yet; needs a real browser.)

## License

MIT, see `LICENSE`.
