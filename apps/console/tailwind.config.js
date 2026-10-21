// Every color is a design token from src/styles/tokens.css, stored as RGB
// channels so Tailwind's opacity modifiers work (bg-danger/10).
const token = (name) => `rgb(var(--color-${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      bg: token('bg'),
      surface: token('surface'),
      'surface-2': token('surface-2'),
      border: token('border'),
      text: token('text'),
      'text-muted': token('text-muted'),
      accent: token('accent'),
      'accent-fg': token('accent-fg'),
      success: token('success'),
      warning: token('warning'),
      danger: token('danger'),
    },
    fontFamily: {
      sans: ['"Inter Variable"', 'system-ui', 'sans-serif'],
      mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
    },
    // One type scale for the whole app.
    fontSize: {
      '2xs': ['11px', '16px'],
      xs: ['12px', '16px'],
      sm: ['13px', '20px'],
      base: ['14px', '20px'],
      lg: ['16px', '24px'],
      xl: ['20px', '28px'],
      '2xl': ['24px', '32px'],
    },
    borderRadius: {
      none: '0',
      sm: 'var(--radius-sm)',
      DEFAULT: 'var(--radius)',
      lg: 'var(--radius-lg)',
      full: '9999px',
    },
    extend: {
      transitionDuration: { DEFAULT: '150ms' },
    },
  },
  plugins: [],
};
