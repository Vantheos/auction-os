// option-c-lifecycle.jsx — Lot lifecycle (Option C · Mica Slate, Desktop)
// Screens:
//   1. Frozen-state lot modal (sold / picked-up / not-sellable, read-only)
//   2. Move-to-auction destination picker (Customer → Job cascade, inside modal)
//   3. State-change confirmations (→ not-sellable, sold → picked-up, hard-delete)
//   4. AI run states (inventory rows + AI status section in modal)
//
// Reuses C_TOKENS, CUSTOMERS, JOBS_BY_CUSTOMER from option-c-flow.jsx.
// Reuses SAMPLE_LOTS, STATE_LABELS, ICONS, Icon, PhotoPlaceholder from shared.jsx.

// ─── State machine helpers
const STATE_DOT = {
  'assigned':     '#1E40AF',
  'unassigned':   '#94A3B8',
  'sold':         '#15803D',
  'picked-up':    '#64748B',
  'not-sellable': '#B91C1C',
};
const STATE_BG = {
  'assigned':     'rgba(30,64,175,0.12)',
  'unassigned':   '#F1F5F9',
  'sold':         '#DCFCE7',
  'picked-up':    '#E2E8F0',
  'not-sellable': '#FEE2E2',
};
const STATE_FG = {
  'assigned':     '#1E40AF',
  'unassigned':   '#64748B',
  'sold':         '#15803D',
  'picked-up':    '#475569',
  'not-sellable': '#B91C1C',
};
// Per design D-001: `sold` is editable (sale can fall through). Only terminal states are frozen.
const FROZEN_STATES = new Set(['picked-up', 'not-sellable']);

// Per the spec state machine
const LEGAL_TRANSITIONS = {
  'assigned':     ['unassigned', 'sold', 'not-sellable'],
  'unassigned':   ['assigned', 'not-sellable'],
  'sold':         ['picked-up', 'unassigned'],          // sold → picked-up (terminal); revert to unassigned if sale falls through
  'picked-up':    [],                                    // terminal
  'not-sellable': [],                                    // terminal
};
const CONFIRM_TRANSITIONS = new Set([
  'assigned→not-sellable',
  'unassigned→not-sellable',
  'sold→picked-up',
]);

// ─── Sample lot data for lifecycle screens
const LIFECYCLE_LOTS = [
  { id: 13, lot_number: 13, customer: 'Smith Estate', job: '2026-04-Smith-001', title: 'Antique brass vase, ~12" tall', desc: 'Brass vase with patina, approx 12" tall. Heavy base, no visible cracks. Some tarnish on rim.', state: 'sold', notes: 'TOOL ONLY', ai: 'success', price: 45, qty: 1, hue: 28, dateCataloged: '2026-04-12', soldFor: 52, buyer: 'B-1042' },
  { id: 14, lot_number: 14, customer: 'Smith Estate', job: '2026-04-Smith-001', title: 'Walnut dining chair', desc: 'Solid walnut dining chair with upholstered seat. Minor wear on armrests.', state: 'picked-up', notes: 'None', ai: 'success', price: 120, qty: 1, hue: 200, dateCataloged: '2026-04-12', soldFor: 130, buyer: 'B-1018', pickedUpDate: '2026-04-28' },
  { id: 15, lot_number: 15, customer: 'Jones Family', job: '2026-03-Jones-014', title: 'Cracked porcelain figurine', desc: 'Porcelain figurine, ~6" tall. Significant crack across base; not safe for sale.', state: 'not-sellable', notes: 'None', ai: 'success', price: 0, qty: 1, hue: 320, dateCataloged: '2026-03-30', notSellableReason: 'Damaged beyond repair' },
  { id: 16, lot_number: 16, customer: 'Patel Holdings', job: '2026-04-Patel-002', title: 'Vintage leather handbag', desc: 'Brown leather handbag, brand TBD. Minor scuffing on corners. Interior lining intact.', state: 'assigned', notes: 'None', ai: 'partial', aiError: 'Reference price lookup failed: matching items not found in comparable sales', price: null, qty: 1, hue: 60, dateCataloged: '2026-04-19' },
  { id: 17, lot_number: 17, customer: "O'Connor Liquidation", job: '2026-04-OConnor-005', title: '(AI run pending)', desc: '', state: 'unassigned', notes: 'TOOL ONLY', ai: 'failure', aiError: 'Vision API request failed: photos could not be processed (image quality too low). Re-take photos or run AI again.', price: null, qty: 1, hue: 240, dateCataloged: '2026-04-25' },
  { id: 18, lot_number: 18, customer: 'Smith Estate', job: '2026-04-Smith-001', title: 'Set of 4 dining placemats', desc: 'Linen placemats, neutral palette. Lightly used.', state: 'assigned', notes: 'None', ai: 'success', price: 22, qty: 4, hue: 100, dateCataloged: '2026-04-15' },
];

