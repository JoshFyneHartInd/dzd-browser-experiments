// Welcome tour: a short swipeable set of cards. Opens on first launch and
// from the Help button. Uses native horizontal scroll-snap for swiping.

import { mountThemeList } from './theme-picker.js';

const SEEN_KEY = 'bleepr.welcome.v1';
const icon = (name) => `<span class="material-symbols-outlined" aria-hidden="true">${name}</span>`;

// Illustrations: inline SVG colored only through theme variables.
const keys = (x, y, h, rows) => {
  let s = `<rect class="w-key" x="${x}" y="${y}" width="22" height="${h}" rx="3"/>`;
  const rh = h / rows;
  [1, 3, 6, 8, 10].forEach((n) => {
    for (let o = 0; o * 12 + n < rows; o++) {
      const r = rows - 1 - (o * 12 + n);
      s += `<rect class="w-black" x="${x}" y="${y + r * rh + 1}" width="13" height="${rh - 2}" rx="1"/>`;
    }
  });
  return s;
};
const grid = (x, y, w, h, cols, rows) => {
  let s = `<rect class="w-surface" x="${x}" y="${y}" width="${w}" height="${h}"/>`;
  for (let c = 1; c < cols; c++) s += `<line class="${c % 4 ? 'w-line' : 'w-beat'}" x1="${x + (c * w) / cols}" y1="${y}" x2="${x + (c * w) / cols}" y2="${y + h}"/>`;
  for (let r = 1; r < rows; r++) s += `<line class="w-line" x1="${x}" y1="${y + (r * h) / rows}" x2="${x + w}" y2="${y + (r * h) / rows}"/>`;
  return s;
};
const note = (x, y, w, h, cls = 'w-note') => `<rect class="${cls}" x="${x}" y="${y}" width="${w}" height="${h}" rx="3"/>`;

const ART = {
  welcome: `
    <svg viewBox="0 0 320 150" role="img" aria-label="A short melody on a piano roll with a moving playhead">
      ${keys(12, 14, 122, 12)}${grid(38, 14, 270, 122, 16, 12)}
      ${note(38, 116, 33, 9)}${note(72, 96, 33, 9)}${note(106, 76, 33, 9)}${note(140, 56, 50, 9)}
      ${note(191, 76, 16, 9)}${note(208, 96, 16, 9)}${note(225, 116, 66, 9)}
      <g class="w-playhead"><rect class="w-accent" x="37" y="10" width="2.5" height="130" rx="1"/><path class="w-accent" d="M32 8h13l-6.5 7z"/></g>
    </svg>`,
  draw: `
    <svg viewBox="0 0 320 150" role="img" aria-label="Tapping an empty cell adds a note; dragging its end makes it longer">
      ${keys(12, 14, 122, 12)}${grid(38, 14, 270, 122, 16, 12)}
      ${note(72, 55, 34, 9)}
      <rect class="w-ghost" x="106" y="55" width="67" height="9" rx="3"/>
      <path class="w-arrow" d="M110 70h56m-6-5 6 5-6 5"/>
      ${note(207, 96, 17, 9)}
      <circle class="w-tap" cx="215" cy="100" r="13"/>
      <circle class="w-tapdot" cx="215" cy="100" r="4"/>
    </svg>`,
  layers: `
    <svg viewBox="0 0 320 150" role="img" aria-label="Three layers stacked; the one being edited is solid, the others dimmed">
      ${keys(12, 14, 122, 12)}${grid(38, 14, 270, 122, 16, 12)}
      <g class="w-dim1">${note(38, 25, 67, 9)}${note(106, 25, 67, 9)}${note(174, 35, 67, 9)}${note(242, 25, 66, 9)}</g>
      ${note(38, 66, 33, 9)}${note(72, 56, 33, 9)}${note(106, 66, 17, 9)}${note(123, 76, 50, 9)}${note(174, 56, 67, 9)}${note(242, 66, 33, 9)}
      <g class="w-dim2">${note(38, 116, 135, 9)}${note(174, 106, 134, 9)}</g>
    </svg>`,
  tempo: `
    <svg viewBox="0 0 320 150" role="img" aria-label="Tempo 120 BPM and 4 measures, 8 seconds, looping">
      <rect class="w-lcd" x="18" y="34" width="122" height="62" rx="10"/>
      <text class="w-lcd-num" x="79" y="78" text-anchor="middle">120</text>
      <text class="w-lcd-cap" x="79" y="112" text-anchor="middle">BPM</text>
      <rect class="w-lcd" x="152" y="34" width="150" height="62" rx="10"/>
      <text class="w-lcd-num" x="190" y="78" text-anchor="middle">4</text>
      <text class="w-lcd-sec" x="255" y="76" text-anchor="middle">8.0 s</text>
      <text class="w-lcd-cap" x="227" y="112" text-anchor="middle">Measures</text>
      <rect class="w-loopline" x="96" y="122" width="128" height="18" rx="9"/>
      <path class="w-loophead" d="M150 116l9 6-9 6z"/>
    </svg>`,
  share: `
    <svg viewBox="0 0 320 150" role="img" aria-label="A ringtone written as RTTTL text, ready to copy or export">
      <rect class="w-lcd" x="18" y="22" width="284" height="72" rx="10"/>
      <text class="w-code" x="32" y="50">Jacques:d=4,o=5,b=120:</text>
      <text class="w-code w-code-notes" x="32" y="74">c,d,e,c,c,d,e,c,e,f,2g…</text>
      <g transform="translate(66 108)"><rect class="w-chip" width="86" height="30" rx="15"/><text class="w-chip-text" x="43" y="20" text-anchor="middle">RTTTL</text></g>
      <g transform="translate(168 108)"><rect class="w-chip" width="86" height="30" rx="15"/><text class="w-chip-text" x="43" y="20" text-anchor="middle">.wav</text></g>
    </svg>`,
};

