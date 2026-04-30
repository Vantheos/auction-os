import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Mica Slate app palette
        brand: '#1E40AF',                  // was `accent` — renamed to avoid collision with shadcn `accent` (hover bg)
        text: '#0F172A',
        textDim: '#475569',
        textFaint: '#94A3B8',
        borderStrong: 'rgba(15,23,42,0.14)',
        surface: 'rgba(255,255,255,0.72)',
        surfaceAlt: '#F8FAFC',
        surfaceSolid: '#FFFFFF',
        success: { DEFAULT: '#15803D', bg: '#DCFCE7' },
        warning: { DEFAULT: '#92400E', bg: '#FEF3C7' },
        danger: { DEFAULT: '#B91C1C', bg: '#FEE2E2' },
        info: { DEFAULT: '#1E40AF', bg: '#DBEAFE' },

        // Lot state pill colors (from design handoff)
        'state-assigned':     { DEFAULT: '#1E40AF', bg: '#DBEAFE' },
        'state-unassigned':   { DEFAULT: '#92400E', bg: '#FEF3C7' },
        'state-sold':         { DEFAULT: '#15803D', bg: '#DCFCE7' },
        'state-picked-up':    { DEFAULT: '#475569', bg: '#E2E8F0' },
        'state-not-sellable': { DEFAULT: '#B91C1C', bg: '#FEE2E2' },
        'state-in-progress':  { DEFAULT: '#475569', bg: '#F1F5F9' },

        // AI status colors (used by inventory column even though AI ships in Phase 4)
        'ai-success': '#15803D',
        'ai-partial': '#B45309',
        'ai-failure': '#B91C1C',
        'ai-not-run': '#94A3B8',

        // Role pill colors
        'role-admin':     { DEFAULT: '#B91C1C', bg: '#FEE2E2' },
        'role-office':    { DEFAULT: '#1E40AF', bg: '#DBEAFE' },
        'role-warehouse': { DEFAULT: '#92400E', bg: '#FEF3C7' },

        // shadcn token bridge — these names are read by shadcn primitives
        // (Button, Dialog, Input, etc.). Values come from CSS variables in
        // globals.css, which are wired to the Mica palette above. Keep them
        // as `var(--*)` so a token tweak in globals.css propagates everywhere.
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)',
        },
        secondary: {
          DEFAULT: 'var(--secondary)',
          foreground: 'var(--secondary-foreground)',
        },
        muted: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--muted-foreground)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          foreground: 'var(--accent-foreground)',
        },
        destructive: {
          DEFAULT: 'var(--destructive)',
          foreground: 'var(--destructive-foreground)',
        },
        card: {
          DEFAULT: 'var(--card)',
          foreground: 'var(--card-foreground)',
        },
        popover: {
          DEFAULT: 'var(--popover)',
          foreground: 'var(--popover-foreground)',
        },
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