// ────────────────────────────────────────────────────────────────────────
// Lot detail modal (lifecycle-aware version)
// Renders ALL the lifecycle states based on `lot` and an optional `overlay` that
// drives sub-screens: 'state' (state menu), 'move' (move-to-auction picker),
// 'confirm:<from>:<to>' or 'confirm:delete' (confirmation dialog).
// ────────────────────────────────────────────────────────────────────────
function LifecycleLotModal({ lot, overlay = null, onChangeOverlay = () => {}, onClose = () => {}, isAdmin = true, width = 880, height = 580 }) {
  const frozen = FROZEN_STATES.has(lot.state);
  const editable = !frozen;
  const t = C_TOKENS;

  return (
    <div style={{
      width, height, borderRadius: t.radiusLg, overflow: 'hidden',
      background: t.bgWash, border: `1px solid ${t.borderStrong}`,
      boxShadow: '0 24px 64px -12px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.5) inset',
      display: 'flex', flexDirection: 'column', position: 'relative',
      fontFamily: t.font, color: t.text,
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 18px', borderBottom: `1px solid ${t.border}`,
        display: 'flex', alignItems: 'center', gap: 12,
        background: t.surface, backdropFilter: 'blur(12px)',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: t.textDim, fontFamily: '"JetBrains Mono", monospace', letterSpacing: 0.2 }}>
            {lot.customer} · {lot.job}
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: -0.2 }}>
            Lot {lot.lot_number} — {lot.title}
          </div>
        </div>
        <StatePill state={lot.state} />
        {frozen && (
          <span style={{
            fontSize: 11, padding: '3px 9px', borderRadius: 10,
            background: '#FEF3C7', color: '#92400E', fontWeight: 600,
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}>
            <Icon d={ICONS.lock} size={11} /> Read-only
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button onClick={onClose} style={{
          border: 'none', background: 'transparent', cursor: 'pointer', color: t.textDim,
          width: 30, height: 30, borderRadius: t.radius, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}><Icon d={ICONS.close} size={14} /></button>
      </div>

      {/* Body */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Left — photos */}
        <div style={{ flex: '0 0 320px', padding: 16, borderRight: `1px solid ${t.border}`, background: t.surfaceAlt, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ aspectRatio: '4/3', borderRadius: t.radius, overflow: 'hidden', border: `1px solid ${t.border}`, position: 'relative', filter: frozen ? 'grayscale(0.3)' : 'none' }}>
            <PhotoPlaceholder hue={lot.hue} label="photo 1 of 5" />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[0,1,2,3,4].map(i => (
              <div key={i} style={{ flex: 1, aspectRatio: '1', borderRadius: t.radius, overflow: 'hidden', border: `${i === 0 ? 2 : 1}px solid ${i === 0 ? 'var(--c-accent)' : t.border}` }}>
                <PhotoPlaceholder hue={(lot.hue + i * 40) % 360} />
              </div>
            ))}
          </div>
        </div>

        {/* Right — fields + AI status */}
        <div style={{ flex: 1, padding: 18, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <ROField label="Title" value={lot.title} dim={!lot.title} />
          <ROField label="Description" value={lot.desc || '—'} multiline />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <ROField label="Price" value={lot.price ? `$${lot.price}` : '—'} mono />
            <ROField label="Quantity" value={lot.qty} mono />
            <ROField label="Special notes" value={lot.notes} />
          </div>

          {/* Frozen-state-specific fields */}
          {lot.state === 'sold' && (
            <FrozenBlock t={t} title="Sale" rows={[
              ['Sold for', `$${lot.soldFor}`],
              ['Buyer', lot.buyer],
            ]} />
          )}
          {lot.state === 'picked-up' && (
            <FrozenBlock t={t} title="Sale & pickup" rows={[
              ['Sold for', `$${lot.soldFor}`],
              ['Buyer', lot.buyer],
              ['Picked up', lot.pickedUpDate],
            ]} />
          )}
          {lot.state === 'not-sellable' && (
            <FrozenBlock t={t} title="Reason marked not-sellable" rows={[
              ['Reason', lot.notSellableReason],
            ]} />
          )}

          {/* AI status — appears only when partial / failure */}
          {(lot.ai === 'partial' || lot.ai === 'failure') && (
            <AIStatusBlock t={t} state={lot.ai} message={lot.aiError} />
          )}
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: 12, borderTop: `1px solid ${t.border}`, display: 'flex', gap: 8, alignItems: 'center', background: t.surface, backdropFilter: 'blur(12px)' }}>
        <span style={{ fontSize: 11, color: t.textFaint, fontFamily: '"JetBrains Mono", monospace' }}>
          Cataloged {lot.dateCataloged}
        </span>
        <div style={{ flex: 1 }} />
        {editable && <button style={btnLifecycle(t, 'subtle')}><Icon d={ICONS.edit} size={13} /> Edit</button>}
        <button style={btnLifecycle(t, 'subtle')}><Icon d={ICONS.printer} size={13} /> Reprint label</button>
        {/* Move-to-auction only for `assigned` */}
        {lot.state === 'assigned' && (
          <button onClick={() => onChangeOverlay('move')} style={btnLifecycle(t, 'subtle')}>
            <Icon d="M2 8h12M10 4l4 4-4 4" size={13} stroke={2} /> Move to another auction
          </button>
        )}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => onChangeOverlay(overlay === 'state' ? null : 'state')}
            disabled={LEGAL_TRANSITIONS[lot.state].length === 0}
            style={{
              ...btnLifecycle(t, 'subtle'),
              opacity: LEGAL_TRANSITIONS[lot.state].length === 0 ? 0.45 : 1,
              cursor: LEGAL_TRANSITIONS[lot.state].length === 0 ? 'not-allowed' : 'pointer',
              borderColor: overlay === 'state' ? 'var(--c-accent)' : t.borderStrong,
              background: overlay === 'state' ? 'rgba(30,64,175,0.06)' : t.surfaceSolid,
            }}>
            Change state ▾
          </button>
          {overlay === 'state' && (
            <StateMenu lot={lot} onPick={(to) => {
              const key = `${lot.state}→${to}`;
              if (CONFIRM_TRANSITIONS.has(key)) onChangeOverlay(`confirm:${lot.state}:${to}`);
              else onChangeOverlay(null); // direct transition; no confirm
            }} />
          )}
        </div>
        {isAdmin && (
          <button onClick={() => onChangeOverlay('confirm:delete')} style={{ ...btnLifecycle(t, 'subtle'), color: t.danger, borderColor: 'rgba(185,28,28,0.25)' }}>
            <Icon d={ICONS.trash} size={13} /> Delete
          </button>
        )}
        <button onClick={onClose} style={btnLifecycle(t, 'primary')}>Close</button>
      </div>

      {/* Overlays */}
      {overlay === 'move' && (
        <MoveToAuctionOverlay
          lot={lot}
          onCancel={() => onChangeOverlay(null)}
          onConfirm={() => onChangeOverlay(null)}
        />
      )}
      {typeof overlay === 'string' && overlay.startsWith('confirm:') && (
        <ConfirmOverlay
          spec={overlay}
          lot={lot}
          onCancel={() => onChangeOverlay(null)}
          onConfirm={() => onChangeOverlay(null)}
        />
      )}
    </div>
  );
}