function cards(touch) {
  return [
    {
      id: 'welcome',
      title: 'Welcome to Bleepr',
      lead: 'Write ringtones the way old phones played them, one beep at a time. Then share them as text or export a WAV.',
      tips: [
        ['play_arrow', 'A demo tune is loaded. Press Play to hear it.'],
        ['swipe', touch ? 'Swipe for a quick tour.' : 'Use the arrow keys or Next for a quick tour.'],
      ],
      themes: true,
    },
    {
      id: 'draw',
      title: 'Draw notes',
      lead: 'Pick a tool in the bottom bar, then work on the grid. Rows are pitches; time runs along the ruler.',
      tips: [
        ['edit', 'Draw: tap to add a note, drag its end to make it longer, tap it again to remove it.'],
        ['arrow_selector_tool', 'Select: tap notes or drag a box around them, then drag to move.'],
        [touch ? 'pinch' : 'zoom_in', touch ? 'Pinch to zoom. Drag the ruler or keys, or use two fingers, to scroll.' : 'Ctrl or Cmd + scroll to zoom. Tap a piano key to hear it.'],
      ],
    },
    {
      id: 'layers',
      title: 'Layers and chips',
      lead: 'Each layer plays one note at a time. Stack up to six for chords, bass and harmony.',
      tips: [
        ['stacks', 'Tap a layer to edit it. The other layers show dimmed on the grid.'],
        ['tune', 'Tap the chip button to change the sound and adjust Grit and Brightness.'],
        ['headphones', 'Mute or solo layers while the tune plays.'],
      ],
    },
    {
      id: 'tempo',
      title: 'Tempo and loop',
      lead: 'Set the BPM and the number of measures. A loop can run up to 30 seconds.',
      tips: [
        ['repeat', 'With Loop on, the tune repeats with no gap at the end.'],
        ['speaker_phone', 'Turn on Phone speaker for that tinny handset sound.'],
        [touch ? 'undo' : 'keyboard', touch ? 'Undo and redo sit at the top of the screen.' : 'Space plays and stops. Ctrl or Cmd + Z undoes.'],
      ],
    },
    {
      id: 'share',
      title: 'Share and export',
      lead: 'Your work saves automatically. Keep finished tunes in My tunes.',
      tips: [
        ['content_copy', 'Copy RTTTL, the classic ringtone text, or the full tune with every layer.'],
        ['link', 'Copy a link that opens your tune. Paste RTTTL to import one.'],
        ['download', 'Export a WAV that loops cleanly, for a real ringtone or a game.'],
      ],
    },
  ];
}

