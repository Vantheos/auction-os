import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: '#1E40AF',
        text: '#0F172A',
        textDim: '#475569',
        textFaint: '#94A3B8',
        border: 'rgba(15,23,42,0.08)',
        borderStrong: 'rgba(15,23,42,0.14)',
        surface: 'rgba(255,255,255,0.72)',
        surfaceAlt: '#F8FAFC',
        surfaceSolid: '#FFFFFF',
        success: { DEFAULT: '#15803D', bg: '#DCFCE7' },
        warning: { DEFAULT: '#92400E', bg: '#FEF3C7' },
        danger: { DEFAULT: '#B91C1C', bg: '#FEE2E2' },
        info: { DEFAULT: '#1E40AF', bg: '#DBEAFE' },
      },
      fontFamily: {
        sans: ['"Segoe UI Variable"', '"Segoe UI"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', '"SF Mono"', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '6px',
        lg: '10px',
        pill: '12px',
      },
      backgroundImage: {
        wash: 'linear-gradient(180deg, #EFF1F4 0%, #E5E7EC 100%)',
      },
      // shadcn CSS variable color tokens — required for @apply in globals.css
      outlineColor: {
        ring: 'oklch(var(--ring) / <alpha-value>)',
      },
    },
  },
  plugins: [],
} satisfies Config;
