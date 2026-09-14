(function () {
  const THEME_KEY = 'word-checker-theme';
  const root = document.documentElement;
  const themeSelect = document.getElementById('themeSelect');

  function applyTheme(theme) {
    root.setAttribute('data-theme', theme);
    themeSelect.value = theme;
    localStorage.setItem(THEME_KEY, theme);
  }

  themeSelect.addEventListener('change', () => applyTheme(themeSelect.value));

  applyTheme(localStorage.getItem(THEME_KEY) || 'dark');

  const form = document.getElementById('checkForm');
  const input = document.getElementById('wordInput');
  const btn = document.getElementById('checkBtn');
  const result = document.getElementById('result');
  const status = document.getElementById('status');

  let wordSet = null; // Set gives O(1) average-time lookups.

  // Only allow alphabetic characters as the user types.
  input.addEventListener('input', () => {
    const cleaned = input.value.replace(/[^a-zA-Z]/g, '');
    if (cleaned !== input.value) input.value = cleaned;
  });

  function setResult(word, isWord) {
    result.className = isWord ? 'is-good' : 'is-bad';
    result.innerHTML =
      '<span class="verdict-word">' + word + '</span>' +
      '<span class="verdict-label">' + (isWord ? 'is a word' : 'is not a word') + '</span>';
  }

  function clearResult() {
    result.className = '';
    result.innerHTML = '';
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const raw = input.value.trim();
    if (!raw || !wordSet) { clearResult(); return; }
    const lower = raw.toLowerCase();
    setResult(raw, wordSet.has(lower));
  });

  async function loadWords() {
    try {
      const res = await fetch('words.txt');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const text = await res.text();

      // Build the Set once; every subsequent check is a single hash lookup.
      const words = text.split(/\r?\n/);
      wordSet = new Set();
      for (let i = 0; i < words.length; i++) {
        const w = words[i].trim().toLowerCase();
        if (w) wordSet.add(w);
      }

      status.textContent = wordSet.size.toLocaleString() + ' English words loaded.';
      input.disabled = false;
      btn.disabled = false;
      input.focus();
    } catch (err) {
      status.textContent = 'Could not load words.txt. Make sure it sits next to this HTML file and you are running it via a local server (not file://).';
      status.classList.add('error');
    }
  }

  loadWords();
})();
