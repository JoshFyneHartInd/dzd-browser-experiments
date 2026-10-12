// Runs before first paint so there is no flash of the wrong theme.
(function () {
  var mode = 'system';
  try { mode = localStorage.getItem('rps-theme') || 'system'; } catch (e) {}
  var dark = mode === 'dark' || (mode !== 'light' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
})();