export function mountWelcome() {
  const touch = matchMedia('(pointer: coarse)').matches;
  const list = cards(touch);
  const dlg = document.createElement('dialog');
  dlg.id = 'dlg-welcome';
  dlg.className = 'sheet welcome bg-surface text-fg';
  dlg.setAttribute('aria-labelledby', 'welcome-title-0');
  dlg.innerHTML = `
    <div class="sheet-inner">
      <header class="welcome-head">
        <span class="welcome-brand font-lcd" aria-hidden="true">Bleepr</span>
        <button type="button" class="btn icon-btn" data-w="close" aria-label="Close tour" title="Close">${icon('close')}</button>
      </header>
      <div class="welcome-track" id="welcome-track" tabindex="-1">
        ${list.map((c, i) => `
          <section class="welcome-slide" role="group" aria-roledescription="card" aria-label="${i + 1} of ${list.length}: ${c.title}" data-i="${i}">
            <div class="welcome-art welcome-art-${c.id}">${ART[c.id]}</div>
            <h2 class="welcome-title" id="welcome-title-${i}">${c.title}</h2>
            <p class="welcome-lead">${c.lead}</p>
            <ul class="welcome-tips">
              ${c.tips.map(([ic, text]) => `<li>${icon(ic)}<span>${text}</span></li>`).join('')}
            </ul>
            ${c.themes ? `
              <div class="welcome-theme">
                <h3 class="welcome-theme-h" id="welcome-theme-h">Pick a theme</h3>
                <p class="welcome-theme-note">Optional. Change it any time with the theme button at the top.</p>
                <div id="welcome-theme-list"></div>
              </div>` : ''}
          </section>`).join('')}
      </div>
      <footer class="welcome-foot">
        <button type="button" class="btn text-btn welcome-back" data-w="back">Back</button>
        <div class="welcome-dots" role="group" aria-label="Tour cards">
          ${list.map((c, i) => `<button type="button" class="welcome-dot" data-w="dot" data-i="${i}" aria-label="Card ${i + 1}: ${c.title}"></button>`).join('')}
        </div>
        <button type="button" class="btn text-btn primary welcome-next" data-w="next">Next</button>
      </footer>
      <div class="sr-only" aria-live="polite" id="welcome-live"></div>
    </div>`;
  document.body.appendChild(dlg);

  const themeList = mountThemeList(dlg.querySelector('#welcome-theme-list'), { label: 'Pick a theme', prefix: 'wt' });

  const track = dlg.querySelector('#welcome-track');
  const slides = [...dlg.querySelectorAll('.welcome-slide')];
  const dots = [...dlg.querySelectorAll('.welcome-dot')];
  const back = dlg.querySelector('[data-w="back"]');
  const next = dlg.querySelector('[data-w="next"]');
  const live = dlg.querySelector('#welcome-live');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let cur = -1;

  function setCurrent(i, announce = true) {
    if (i === cur) return;
    cur = i;
    slides.forEach((s, j) => { s.inert = j !== i; s.classList.toggle('is-current', j === i); });
    dots.forEach((d, j) => d.setAttribute('aria-current', j === i ? 'step' : 'false'));
    back.style.visibility = i === 0 ? 'hidden' : 'visible';
    const last = i === list.length - 1;
    next.textContent = last ? 'Get started' : 'Next';
    dlg.setAttribute('aria-labelledby', `welcome-title-${i}`);
    if (announce) live.textContent = `${i + 1} of ${list.length}: ${list[i].title}`;
  }

  function go(i) {
    i = Math.max(0, Math.min(list.length - 1, i));
    track.scrollTo({ left: i * track.clientWidth, behavior: reduce.matches ? 'auto' : 'smooth' });
    setCurrent(i);
  }

  let scrollTimer = 0;
  track.addEventListener('scroll', () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      const i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
      setCurrent(Math.max(0, Math.min(list.length - 1, i)));
    }, 60);
  });

  function markSeen() {
    try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* storage blocked */ }
  }

  dlg.addEventListener('click', (e) => {
    const b = e.target.closest('[data-w]');
    if (!b) return;
    const act = b.dataset.w;
    if (act === 'close') dlg.close();
    else if (act === 'back') go(cur - 1);
    else if (act === 'dot') go(Number(b.dataset.i));
    else if (act === 'next') { if (cur >= list.length - 1) dlg.close(); else go(cur + 1); }
  });
  dlg.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(cur + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(cur - 1); }
  });
  dlg.addEventListener('close', markSeen);
  // Keep the current card in place if the sheet resizes (rotation, window resize).
  new ResizeObserver(() => { if (dlg.open && cur >= 0) track.scrollLeft = cur * track.clientWidth; }).observe(track);

  function open() {
    cur = -1;
    dlg.showModal();
    track.scrollLeft = 0;
    setCurrent(0, false);
    for (const sl of slides) sl.scrollTop = 0;
    themeList.refresh();
    next.focus();
  }

  let seen = false;
  try { seen = localStorage.getItem(SEEN_KEY) === '1'; } catch { /* storage blocked */ }
  return { open, seen };
}
