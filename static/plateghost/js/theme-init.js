// Runs in <head> before first paint so a saved theme choice doesn't flash.
// No saved choice = follow the system setting.
try {
  const t = localStorage.getItem('pg-theme');
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
} catch (e) {}