// ─── State menu (anchored above the button)
function StateMenu({ lot, onPick }) {
  const t = C_TOKENS;
  const opts = LEGAL_TRANSITIONS[lot.state];
  return (
    <div style={{
      position: 'absolute', bottom: 'calc(100% + 4px)', right: 0,
      minWidth: 220, background: t.surfaceSolid,
      border: `1px solid ${t.borderStrong}`, borderRadius: t.radius,
      boxShadow: '0 12px 32px -8px rgba(0,0,0,0.25)',
      padding: 4, zIndex: 10,
    }}>
      <div style={{ fontSize: 10, color: t.textFaint, padding: '6px 10px 4px', textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600 }}>
        Change state to…
      </div>
      {opts.map(to => {
        const needsConfirm = CONFIRM_TRANSITIONS.has(`${lot.state}→${to}`);
        return (
          <button key={to} onClick={() => onPick(to)} style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 10px', border: 'none', background: 'transparent',
            cursor: 'pointer', borderRadius: 4, fontFamily: 'inherit', fontSize: 13, color: t.text, textAlign: 'left',
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(30,64,175,0.08)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATE_DOT[to] }} />
            <span style={{ flex: 1 }}>{STATE_LABELS[to]}</span>
            {needsConfirm && (
              <span style={{ fontSize: 10, color: t.warn, fontWeight: 600, padding: '1px 6px', borderRadius: 8, background: '#FEF3C7' }}>
                confirms
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Frozen-block (Sale / Pickup / Reason)
function FrozenBlock({ t, title, rows }) {
  return (
    <div style={{
      marginTop: 4, padding: 12, borderRadius: t.radius,
      background: t.surfaceSolid, border: `1px solid ${t.border}`,
    }}>
      <div style={{ fontSize: 10, color: t.textDim, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 8 }}>
        {title}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 14px', fontSize: 13 }}>
        {rows.map(([k, v], i) => (
          <React.Fragment key={i}>
            <div style={{ color: t.textDim }}>{k}</div>
            <div style={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

// ─── AI Status block (partial / failure)
function AIStatusBlock({ t, state, message }) {
  const isFail = state === 'failure';
  const accent = isFail ? t.danger : t.warn;
  const bg = isFail ? '#FEF2F2' : '#FFFBEB';
  const border = isFail ? 'rgba(185,28,28,0.3)' : 'rgba(180,83,9,0.3)';
  return (
    <div style={{
      marginTop: 4, padding: 12, borderRadius: t.radius,
      background: bg, border: `1px solid ${border}`,
      display: 'flex', gap: 10, alignItems: 'flex-start',
    }}>
      <div style={{
        width: 22, height: 22, borderRadius: '50%', background: accent,
        color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        fontSize: 13, fontWeight: 700,
      }}>
        {isFail ? '!' : '⚠'}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: accent, marginBottom: 4 }}>
          {isFail ? 'AI run failed' : 'AI run partial'}
        </div>
        <div style={{ fontSize: 12, color: t.text, lineHeight: 1.5 }}>{message}</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button style={{
            padding: '5px 11px', borderRadius: t.radius, border: `1px solid ${accent}`,
            background: '#fff', color: accent, fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <Icon d="M3 8a5 5 0 1 1 1.5 3.5M2 11l1-3l3 1" size={12} stroke={2} /> Re-run AI
          </button>
          <button style={{
            padding: '5px 11px', borderRadius: t.radius, border: `1px solid ${t.border}`,
            background: 'transparent', color: t.textDim, fontFamily: 'inherit', fontSize: 12,
            cursor: 'pointer',
          }}>
            View raw output
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Move-to-auction overlay
function MoveToAuctionOverlay({ lot, onCancel, onConfirm }) {
  const t = C_TOKENS;
  const [destCust, setDestCust] = React.useState(null);
  const [destJob, setDestJob] = React.useState(null);
  const [reprint, setReprint] = React.useState(true);
  const eligibleCustomers = CUSTOMERS;
  const jobs = destCust ? (JOBS_BY_CUSTOMER[destCust] || []).filter(j => j.status === 'open') : [];
  const canConfirm = !!destJob;

  return (
    <div style={overlayBackdropStyle()}>
      <div style={{
        width: 560, maxHeight: '88%', display: 'flex', flexDirection: 'column',
        background: t.bgWash, borderRadius: t.radiusLg, border: `1px solid ${t.borderStrong}`,
        boxShadow: '0 24px 64px -12px rgba(0,0,0,0.5)',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${t.border}`, background: t.surface, backdropFilter: 'blur(12px)' }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Move to another auction</div>
          <div style={{ fontSize: 12, color: t.textDim, marginTop: 4 }}>
            Lot {lot.lot_number} — currently in <b style={{ color: t.text }}>{lot.customer} · {lot.job}</b>.
            Choose a destination job. The lot keeps the <b style={{ color: t.text }}>assigned</b> state and gets a fresh lot number.
          </div>
        </div>

        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          {/* Customer column */}
          <div style={{ flex: 1, padding: 12, borderRight: `1px solid ${t.border}`, display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto' }}>
            <div style={{ fontSize: 10, color: t.textDim, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase', padding: '4px 8px 8px' }}>1 · Customer</div>
            {eligibleCustomers.map(c => (
              <button key={c.id} onClick={() => { setDestCust(c.id); setDestJob(null); }} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                border: `1px solid ${destCust === c.id ? 'var(--c-accent)' : 'transparent'}`,
                background: destCust === c.id ? 'rgba(30,64,175,0.08)' : 'transparent',
                borderRadius: t.radius, cursor: 'pointer', textAlign: 'left',
                fontFamily: 'inherit',
              }}>
                <span style={{
                  width: 14, height: 14, borderRadius: '50%',
                  border: `1.5px solid ${destCust === c.id ? 'var(--c-accent)' : t.borderStrong}`,
                  background: destCust === c.id ? 'var(--c-accent)' : 'transparent',
                  boxShadow: destCust === c.id ? `inset 0 0 0 3px ${t.surfaceSolid}` : 'none',
                  flexShrink: 0,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{c.name}</div>
                  <div style={{ fontSize: 10, color: t.textDim }}>{c.jobs} jobs · {c.lots} lots</div>
                </div>
              </button>
            ))}
          </div>
          {/* Job column */}
          <div style={{ flex: 1, padding: 12, display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto' }}>
            <div style={{ fontSize: 10, color: t.textDim, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase', padding: '4px 8px 8px' }}>2 · Job (open only)</div>
            {!destCust && (
              <div style={{ padding: 12, fontSize: 11, color: t.textFaint, textAlign: 'center', border: `1px dashed ${t.border}`, borderRadius: t.radius }}>
                Pick a customer first
              </div>
            )}
            {destCust && jobs.length === 0 && (
              <div style={{ padding: 12, fontSize: 11, color: t.textFaint, textAlign: 'center', border: `1px dashed ${t.border}`, borderRadius: t.radius }}>
                No open jobs for this customer
              </div>
            )}
            {jobs.map(j => {
              const isCurrent = j.id === lot.job;
              const isPicked = destJob === j.id;
              return (
                <button key={j.id} onClick={() => !isCurrent && setDestJob(j.id)} disabled={isCurrent} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                  border: `1px solid ${isPicked ? 'var(--c-accent)' : 'transparent'}`,
                  background: isPicked ? 'rgba(30,64,175,0.08)' : 'transparent',
                  borderRadius: t.radius, cursor: isCurrent ? 'not-allowed' : 'pointer', textAlign: 'left',
                  fontFamily: 'inherit', opacity: isCurrent ? 0.4 : 1,
                }}>
                  <span style={{
                    width: 14, height: 14, borderRadius: '50%',
                    border: `1.5px solid ${isPicked ? 'var(--c-accent)' : t.borderStrong}`,
                    background: isPicked ? 'var(--c-accent)' : 'transparent',
                    boxShadow: isPicked ? `inset 0 0 0 3px ${t.surfaceSolid}` : 'none',
                    flexShrink: 0,
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, fontFamily: '"JetBrains Mono", monospace', letterSpacing: -0.2 }}>{j.id}</div>
                    <div style={{ fontSize: 10, color: t.textDim, marginTop: 1 }}>
                      {j.lots} lots · next lot will be #{j.lots + 1}
                      {isCurrent && <span style={{ marginLeft: 6, color: t.warn, fontWeight: 600 }}>· current</span>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ padding: '10px 14px', borderTop: `1px solid ${t.border}`, background: t.surface, backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: t.textDim, cursor: 'pointer' }}>
            <input type="checkbox" checked={reprint} onChange={(e) => setReprint(e.target.checked)} style={{ accentColor: 'var(--c-accent)' }} />
            Reprint label after move
          </label>
          <div style={{ flex: 1 }} />
          <button onClick={onCancel} style={btnLifecycle(t, 'subtle')}>Cancel</button>
          <button onClick={onConfirm} disabled={!canConfirm} style={{
            ...btnLifecycle(t, 'primary'),
            opacity: canConfirm ? 1 : 0.45,
            cursor: canConfirm ? 'pointer' : 'not-allowed',
          }}>Move lot</button>
        </div>
      </div>
    </div>
  );
}

// ─── Confirm overlay (used for state changes + delete)
function ConfirmOverlay({ spec, lot, onCancel, onConfirm }) {
  const t = C_TOKENS;
  // spec: 'confirm:delete' | 'confirm:<from>:<to>'
  const parts = spec.split(':');
  const isDelete = parts[1] === 'delete';
  const from = !isDelete ? parts[1] : null;
  const to = !isDelete ? parts[2] : null;

  let title, body, action, danger = false;
  if (isDelete) {
    title = 'Delete this lot?';
    body = `Lot ${lot.lot_number} (${lot.title}) will be permanently removed. This cannot be undone. Audit history is retained server-side.`;
    action = 'Delete lot';
    danger = true;
  } else if (to === 'not-sellable') {
    title = 'Mark as not sellable?';
    body = `Lot ${lot.lot_number} will be moved to the terminal state "not-sellable". This is reversible only by an admin via audit recovery.`;
    action = 'Mark not sellable';
    danger = true;
  } else if (from === 'sold' && to === 'picked-up') {
    title = 'Confirm pickup?';
    body = `Lot ${lot.lot_number} will be moved to "picked-up" — terminal state. The buyer will be marked as having taken delivery.`;
    action = 'Mark picked up';
  } else {
    title = `Change state to ${STATE_LABELS[to]}?`;
    body = `Lot ${lot.lot_number} will move from ${STATE_LABELS[from]} to ${STATE_LABELS[to]}.`;
    action = 'Confirm';
  }

  return (
    <div style={overlayBackdropStyle()}>
      <div style={{
        width: 440, background: t.bgWash,
        borderRadius: t.radiusLg, border: `1px solid ${t.borderStrong}`,
        boxShadow: '0 24px 64px -12px rgba(0,0,0,0.5)',
        padding: 22, display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            background: danger ? '#FEE2E2' : '#FEF3C7',
            color: danger ? t.danger : t.warn,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            fontSize: 18, fontWeight: 700,
          }}>{danger ? '!' : '?'}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>{title}</div>
            <div style={{ fontSize: 12.5, color: t.textDim, lineHeight: 1.55 }}>{body}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <button onClick={onCancel} style={btnLifecycle(t, 'subtle')}>Cancel</button>
          <button onClick={onConfirm} style={{
            ...btnLifecycle(t, 'primary'),
            background: danger ? t.danger : 'var(--c-accent)',
          }}>{action}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Inventory list (desktop) — single hub for search, filter, single & bulk actions
function InventoryListSnippet({
  width = 720, height = 580,
  lots = LIFECYCLE_LOTS,
  onOpenLot = () => {},
  highlightId = null,
  selected: selectedProp,
  onChangeSelected,
  bulkAction = null,           // null | 'move' | 'state' | 'delete' | 'ai'
  onChangeBulkAction = () => {},
  isAdmin = true,
  showAsWindow = true,
}) {
  const t = C_TOKENS;
  // Either fully-controlled or self-managed selection
  const [selSelf, setSelSelf] = React.useState([]);
  const selected = selectedProp ?? selSelf;
  const setSelected = onChangeSelected ?? setSelSelf;

  const allSelected = lots.length > 0 && selected.length === lots.length;
  const someSelected = selected.length > 0 && selected.length < lots.length;
  const toggleAll = () => setSelected(allSelected ? [] : lots.map(l => l.id));
  const toggleOne = (id) => setSelected(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);

  const selectedLots = lots.filter(l => selected.includes(l.id));
  const hasSel = selected.length > 0;
  const cols = '28px 56px 1.6fr 2fr 90px 110px 28px';

  return (
    <div style={{
      width, height, borderRadius: t.radiusLg, overflow: 'hidden',
      background: t.bgWash, border: `1px solid ${t.borderStrong}`,
      boxShadow: '0 24px 64px -12px rgba(0,0,0,0.45)',
      display: 'flex', flexDirection: 'column', position: 'relative',
      fontFamily: t.font, color: t.text,
    }}>
      {showAsWindow && (
        <div style={{
          height: 38, background: t.surface, backdropFilter: 'blur(12px)',
          borderBottom: `1px solid ${t.border}`,
          display: 'flex', alignItems: 'center', padding: '0 14px', gap: 10,
        }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#E0E0E0' }} />
            <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#E0E0E0' }} />
            <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#E0E0E0' }} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 600, color: t.textDim }}>Liquidation OS — Inventory</span>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: t.textFaint, fontFamily: '"JetBrains Mono", monospace' }}>{lots.length} lots</span>
        </div>
      )}

      {/* Search + filter toolbar */}
      <div style={{
        padding: '10px 14px', borderBottom: `1px solid ${t.border}`,
        display: 'flex', alignItems: 'center', gap: 8, background: t.surfaceAlt,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px',
          background: t.surfaceSolid, border: `1px solid ${t.borderStrong}`,
          borderRadius: t.radius, minWidth: 200,
        }}>
          <Icon d={ICONS.search} size={12} />
          <span style={{ fontSize: 12, color: t.textFaint }}>Search title, customer…</span>
        </div>
        <FakeChip label="Customer" />
        <FakeChip label="Job" />
        <FakeChip label="Lot Status" />
        <FakeChip label="AI Status" />
        <FakeChip label="Date" />
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: t.textDim }}>Sort: Date cataloged ▾</span>
        <button style={{
          fontSize: 11, padding: '4px 10px', borderRadius: t.radius,
          border: `1px solid ${t.borderStrong}`, background: t.surfaceSolid,
          color: t.textDim, cursor: 'pointer', fontFamily: 'inherit',
        }}>Save preset</button>
      </div>

      {/* Header row */}
      <div style={{
        display: 'grid', gridTemplateColumns: cols,
        padding: '8px 14px', fontSize: 10, color: t.textDim, fontWeight: 600,
        letterSpacing: 0.4, textTransform: 'uppercase', gap: 10, alignItems: 'center',
        borderBottom: `1px solid ${t.border}`, background: t.surfaceAlt,
      }}>
        <input
          type="checkbox"
          checked={allSelected}
          ref={(el) => { if (el) el.indeterminate = someSelected; }}
          onChange={toggleAll}
          style={{ accentColor: 'var(--c-accent)', cursor: 'pointer' }}
        />
        <div></div>
        <div>Customer · Job · Lot</div>
        <div>Title</div>
        <div>Status</div>
        <div>AI</div>
        <div></div>
      </div>

      {/* Rows */}
      <div style={{ flex: 1, overflowY: 'auto', background: t.surfaceSolid }}>
        {lots.map(lot => {
          const isHL = lot.id === highlightId;
          const isSel = selected.includes(lot.id);
          const rowBg = isSel ? 'rgba(30,64,175,0.08)' : (isHL ? 'rgba(30,64,175,0.04)' : 'transparent');
          return (
            <div key={lot.id} style={{
              display: 'grid', gridTemplateColumns: cols,
              padding: '8px 14px', alignItems: 'center', gap: 10, width: '100%',
              background: rowBg, borderBottom: `1px solid ${t.border}`,
              cursor: 'pointer',
              boxSizing: 'border-box',
            }}
            onClick={() => onOpenLot(lot.id)}
            onMouseEnter={(e) => { if (!isSel && !isHL) e.currentTarget.style.background = 'rgba(15,23,42,0.025)'; }}
            onMouseLeave={(e) => { if (!isSel && !isHL) e.currentTarget.style.background = 'transparent'; }}>
              <input
                type="checkbox"
                checked={isSel}
                onChange={() => toggleOne(lot.id)}
                onClick={(e) => e.stopPropagation()}
                style={{ accentColor: 'var(--c-accent)', cursor: 'pointer' }}
              />
              <div style={{ width: 40, height: 30, borderRadius: 4, overflow: 'hidden', border: `1px solid ${t.border}` }}>
                <PhotoPlaceholder hue={lot.hue} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, color: t.textDim, fontFamily: '"JetBrains Mono", monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {lot.customer} · {lot.job.split('-').slice(0, 3).join('-')}
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, fontFamily: '"JetBrains Mono", monospace', marginTop: 1 }}>
                  Lot {lot.lot_number}
                </div>
              </div>
              <div style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{lot.title}</div>
              <StatePill state={lot.state} small />
              <AIIcon state={lot.ai} />
              <div style={{ color: t.textFaint, fontSize: 16 }}>›</div>
            </div>
          );
        })}
      </div>

      {/* Bulk action bar — slides up from the bottom when ≥1 selected */}
      {hasSel && (
        <BulkActionBar
          count={selected.length}
          selectedLots={selectedLots}
          isAdmin={isAdmin}
          onClear={() => setSelected([])}
          onAction={(a) => onChangeBulkAction(a)}
        />
      )}

      {/* Bulk action dialog */}
      {bulkAction && (
        <BulkActionDialog
          action={bulkAction}
          lots={selectedLots}
          onCancel={() => onChangeBulkAction(null)}
          onConfirm={() => { onChangeBulkAction(null); setSelected([]); }}
        />
      )}
    </div>
  );
}

// ─── Bulk action bar (sticks to bottom of inventory list)
function BulkActionBar({ count, selectedLots, isAdmin, onClear, onAction }) {
  const t = C_TOKENS;
  const sharedTransitions = computeSharedTransitions(selectedLots);
  const canChangeState = sharedTransitions.length > 0;
  // Move-to-auction: only valid if every selected lot is in `assigned` state
  const canMove = selectedLots.every(l => l.state === 'assigned');

  return (
    <div style={{
      position: 'absolute', left: 14, right: 14, bottom: 14,
      background: t.text, color: '#fff',
      borderRadius: t.radiusLg,
      boxShadow: '0 16px 48px -8px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.05) inset',
      display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px 8px 16px',
      fontFamily: t.font,
      animation: 'slideUp 220ms cubic-bezier(.2,.8,.2,1)',
    }}>
      <style>{`@keyframes slideUp { from { transform: translateY(8px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }`}</style>
      <span style={{ fontSize: 13, fontWeight: 600 }}>{count} selected</span>
      <button onClick={onClear} style={{
        fontSize: 11, padding: '3px 8px', borderRadius: 4,
        border: 'none', background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.85)',
        cursor: 'pointer', fontFamily: 'inherit',
      }}>clear</button>
      <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.15)', margin: '0 4px' }} />
      <BulkBtn
        label="Move to auction"
        icon="M2 8h12M10 4l4 4-4 4"
        disabled={!canMove}
        disabledReason="All selected lots must be Assigned"
        onClick={() => onAction('move')}
      />
      <BulkBtn
        label="Change status"
        icon="M3 4h10M3 8h10M3 12h10"
        disabled={!canChangeState}
        disabledReason="Mixed statuses; no shared transition"
        onClick={() => onAction('state')}
      />
      <BulkBtn
        label="Run AI"
        icon="M3 8a5 5 0 1 1 1.5 3.5M2 11l1-3l3 1"
        onClick={() => onAction('ai')}
      />
      <BulkBtn
        label="Export CSV"
        icon="M8 2v9m0 0l-3-3m3 3l3-3M2 13h12"
        onClick={() => onAction('export')}
      />
      {isAdmin && (
        <BulkBtn
          label="Delete"
          icon={ICONS.trash}
          danger
          onClick={() => onAction('delete')}
        />
      )}
    </div>
  );
}

function BulkBtn({ label, icon, onClick, disabled, disabledReason, danger }) {
  const [hover, setHover] = React.useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={!disabled ? onClick : undefined}
        disabled={disabled}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '6px 11px', borderRadius: 6,
          border: 'none', fontFamily: 'inherit', fontSize: 12, fontWeight: 500,
          background: disabled ? 'transparent' : (danger && hover ? 'rgba(220,38,38,0.85)' : (hover ? 'rgba(255,255,255,0.12)' : 'transparent')),
          color: disabled ? 'rgba(255,255,255,0.35)' : (danger ? '#FCA5A5' : '#fff'),
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}>
        <Icon d={icon} size={12} stroke={2} />
        {label}
      </button>
      {disabled && hover && disabledReason && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)',
          background: '#000', color: '#fff', fontSize: 10, padding: '4px 8px', borderRadius: 4,
          whiteSpace: 'nowrap', pointerEvents: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        }}>{disabledReason}</div>
      )}
    </div>
  );
}

// Per design D-003: bulk Change-state shows only states legal for EVERY selected lot
function computeSharedTransitions(lots) {
  if (lots.length === 0) return [];
  const sets = lots.map(l => new Set(LEGAL_TRANSITIONS[l.state] || []));
  const intersection = [...sets[0]].filter(t => sets.every(s => s.has(t)));
  return intersection;
}

function FakeChip({ label, value, active }) {
  const t = C_TOKENS;
  return (
    <span style={{
      fontSize: 11, padding: '4px 10px', borderRadius: 14,
      border: `1px solid ${active ? 'var(--c-accent)' : t.borderStrong}`,
      background: active ? 'rgba(30,64,175,0.08)' : t.surfaceSolid,
      color: active ? 'var(--c-accent)' : t.textDim,
      fontWeight: active ? 600 : 500,
      display: 'inline-flex', alignItems: 'center', gap: 4,
    }}>
      {label}{value && <span style={{ opacity: 0.7 }}>· {value}</span>} ▾
    </span>
  );
}

function AIIcon({ state }) {
  const t = C_TOKENS;
  if (state === 'success') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: t.success, fontWeight: 500 }}>
        <span style={{ width: 14, height: 14, borderRadius: '50%', background: '#DCFCE7', color: t.success, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700 }}>
          <Icon d={ICONS.check} size={9} stroke={2.4} />
        </span>
        ok
      </span>
    );
  }
  if (state === 'partial') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: t.warn, fontWeight: 600 }}>
        <span style={{ width: 14, height: 14, borderRadius: '50%', background: '#FEF3C7', color: t.warn, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>
          ⚠
        </span>
        partial
      </span>
    );
  }
  if (state === 'failure') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: t.danger, fontWeight: 600 }}>
        <span style={{ width: 14, height: 14, borderRadius: '50%', background: '#FEE2E2', color: t.danger, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>!</span>
        failed
      </span>
    );
  }
  return <span style={{ fontSize: 11, color: t.textFaint }}>—</span>;
}

// ─── Reusable bits
function StatePill({ state, small }) {
  const t = C_TOKENS;
  return (
    <span style={{
      fontSize: small ? 10 : 11,
      padding: small ? '2px 7px' : '3px 9px',
      borderRadius: 10, fontWeight: 600,
      background: STATE_BG[state], color: STATE_FG[state],
      display: 'inline-flex', alignItems: 'center', gap: 5,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: STATE_DOT[state] }} />
      {STATE_LABELS[state]}
    </span>
  );
}

function ROField({ label, value, multiline, mono, dim }) {
  const t = C_TOKENS;
  return (
    <div>
      <div style={{ fontSize: 10, color: t.textDim, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <div style={{
        fontSize: 13, color: dim ? t.textFaint : t.text,
        fontFamily: mono ? '"JetBrains Mono", monospace' : 'inherit',
        lineHeight: multiline ? 1.55 : 1.3,
        fontVariantNumeric: mono ? 'tabular-nums' : 'normal',
      }}>{value}</div>
    </div>
  );
}

// ─── Bulk action dialog (action only — selected lots are NOT re-listed)
function BulkActionDialog({ action, lots, onCancel, onConfirm }) {
  const t = C_TOKENS;
  const count = lots.length;
  const sample = lots.slice(0, 3).map(l => `Lot ${l.lot_number}`).join(', ') + (count > 3 ? ` +${count - 3} more` : '');

  // Move-to-auction (bulk) — same destination picker, no per-lot UI
  if (action === 'move') {
    return (
      <div style={overlayBackdropStyle()}>
        <BulkMovePicker count={count} sample={sample} onCancel={onCancel} onConfirm={onConfirm} />
      </div>
    );
  }

  // Change-status (bulk) — only shared legal targets
  if (action === 'state') {
    const sharedTargets = computeSharedTransitions(lots);
    return (
      <div style={overlayBackdropStyle()}>
        <div style={bulkDialogShell(t)}>
          <DialogHeader t={t} title={`Change status for ${count} lots`} sub={sample} />
          <div style={{ padding: '8px 18px 14px' }}>
            <div style={{ fontSize: 11, color: t.textDim, marginBottom: 10 }}>
              Only statuses legal for <b style={{ color: t.text }}>every</b> selected lot are shown.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {sharedTargets.length === 0 ? (
                <div style={{ padding: 14, textAlign: 'center', fontSize: 12, color: t.textFaint, border: `1px dashed ${t.border}`, borderRadius: t.radius }}>
                  Mixed statuses — no shared transition. Refine your selection.
                </div>
              ) : (
                sharedTargets.map(s => (
                  <button key={s} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                    border: `1px solid ${t.border}`, background: t.surfaceSolid,
                    borderRadius: t.radius, cursor: 'pointer', textAlign: 'left',
                    fontFamily: 'inherit', fontSize: 13,
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(30,64,175,0.06)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = t.surfaceSolid}
                  onClick={onConfirm}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATE_DOT[s] }} />
                    <span style={{ flex: 1 }}>Move all to <b>{STATE_LABELS[s]}</b></span>
                    <span style={{ fontSize: 11, color: t.textDim }}>Apply to {count} lots ›</span>
                  </button>
                ))
              )}
            </div>
          </div>
          <DialogFooter t={t} onCancel={onCancel} />
        </div>
      </div>
    );
  }

  // Run AI (bulk) — single confirmation
  if (action === 'ai') {
    return (
      <div style={overlayBackdropStyle()}>
        <div style={bulkDialogShell(t, 460)}>
          <DialogHeader t={t} title={`Run AI on ${count} lots?`} sub={sample} />
          <div style={{ padding: '6px 18px 14px', fontSize: 12.5, color: t.textDim, lineHeight: 1.55 }}>
            AI will generate or regenerate title, description, and price for each selected lot. Existing values will be overwritten if AI succeeds. This typically takes a few seconds per lot.
          </div>
          <DialogFooter t={t} onCancel={onCancel} primary={`Run AI on ${count}`} onPrimary={onConfirm} />
        </div>
      </div>
    );
  }

  // Export CSV (bulk) — settings-light confirmation
  if (action === 'export') {
    return (
      <div style={overlayBackdropStyle()}>
        <div style={bulkDialogShell(t, 460)}>
          <DialogHeader t={t} title={`Export ${count} lots to CSV`} sub={sample} />
          <div style={{ padding: '6px 18px 14px', fontSize: 12.5, color: t.textDim, lineHeight: 1.55 }}>
            CSV includes Lot, Customer, Job, Title, Description, Price, Quantity, Status, Special Notes, Date cataloged.
          </div>
          <DialogFooter t={t} onCancel={onCancel} primary="Download CSV" onPrimary={onConfirm} />
        </div>
      </div>
    );
  }

  // Delete (bulk, admin only)
  if (action === 'delete') {
    return (
      <div style={overlayBackdropStyle()}>
        <div style={bulkDialogShell(t, 460)}>
          <DialogHeader t={t} title={`Delete ${count} lots?`} sub={sample} danger />
          <div style={{ padding: '6px 18px 14px', fontSize: 12.5, color: t.textDim, lineHeight: 1.55 }}>
            All selected lots will be permanently removed. This cannot be undone. Audit history is retained server-side.
          </div>
          <DialogFooter t={t} onCancel={onCancel} primary={`Delete ${count} lots`} onPrimary={onConfirm} danger />
        </div>
      </div>
    );
  }

  return null;
}

function BulkMovePicker({ count, sample, onCancel, onConfirm }) {
  const t = C_TOKENS;
  const [destCust, setDestCust] = React.useState(null);
  const [destJob, setDestJob] = React.useState(null);
  const [reprint, setReprint] = React.useState(true);
  const jobs = destCust ? (JOBS_BY_CUSTOMER[destCust] || []).filter(j => j.status === 'open') : [];
  const canConfirm = !!destJob;

  return (
    <div style={{
      width: 580, maxHeight: '88%', display: 'flex', flexDirection: 'column',
      background: t.bgWash, borderRadius: t.radiusLg, border: `1px solid ${t.borderStrong}`,
      boxShadow: '0 24px 64px -12px rgba(0,0,0,0.5)', overflow: 'hidden',
    }}>
      <DialogHeader t={t} title={`Move ${count} lots to another auction`} sub={sample} />
      <div style={{ display: 'flex', flex: 1, minHeight: 0, height: 320 }}>
        <div style={{ flex: 1, padding: 12, borderRight: `1px solid ${t.border}`, display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto' }}>
          <div style={{ fontSize: 10, color: t.textDim, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase', padding: '4px 8px 8px' }}>1 · Customer</div>
          {CUSTOMERS.map(c => (
            <button key={c.id} onClick={() => { setDestCust(c.id); setDestJob(null); }} style={pickerRowStyle(t, destCust === c.id)}>
              <span style={pickerDotStyle(t, destCust === c.id)} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{c.name}</div>
                <div style={{ fontSize: 10, color: t.textDim }}>{c.jobs} jobs · {c.lots} lots</div>
              </div>
            </button>
          ))}
        </div>
        <div style={{ flex: 1, padding: 12, display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto' }}>
          <div style={{ fontSize: 10, color: t.textDim, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase', padding: '4px 8px 8px' }}>2 · Job (open only)</div>
          {!destCust && (
            <div style={{ padding: 12, fontSize: 11, color: t.textFaint, textAlign: 'center', border: `1px dashed ${t.border}`, borderRadius: t.radius }}>Pick a customer first</div>
          )}
          {destCust && jobs.length === 0 && (
            <div style={{ padding: 12, fontSize: 11, color: t.textFaint, textAlign: 'center', border: `1px dashed ${t.border}`, borderRadius: t.radius }}>No open jobs for this customer</div>
          )}
          {jobs.map(j => (
            <button key={j.id} onClick={() => setDestJob(j.id)} style={pickerRowStyle(t, destJob === j.id)}>
              <span style={pickerDotStyle(t, destJob === j.id)} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 500, fontFamily: '"JetBrains Mono", monospace', letterSpacing: -0.2 }}>{j.id}</div>
                <div style={{ fontSize: 10, color: t.textDim, marginTop: 1 }}>{j.lots} lots · next will be #{j.lots + 1}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
      <div style={{ padding: '10px 14px', borderTop: `1px solid ${t.border}`, background: t.surface, backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: t.textDim, cursor: 'pointer' }}>
          <input type="checkbox" checked={reprint} onChange={(e) => setReprint(e.target.checked)} style={{ accentColor: 'var(--c-accent)' }} />
          Reprint labels after move
        </label>
        <div style={{ flex: 1 }} />
        <button onClick={onCancel} style={btnLifecycle(t, 'subtle')}>Cancel</button>
        <button onClick={onConfirm} disabled={!canConfirm} style={{
          ...btnLifecycle(t, 'primary'),
          opacity: canConfirm ? 1 : 0.45,
          cursor: canConfirm ? 'pointer' : 'not-allowed',
        }}>Move {count} lots</button>
      </div>
    </div>
  );
}

function DialogHeader({ t, title, sub, danger }) {
  return (
    <div style={{ padding: '14px 18px 8px', borderBottom: `1px solid ${t.border}`, background: t.surface, backdropFilter: 'blur(12px)' }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: danger ? t.danger : t.text }}>{title}</div>
      {sub && <div style={{ fontSize: 11, color: t.textDim, marginTop: 4, fontFamily: '"JetBrains Mono", monospace' }}>{sub}</div>}
    </div>
  );
}

function DialogFooter({ t, onCancel, primary, onPrimary, danger }) {
  return (
    <div style={{ padding: '10px 14px', borderTop: `1px solid ${t.border}`, display: 'flex', justifyContent: 'flex-end', gap: 8, background: t.surface, backdropFilter: 'blur(12px)' }}>
      <button onClick={onCancel} style={btnLifecycle(t, 'subtle')}>Cancel</button>
      {primary && (
        <button onClick={onPrimary} style={{
          ...btnLifecycle(t, 'primary'),
          background: danger ? t.danger : 'var(--c-accent)',
        }}>{primary}</button>
      )}
    </div>
  );
}

function bulkDialogShell(t, width = 480) {
  return {
    width, background: t.bgWash, borderRadius: t.radiusLg,
    border: `1px solid ${t.borderStrong}`,
    boxShadow: '0 24px 64px -12px rgba(0,0,0,0.5)',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
    fontFamily: t.font, color: t.text,
  };
}

function pickerRowStyle(t, active) {
  return {
    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
    border: `1px solid ${active ? 'var(--c-accent)' : 'transparent'}`,
    background: active ? 'rgba(30,64,175,0.08)' : 'transparent',
    borderRadius: t.radius, cursor: 'pointer', textAlign: 'left',
    fontFamily: 'inherit',
  };
}
function pickerDotStyle(t, active) {
  return {
    width: 14, height: 14, borderRadius: '50%',
    border: `1.5px solid ${active ? 'var(--c-accent)' : t.borderStrong}`,
    background: active ? 'var(--c-accent)' : 'transparent',
    boxShadow: active ? `inset 0 0 0 3px ${t.surfaceSolid}` : 'none',
    flexShrink: 0,
  };
}

function btnLifecycle(t, kind) {
  return {
    border: kind === 'primary' ? 'none' : `1px solid ${t.borderStrong}`,
    background: kind === 'primary' ? 'var(--c-accent)' : t.surfaceSolid,
    color: kind === 'primary' ? '#fff' : t.text,
    padding: '6px 12px', borderRadius: t.radius,
    fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
    height: 32, boxSizing: 'border-box',
  };
}

function overlayBackdropStyle() {
  return {
    position: 'absolute', inset: 0,
    background: 'rgba(15,23,42,0.35)', backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 50,
  };
}

Object.assign(window, {
  LIFECYCLE_LOTS, LifecycleLotModal, InventoryListSnippet, FROZEN_STATES,
  StatePill, AIIcon, MoveToAuctionOverlay, ConfirmOverlay,
  BulkActionBar, BulkActionDialog, BulkMovePicker, computeSharedTransitions,
});
