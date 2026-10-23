/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--bg) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        surface2: 'rgb(var(--surface-2) / <alpha-value>)',
        surface3: 'rgb(var(--surface-3) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        mute: 'rgb(var(--mute) / <alpha-value>)',
        faint: 'rgb(var(--faint) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        lime: 'rgb(var(--lime) / <alpha-value>)',
        onlime: 'rgb(var(--on-lime) / <alpha-value>)',
        pill: 'rgb(var(--pill) / <alpha-value>)',
        onpill: 'rgb(var(--on-pill) / <alpha-value>)',
        up: 'rgb(var(--up) / <alpha-value>)',
        down: 'rgb(var(--down) / <alpha-value>)',
        warn: 'rgb(var(--warn) / <alpha-value>)',
        violet: 'rgb(var(--violet) / <alpha-value>)',
        lavender: 'rgb(var(--lavender) / <alpha-value>)',
        magenta: 'rgb(var(--magenta) / <alpha-value>)',
        deepblue: 'rgb(var(--deepblue) / <alpha-value>)',
        amber: 'rgb(var(--amber) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Geist', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"Geist Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: { card: '28px', inner: '20px', well: '16px' },
      letterSpacing: { tightest: '-0.045em', tighter2: '-0.03em' },
      boxShadow: {
        lift: 'var(--shadow-lift)',
        float: 'var(--shadow-float)',
        edge: 'inset 0 1px 0 0 rgb(var(--edge) / var(--edge-a))',
      },
    },
  },
  plugins: [],
};
