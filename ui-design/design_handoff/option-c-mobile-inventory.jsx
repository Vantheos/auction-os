// option-c-mobile-inventory.jsx — Mobile inventory page (Option C · Mica Slate)
// Mobile inventory was an explicit gap in the original handoff (only mobile cataloging
// was designed). This file fills that gap, anchored to:
//   - v1 spec §8.7 (sticky top bar, slide-out filter drawer, single-column rows, no bulk)
//   - shipped Mica Slate token bridge (globals.css → shadcn CSS vars)
//   - shipped state-pill colors (src/components/ui/pill.tsx)
//   - shipped lot detail modal layout (src/components/lot/LotDetail.tsx)
//
// Screens:
//   1. Default — list with no filters active
//   2. Default with filters — chip indicator visible
//   3. Filter drawer open — Sheet overlay
//   4. Lot detail modal full-screen (assigned, editable)
//   5. Lot detail modal full-screen (sold, frozen — D-001 amended)
//   6. Empty state — "No lots match"

const M_TOKENS = {
  bg: '#EDEEF1',
  bgWash: 'linear-gradient(180deg, #EFF1F4 0%, #E5E7EC 100%)',
  surface: 'rgba(255,255,255,0.72)',
  surfaceSolid: '#FFFFFF',
  surfaceAlt: 'rgba(248,250,252,1)',
  border: 'rgba(15,23,42,0.08)',
  borderStrong: 'rgba(15,23,42,0.14)',
  text: '#0F172A',
  textDim: '#475569',
  textFaint: '#94A3B8',
  brand: '#1E40AF',
  infoBg: '#DBEAFE',
  danger: '#B91C1C',
  warn: '#92400E',
  success: '#15803D',
  font: '"Segoe UI Variable", "Segoe UI", system-ui, -apple-system, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, "SF Mono", monospace',
  radius: 6,
  radiusLg: 10,
};

// State pill colors — match shipped tailwind config exactly
const STATE_PILL = {
  'assigned':     { bg: '#DBEAFE', fg: '#1E40AF' },
  'unassigned':   { bg: '#FEF3C7', fg: '#92400E' },
  'sold':         { bg: '#DCFCE7', fg: '#15803D' },
  'picked-up':    { bg: '#E2E8F0', fg: '#475569' },
  'not-sellable': { bg: '#FEE2E2', fg: '#B91C1C' },
};

const AI_COLOR = {
  'success':  '#15803D',
  'partial':  '#B45309',
  'failure':  '#B91C1C',
  'not-run':  '#94A3B8',
};

// ───────────────────────────────────────── State pill
function StatePill({ state, frozen }) {
  const c = STATE_PILL[state];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: M_TOKENS.radius,
      fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase',
      background: c.bg, color: c.fg, fontFamily: M_TOKENS.font,
    }}>
      {STATE_LABELS[state]}
      {frozen && <Icon d={ICONS.lock} size={9} stroke={2} />}
    </span>
  );
}

