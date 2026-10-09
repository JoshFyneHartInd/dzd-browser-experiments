// Tailwind Play CDN config. Colors map to the CSS variables in css/style.css.
tailwind.config = {
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)', surface: 'var(--surface)', sunk: 'var(--sunk)',
        ink: 'var(--ink)', muted: 'var(--muted)', line: 'var(--line)',
        accent: 'var(--accent)', 'accent-ink': 'var(--accent-ink)',
        warn: 'var(--warn)', 'warn-bg': 'var(--warn-bg)', bad: 'var(--bad)',
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
};
