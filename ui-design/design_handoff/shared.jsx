// shared.jsx — Fluent-flavored primitives + sample data shared by all 3 options.
// Each option imports its own theme but reuses these building blocks.

// ── Sample data ────────────────────────────────────────────────────────────
const SAMPLE_LOTS = [
  { id: 13, customer: 'Smith Estate', job: '2026-04-Smith-001', title: '$45- 1x Antique Brass Vase', state: 'sold', notes: 'TOOL ONLY', ai: 'success', price: 45, hue: 28 },
  { id: 12, customer: 'Smith Estate', job: '2026-04-Smith-001', title: '$120- 1x Walnut Dining Chair', state: 'unassigned', notes: 'None', ai: 'success', price: 120, hue: 200 },
  { id: 47, customer: 'Jones Family', job: '2026-03-Jones-014', title: '$$$- 1x Hamilton Pocket Watch READ', state: 'assigned', notes: 'READ', ai: 'partial', price: null, hue: 48 },
  { id: 11, customer: 'Smith Estate', job: '2026-04-Smith-001', title: '$15- 3x Vintage Mason Jar', state: 'assigned', notes: 'None', ai: 'success', price: 15, hue: 140 },
  { id: 46, customer: 'Jones Family', job: '2026-03-Jones-014', title: '$80- 1x Levi 501 Denim Jacket', state: 'assigned', notes: 'CLOTHING', ai: 'success', price: 80, hue: 220 },
  { id: 10, customer: 'Smith Estate', job: '2026-04-Smith-001', title: '$$$- 1x Stanley 16oz Hammer', state: 'picked-up', notes: 'TOOL ONLY', ai: 'success', price: null, hue: 12 },
  { id: 45, customer: 'Jones Family', job: '2026-03-Jones-014', title: '$22- 1x Ceramic Mixing Bowl', state: 'assigned', notes: 'None', ai: 'failure', price: 22, hue: 320 },
  { id: 9,  customer: 'Smith Estate', job: '2026-04-Smith-001', title: '$60- 1x Cast Iron Skillet UNTESTED', state: 'unassigned', notes: 'None', ai: 'success', price: 60, hue: 0 },
  { id: 44, customer: 'Jones Family', job: '2026-03-Jones-014', title: '$$$- 1x Polaroid Land Camera', state: 'not-sellable', notes: 'None', ai: 'success', price: null, hue: 280 },
];

// State display tokens — each option overrides colors via a theme-bound version
const STATE_LABELS = {
  'assigned': 'Assigned',
  'unassigned': 'Unassigned',
  'sold': 'Sold',
  'picked-up': 'Picked up',
  'not-sellable': 'Not sellable',
};

// ── Tiny SVG icon set (Fluent-ish stroke style) ────────────────────────────
const Icon = ({ d, size = 16, stroke = 1.5, fill = 'none' }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill={fill} stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
    {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p} />) : <path d={d} />}
  </svg>
);

const ICONS = {
  search: 'M7 2a5 5 0 1 1 0 10A5 5 0 0 1 7 2zm7 12l-3.5-3.5',
  filter: 'M2 3h12M4 8h8M6 13h4',
  plus: 'M8 3v10M3 8h10',
  camera: ['M3 5h2l1-1.5h4L11 5h2a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z', 'M8 11.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z'],
  check: 'M3 8l3 3 7-7',
  chevron: 'M5 6l3 3 3-3',
  chevronR: 'M6 3l3 3-3 3',
  chevronL: 'M9 3L6 6l3 3',
  close: 'M3 3l10 10M13 3L3 13',
  more: 'M3.5 8h.01M8 8h.01M12.5 8h.01',
  edit: ['M2 14l1-3 7-7 2 2-7 7-3 1z', 'M9 4l2 2'],
  printer: ['M4 6V3h8v3', 'M4 13h8v-3H4v3z', 'M4 6h8a1 1 0 0 1 1 1v3H3V7a1 1 0 0 1 1-1z'],
  trash: ['M3 4h10', 'M5 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1', 'M4 4v9a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4'],
  rows: 'M2 4h12M2 8h12M2 12h12',
  cards: ['M2 2h5v5H2zM9 2h5v5H9zM2 9h5v5H2zM9 9h5v5H9z'],
  inventory: ['M2 4l6-2 6 2v8l-6 2-6-2V4z', 'M8 8L2 6M8 8l6-2M8 8v6'],
  customers: ['M5 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4z', 'M11 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4z', 'M2 13c0-2 1.5-3 3-3s3 1 3 3', 'M8 13c0-2 1.5-3 3-3s3 1 3 3'],
  gear: ['M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z', 'M13 8l1.5-.5-.5-1.5L12.5 6 12 4.5 13 3l-1-1L10.5 3 9 2.5 8.5 1h-1L7 2.5 5.5 3 4 2 3 3l1 1.5L3.5 6 2 6.5 1.5 8 3 8.5 3.5 10 2 11l1 1 1.5-1L6 11.5 6.5 13h1L8 11.5 9.5 11 11 12l1-1-1-1.5.5-1.5z'],
  ai: ['M8 2L9 6L13 7L9 8L8 12L7 8L3 7L7 6z', 'M13 2v2M14 3h-2M3 12v2M4 13H2'],
  upload: ['M8 10V2', 'M5 5l3-3 3 3', 'M2 12v1a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-1'],
  qr: ['M2 2h4v4H2zM10 2h4v4h-4zM2 10h4v4H2z', 'M9 9h2M13 9v2M9 13h1v1', 'M11 11h3v1', 'M9 11v0'],
  warning: ['M8 2L1 13h14L8 2z', 'M8 6v3M8 11.5v.5'],
  error: ['M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2z', 'M5.5 5.5l5 5M10.5 5.5l-5 5'],
  lock: ['M4 7V5a4 4 0 0 1 8 0v2', 'M3 7h10v6H3z'],
  back: 'M13 8H3M7 4L3 8l4 4',
  tag: ['M2 8V3a1 1 0 0 1 1-1h5l6 6-6 6-6-6z', 'M5 5h.01'],
};

// ── Photo placeholder ──────────────────────────────────────────────────────
function PhotoPlaceholder({ hue = 30, label, w = '100%', h = '100%', stripes = true }) {
  const bg = `hsl(${hue}, 18%, 88%)`;
  const stripe = `hsl(${hue}, 18%, 82%)`;
  return (
    <div style={{
      width: w, height: h, background: bg,
      backgroundImage: stripes ? `repeating-linear-gradient(45deg, ${stripe} 0 8px, transparent 8px 16px)` : 'none',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: `hsl(${hue}, 12%, 35%)`, fontFamily: '"JetBrains Mono", "SF Mono", Menlo, monospace', fontSize: 10,
      letterSpacing: 0.5, textTransform: 'uppercase',
    }}>
      {label || 'photo'}
    </div>
  );
}

Object.assign(window, { SAMPLE_LOTS, STATE_LABELS, Icon, ICONS, PhotoPlaceholder });