// ───────────────────────────────────────── Inventory row (compact, mobile)
function MobileLotRow({ lot, onTap }) {
  return (
    <button onClick={onTap} style={{
      display: 'flex', alignItems: 'stretch', gap: 10,
      padding: 10, width: '100%', textAlign: 'left',
      background: M_TOKENS.surfaceSolid, border: `1px solid ${M_TOKENS.border}`,
      borderRadius: M_TOKENS.radius, cursor: 'pointer',
      fontFamily: M_TOKENS.font, color: M_TOKENS.text,
    }}>
      {/* photo */}
      <div style={{ width: 56, height: 56, flexShrink: 0, borderRadius: 4, overflow: 'hidden', border: `1px solid ${M_TOKENS.border}` }}>
        <PhotoPlaceholder hue={lot.hue} label={`#${lot.id}`} />
      </div>
      {/* center column */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 11, color: M_TOKENS.textDim, fontFamily: M_TOKENS.mono, letterSpacing: -0.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {lot.customer} · {lot.job.split('-').slice(0,3).join('-')} · #{lot.id}
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: M_TOKENS.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3 }}>
          {lot.title}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <StatePill state={lot.state} frozen={lot.state === 'picked-up' || lot.state === 'not-sellable'} />
          {lot.ai !== 'not-run' && (
            <span style={{ fontSize: 10, fontWeight: 700, color: AI_COLOR[lot.ai], letterSpacing: 0.3, textTransform: 'uppercase' }}>
              {lot.ai === 'success' ? 'AI' : lot.ai === 'partial' ? 'AI partial' : 'AI failed'}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// ───────────────────────────────────────── Sticky top bar
function MobileInventoryTopBar({ searchValue, onSearchChange, onFilterTap, filterCount, totalLots }) {
  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 5,
      padding: '12px 14px 10px',
      background: M_TOKENS.surfaceSolid,
      borderBottom: `1px solid ${M_TOKENS.border}`,
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: M_TOKENS.text, letterSpacing: -0.3 }}>Inventory</span>
        <span style={{ fontSize: 11, color: M_TOKENS.textDim, fontVariantNumeric: 'tabular-nums' }}>{totalLots} total</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* search input */}
        <div style={{
          flex: 1, height: 38, padding: '0 12px',
          border: `1px solid ${M_TOKENS.borderStrong}`,
          borderRadius: M_TOKENS.radius,
          background: M_TOKENS.surfaceSolid,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <Icon d={ICONS.search} size={13} />
          <input
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search lots"
            style={{
              flex: 1, border: 'none', outline: 'none', background: 'transparent',
              fontFamily: 'inherit', fontSize: 13, color: M_TOKENS.text, minWidth: 0,
            }}
          />
        </div>
        {/* filter button */}
        <button onClick={onFilterTap} style={{
          height: 38, padding: '0 12px', border: `1px solid ${filterCount > 0 ? M_TOKENS.brand : M_TOKENS.borderStrong}`,
          background: filterCount > 0 ? M_TOKENS.infoBg : M_TOKENS.surfaceSolid,
          borderRadius: M_TOKENS.radius, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 6,
          fontFamily: M_TOKENS.font, fontSize: 13, fontWeight: 500,
          color: filterCount > 0 ? M_TOKENS.brand : M_TOKENS.text,
        }}>
          <Icon d={ICONS.filter} size={13} />
          <span>Filter</span>
          {filterCount > 0 && (
            <span style={{
              minWidth: 18, height: 18, padding: '0 5px',
              borderRadius: 9, background: M_TOKENS.brand, color: '#fff',
              fontSize: 10, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{filterCount}</span>
          )}
        </button>
      </div>
    </div>
  );
}

// ───────────────────────────────────────── Default mobile inventory screen
function MobileInventoryScreen({ filtered = false, empty = false, onTapRow = () => {}, onOpenFilter = () => {} }) {
  const lots = empty ? [] : filtered
    ? SAMPLE_LOTS.filter(l => l.customer === 'Smith Estate')
    : SAMPLE_LOTS;
  const totalLots = empty ? 0 : (filtered ? lots.length : 412);

  return (
    <AndroidDevice width={380} height={780}>
      <div style={{
        height: '100%', display: 'flex', flexDirection: 'column',
        fontFamily: M_TOKENS.font, color: M_TOKENS.text, background: M_TOKENS.bg,
      }}>
        <MobileInventoryTopBar
          searchValue=""
          onSearchChange={() => {}}
          onFilterTap={onOpenFilter}
          filterCount={filtered ? 2 : 0}
          totalLots={totalLots}
        />

        {/* active-filter chips row (when filters active) */}
        {filtered && (
          <div style={{
            padding: '8px 14px', display: 'flex', gap: 6, flexWrap: 'wrap',
            borderBottom: `1px solid ${M_TOKENS.border}`, background: M_TOKENS.surfaceAlt,
          }}>
            <FilterChip label="Smith Estate" onRemove={() => {}} />
            <FilterChip label="2026-04-Smith-001" onRemove={() => {}} />
          </div>
        )}

        {/* list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {empty ? (
            <div style={{
              padding: '48px 20px', textAlign: 'center', color: M_TOKENS.textFaint,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
            }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%',
                background: M_TOKENS.surfaceAlt, border: `1px solid ${M_TOKENS.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: M_TOKENS.textDim,
              }}>
                <Icon d={ICONS.search} size={20} />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: M_TOKENS.text }}>No lots match</div>
                <div style={{ fontSize: 12, color: M_TOKENS.textDim, marginTop: 4 }}>Try clearing one or more filters.</div>
              </div>
              <button style={{
                height: 36, padding: '0 14px', border: `1px solid ${M_TOKENS.borderStrong}`,
                borderRadius: M_TOKENS.radius, background: M_TOKENS.surfaceSolid,
                color: M_TOKENS.text, fontFamily: 'inherit', fontSize: 12, fontWeight: 500, cursor: 'pointer',
              }}>Clear filters</button>
            </div>
          ) : (
            lots.map((l) => <MobileLotRow key={l.id} lot={l} onTap={() => onTapRow(l)} />)
          )}
        </div>
      </div>
    </AndroidDevice>
  );
}

function FilterChip({ label, onRemove }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 6px 4px 10px',
      background: M_TOKENS.infoBg,
      color: M_TOKENS.brand,
      borderRadius: 12, fontSize: 11, fontWeight: 600, fontFamily: M_TOKENS.font,
    }}>
      {label}
      <button onClick={onRemove} style={{
        width: 16, height: 16, border: 'none', background: 'transparent',
        color: M_TOKENS.brand, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}><Icon d={ICONS.close} size={9} stroke={2.4} /></button>
    </span>
  );
}

// ───────────────────────────────────────── Filter drawer (Sheet)
function MobileFilterSheet({ onClose }) {
  const [customerId, setCustomerId] = React.useState('smith');
  const [jobId, setJobId] = React.useState('2026-04-Smith-001');
  const [stateFilters, setStateFilters] = React.useState(['assigned', 'unassigned']);
  const [aiFilters, setAiFilters] = React.useState([]);
  const states = ['assigned', 'unassigned', 'sold', 'picked-up', 'not-sellable'];
  const aiStates = ['success', 'partial', 'failure', 'not-run'];

  const toggle = (list, setList, v) => setList(list.includes(v) ? list.filter(x => x !== v) : [...list, v]);

  return (
    <AndroidDevice width={380} height={780}>
      <div style={{
        height: '100%', position: 'relative',
        fontFamily: M_TOKENS.font, color: M_TOKENS.text, background: M_TOKENS.bg,
      }}>
        {/* dimmed underlay (the inventory list, dimmed) */}
        <div style={{ position: 'absolute', inset: 0, background: M_TOKENS.bg, opacity: 0.5 }} />
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.4)' }} onClick={onClose} />

        {/* slide-out sheet from bottom */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          background: M_TOKENS.surfaceSolid,
          borderTopLeftRadius: 14, borderTopRightRadius: 14,
          maxHeight: '88%', display: 'flex', flexDirection: 'column',
          boxShadow: '0 -12px 40px rgba(15,23,42,0.2)',
        }}>
          {/* drag handle */}
          <div style={{ padding: '8px 0 4px', display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: M_TOKENS.borderStrong }} />
          </div>

          {/* header */}
          <div style={{ padding: '4px 16px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${M_TOKENS.border}` }}>
            <span style={{ fontSize: 16, fontWeight: 700 }}>Filters</span>
            <button onClick={onClose} style={{ border: 'none', background: 'transparent', padding: 4, cursor: 'pointer', color: M_TOKENS.textDim, display: 'flex' }}>
              <Icon d={ICONS.close} size={14} stroke={2} />
            </button>
          </div>

          {/* body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 18 }}>
            <FilterField label="Customer">
              <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} style={fieldStyle()}>
                <option value="">All customers</option>
                <option value="smith">Smith Estate</option>
                <option value="jones">Jones Family</option>
                <option value="patel">Patel Holdings</option>
              </select>
            </FilterField>

            {customerId && (
              <FilterField label="Job">
                <select value={jobId} onChange={(e) => setJobId(e.target.value)} style={fieldStyle()}>
                  <option value="">All jobs</option>
                  <option value="2026-04-Smith-001">2026-04-Smith-001</option>
                  <option value="2026-03-Smith-009">2026-03-Smith-009 (closed)</option>
                </select>
              </FilterField>
            )}

            <FilterField label="Lot status">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {states.map(s => (
                  <FilterToggleChip key={s} label={STATE_LABELS[s]} active={stateFilters.includes(s)} onClick={() => toggle(stateFilters, setStateFilters, s)} />
                ))}
              </div>
            </FilterField>

            <FilterField label="AI status">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {aiStates.map(s => (
                  <FilterToggleChip key={s} label={s === 'not-run' ? 'Not run' : s.charAt(0).toUpperCase() + s.slice(1)} active={aiFilters.includes(s)} onClick={() => toggle(aiFilters, setAiFilters, s)} />
                ))}
              </div>
            </FilterField>

            <FilterField label="Date cataloged">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <input type="date" style={fieldStyle()} />
                <input type="date" style={fieldStyle()} />
              </div>
            </FilterField>
          </div>

          {/* footer */}
          <div style={{ padding: 12, borderTop: `1px solid ${M_TOKENS.border}`, display: 'flex', gap: 10 }}>
            <button style={{
              flex: 1, height: 44, border: `1px solid ${M_TOKENS.borderStrong}`, borderRadius: M_TOKENS.radius,
              background: M_TOKENS.surfaceSolid, color: M_TOKENS.text,
              fontFamily: 'inherit', fontSize: 13, fontWeight: 500, cursor: 'pointer',
            }}>Clear all</button>
            <button onClick={onClose} style={{
              flex: 2, height: 44, border: 'none', borderRadius: M_TOKENS.radius,
              background: M_TOKENS.brand, color: '#fff',
              fontFamily: 'inherit', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              boxShadow: `0 6px 16px rgba(30,64,175,0.35)`,
            }}>Apply filters</button>
          </div>
        </div>
      </div>
    </AndroidDevice>
  );
}

function FilterField({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: M_TOKENS.textDim, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 8 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function FilterToggleChip({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: '6px 12px', borderRadius: 14,
      border: `1px solid ${active ? M_TOKENS.brand : M_TOKENS.borderStrong}`,
      background: active ? M_TOKENS.infoBg : M_TOKENS.surfaceSolid,
      color: active ? M_TOKENS.brand : M_TOKENS.textDim,
      fontFamily: M_TOKENS.font, fontSize: 12, fontWeight: 600,
      cursor: 'pointer',
    }}>{label}</button>
  );
}

function fieldStyle() {
  return {
    width: '100%', height: 38, padding: '0 12px',
    border: `1px solid ${M_TOKENS.borderStrong}`,
    borderRadius: M_TOKENS.radius, background: M_TOKENS.surfaceSolid,
    fontFamily: M_TOKENS.font, fontSize: 13, color: M_TOKENS.text,
    outline: 'none', boxSizing: 'border-box', appearance: 'none',
  };
}

// ───────────────────────────────────────── Lot detail modal (full-screen on mobile)
function MobileLotDetailScreen({ lot, frozen = false, onClose }) {
  const isFrozen = frozen || lot.state === 'sold' || lot.state === 'picked-up' || lot.state === 'not-sellable';

  return (
    <AndroidDevice width={380} height={780}>
      <div style={{
        height: '100%', display: 'flex', flexDirection: 'column',
        fontFamily: M_TOKENS.font, color: M_TOKENS.text, background: M_TOKENS.bg,
      }}>
        {/* top bar — back button, state pill, close */}
        <div style={{
          padding: '10px 14px', borderBottom: `1px solid ${M_TOKENS.border}`,
          background: M_TOKENS.surfaceSolid,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <button onClick={onClose} style={{
            border: 'none', background: 'transparent', padding: 4, cursor: 'pointer',
            color: M_TOKENS.text, display: 'flex',
          }}>
            <Icon d={ICONS.back} size={16} stroke={2} />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.1, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>Lot #{lot.id}</span>
              <StatePill state={lot.state} frozen={isFrozen} />
            </div>
            <div style={{ fontSize: 11, color: M_TOKENS.textDim, marginTop: 2, fontFamily: M_TOKENS.mono, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {lot.customer} · {lot.job}
            </div>
          </div>
        </div>

        {/* body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* photo gallery — large hero + thumbs */}
          <div style={{ borderRadius: M_TOKENS.radius, overflow: 'hidden', aspectRatio: '4/3', border: `1px solid ${M_TOKENS.border}` }}>
            <PhotoPlaceholder hue={lot.hue} label={`lot ${lot.id} cover`} />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{ flex: 1, aspectRatio: '1', borderRadius: 4, overflow: 'hidden', border: `1px solid ${M_TOKENS.border}`, opacity: lot.state === 'not-sellable' ? 0.6 : 1 }}>
                <PhotoPlaceholder hue={(lot.hue + (i+1) * 20) % 360} label={`#${i+2}`} />
              </div>
            ))}
            <div style={{ flex: 1, aspectRatio: '1', borderRadius: 4, border: `1px dashed ${M_TOKENS.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: M_TOKENS.textFaint }}>
              <span style={{ fontSize: 10 }}>+1</span>
            </div>
          </div>

          {/* fields — editable or readonly based on state */}
          {isFrozen ? (
            <ReadonlyFields lot={lot} />
          ) : (
            <EditableFields lot={lot} />
          )}
        </div>

        {/* sticky footer — actions */}
        <div style={{
          padding: 10, borderTop: `1px solid ${M_TOKENS.border}`,
          background: M_TOKENS.surfaceSolid,
          display: 'flex', gap: 6, flexWrap: 'wrap',
        }}>
          <FooterBtn icon={ICONS.printer} label="Reprint" />
          {!isFrozen && lot.state === 'assigned' && <FooterBtn icon={ICONS.tag} label="Move" />}
          <FooterBtn icon={ICONS.chevron} label={lot.state === 'assigned' ? 'Sold' : 'Status'} primary={lot.state === 'assigned'} />
        </div>
      </div>
    </AndroidDevice>
  );
}

function ReadonlyFields({ lot }) {
  const fields = [
    ['Title', lot.title],
    ['Price', lot.price !== null ? `$${lot.price}` : '—'],
    ['Quantity', '1'],
    ['Special notes', lot.notes],
    ['Untested', 'No'],
    ['Description', '—'],
  ];
  return (
    <div style={{
      padding: 12, borderRadius: M_TOKENS.radius, border: `1px solid ${M_TOKENS.border}`,
      background: M_TOKENS.surfaceSolid,
      display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 12, rowGap: 6,
    }}>
      {fields.map(([k, v]) => (
        <React.Fragment key={k}>
          <dt style={{ fontSize: 11, color: M_TOKENS.textDim, fontWeight: 500 }}>{k}</dt>
          <dd style={{ fontSize: 12, color: M_TOKENS.text, margin: 0, fontWeight: 500 }}>{v}</dd>
        </React.Fragment>
      ))}
    </div>
  );
}

function EditableFields({ lot }) {
  const [notes, setNotes] = React.useState(lot.notes || 'None');
  const [untested, setUntested] = React.useState(false);
  const [qty, setQty] = React.useState(1);
  const isClothing = notes === 'CLOTHING';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Row 1 — warehouse priority: Special Notes + Untested */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <FormFieldM label="Special notes" required>
          <select value={notes} onChange={(e) => setNotes(e.target.value)} style={selectStyle()}>
            <option>None</option><option>TOOL ONLY</option><option>READ</option><option>CLOTHING</option>
          </select>
        </FormFieldM>
        <FormFieldM label="Untested">
          <button onClick={() => setUntested(!untested)} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px', height: 38, width: '100%',
            borderRadius: M_TOKENS.radius, minWidth: 0,
            border: `1px solid ${untested ? M_TOKENS.brand : M_TOKENS.borderStrong}`,
            background: untested ? M_TOKENS.infoBg : M_TOKENS.surfaceSolid,
            cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', boxSizing: 'border-box',
          }}>
            <span style={{
              width: 16, height: 16, borderRadius: 3,
              border: `1.5px solid ${untested ? M_TOKENS.brand : M_TOKENS.borderStrong}`,
              background: untested ? M_TOKENS.brand : M_TOKENS.surfaceSolid,
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0,
            }}>{untested && <Icon d={ICONS.check} size={10} stroke={2.4} />}</span>
            <span style={{ fontSize: 13, fontWeight: 500, color: untested ? M_TOKENS.brand : M_TOKENS.text }}>Untested</span>
          </button>
        </FormFieldM>
      </div>

      {/* Row 2 — Quantity stepper + Price */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <FormFieldM label="Quantity">
          <div style={{ display: 'flex', alignItems: 'center', height: 38, border: `1px solid ${M_TOKENS.borderStrong}`, borderRadius: M_TOKENS.radius, background: M_TOKENS.surfaceSolid, overflow: 'hidden', minWidth: 0, boxSizing: 'border-box' }}>
            <button onClick={() => setQty(Math.max(1, qty - 1))} style={stepBtnStyle()}>
              <Icon d="M3 8h10" size={13} stroke={2} />
            </button>
            <input type="number" value={qty} onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))} style={{
              flex: 1, width: '100%', height: '100%', border: 'none', outline: 'none', textAlign: 'center',
              fontFamily: M_TOKENS.font, fontSize: 14, fontWeight: 600, color: M_TOKENS.text,
              background: 'transparent', fontVariantNumeric: 'tabular-nums', minWidth: 0, padding: 0,
            }} />
            <button onClick={() => setQty(qty + 1)} style={stepBtnStyle()}>
              <Icon d={ICONS.plus} size={13} stroke={2} />
            </button>
          </div>
        </FormFieldM>
        <FormFieldM label="Price">
          <input defaultValue={lot.price ?? ''} placeholder="$" style={fieldStyle()} />
        </FormFieldM>
      </div>

      {/* Row 3 — conditional Size (only when CLOTHING) */}
      {isClothing && (
        <FormFieldM label="Size">
          <input defaultValue="Large" style={fieldStyle()} />
        </FormFieldM>
      )}

      {/* Row 4 — Title */}
      <FormFieldM label="Title" hint="max 50 chars">
        <input defaultValue={lot.title} maxLength={50} style={fieldStyle()} />
      </FormFieldM>

      {/* Row 5 — Description */}
      <FormFieldM label="Description">
        <textarea defaultValue="" placeholder="—" rows={3} style={{ ...fieldStyle(), height: 'auto', padding: 10, resize: 'vertical' }} />
      </FormFieldM>

      {/* Row 6 — Ref 1 + Ref 2 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <FormFieldM label="Ref 1">
          <input style={fieldStyle()} />
        </FormFieldM>
        <FormFieldM label="Ref 2">
          <input style={fieldStyle()} />
        </FormFieldM>
      </div>
    </div>
  );
}

function stepBtnStyle() {
  return {
    width: 34, height: '100%', border: 'none',
    borderRight: `1px solid ${M_TOKENS.border}`, borderLeft: `1px solid ${M_TOKENS.border}`,
    background: M_TOKENS.surfaceAlt, color: M_TOKENS.text, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  };
}

function selectStyle() {
  return {
    ...fieldStyle(),
    backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path fill='${encodeURIComponent(M_TOKENS.textDim)}' d='M0 0h10L5 6z'/></svg>")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 12px center',
    paddingRight: 28,
  };
}

function FormFieldM({ label, required, hint, children }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11, color: M_TOKENS.textDim, fontWeight: 500, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span>{label}{required && <span style={{ color: M_TOKENS.danger, marginLeft: 2 }}>*</span>}</span>
        {hint && <span style={{ color: M_TOKENS.textFaint, fontWeight: 400, fontSize: 10 }}>({hint})</span>}
      </div>
      {children}
    </div>
  );
}

function FooterBtn({ icon, label, primary }) {
  return (
    <button style={{
      flex: 1, height: 40, padding: '0 12px',
      border: primary ? 'none' : `1px solid ${M_TOKENS.borderStrong}`,
      background: primary ? M_TOKENS.brand : M_TOKENS.surfaceSolid,
      color: primary ? '#fff' : M_TOKENS.text,
      borderRadius: M_TOKENS.radius, cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      fontFamily: M_TOKENS.font, fontSize: 12, fontWeight: 600,
      boxShadow: primary ? '0 4px 12px rgba(30,64,175,0.25)' : 'none',
    }}>
      <Icon d={icon} size={13} />
      {label}
    </button>
  );
}

Object.assign(window, {
  MobileInventoryScreen, MobileFilterSheet, MobileLotDetailScreen, M_TOKENS,
});
