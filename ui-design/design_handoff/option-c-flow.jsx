// option-c-flow.jsx — Cataloging end-to-end (Option C · Mica Slate)
// Screens:
//   1. Customer/Job picker (pre-session)
//   2. Lot in progress (cataloging loop)
//   3. Save success / lot transition
//   4. Print-failure toast
//   5. Photo manager (retake / delete / reorder)
//   6. End session confirm

const C_TOKENS = {
  bg: '#EDEEF1',
  bgWash: 'linear-gradient(180deg, #EFF1F4 0%, #E5E7EC 100%)',
  surface: 'rgba(255,255,255,0.72)',
  surfaceSolid: '#FFFFFF',
  surfaceAlt: 'rgba(255,255,255,0.55)',
  border: 'rgba(15,23,42,0.08)',
  borderStrong: 'rgba(15,23,42,0.18)',
  text: '#0F172A',
  textDim: '#475569',
  textFaint: '#94A3B8',
  danger: '#B91C1C',
  warn: '#B45309',
  success: '#15803D',
  font: '"Segoe UI Variable", "Segoe UI", system-ui, -apple-system, sans-serif',
  radius: 6,
  radiusLg: 10,
};

// ── Sample data for the pickers
const CUSTOMERS = [
  { id: 'smith', name: 'Smith Estate', jobs: 3, lots: 142, recent: true },
  { id: 'jones', name: 'Jones Family', jobs: 2, lots: 87 },
  { id: 'patel', name: 'Patel Holdings', jobs: 1, lots: 23 },
  { id: 'oconnor', name: "O'Connor Liquidation", jobs: 4, lots: 211 },
  { id: 'kim', name: 'Kim Restaurant Co', jobs: 1, lots: 56 },
  { id: 'reyes', name: 'Reyes Property LLC', jobs: 2, lots: 38 },
];
const JOBS_BY_CUSTOMER = {
  smith: [
    { id: '2026-04-Smith-001', date: '2026-04-12', lots: 89, status: 'open' },
    { id: '2026-03-Smith-009', date: '2026-03-22', lots: 41, status: 'closed' },
    { id: '2026-02-Smith-003', date: '2026-02-10', lots: 12, status: 'closed' },
  ],
  jones:   [{ id: '2026-03-Jones-014', date: '2026-03-30', lots: 64, status: 'open' }, { id: '2026-02-Jones-007', date: '2026-02-18', lots: 23, status: 'closed' }],
  patel:   [{ id: '2026-04-Patel-002', date: '2026-04-19', lots: 23, status: 'open' }],
  oconnor: [
    { id: '2026-04-OConnor-005', date: '2026-04-25', lots: 56, status: 'open' },
    { id: '2026-04-OConnor-004', date: '2026-04-08', lots: 71, status: 'open' },
    { id: '2026-03-OConnor-002', date: '2026-03-15', lots: 50, status: 'closed' },
    { id: '2026-02-OConnor-001', date: '2026-02-01', lots: 34, status: 'closed' },
  ],
  kim:     [{ id: '2026-04-Kim-001', date: '2026-04-21', lots: 56, status: 'open' }],
  reyes:   [{ id: '2026-04-Reyes-003', date: '2026-04-17', lots: 21, status: 'open' }, { id: '2026-03-Reyes-002', date: '2026-03-04', lots: 17, status: 'closed' }],
};

// ───────────────────────────────────────── Picker
function PickerScreen({ onBegin, defaultCustomer = 'smith', defaultJob = '2026-04-Smith-001' }) {
  const [custId, setCustId] = React.useState(defaultCustomer);
  const [jobId, setJobId] = React.useState(defaultJob);
  const [custQ, setCustQ] = React.useState('');
  const [jobQ, setJobQ] = React.useState('');

  const filteredCust = CUSTOMERS.filter(c => c.name.toLowerCase().includes(custQ.toLowerCase()));
  const jobs = JOBS_BY_CUSTOMER[custId] || [];
  const filteredJobs = jobs.filter(j => j.id.toLowerCase().includes(jobQ.toLowerCase()));
  const cust = CUSTOMERS.find(c => c.id === custId);
  const job = jobs.find(j => j.id === jobId);
  const canBegin = !!cust && !!job;

  return (
    <AndroidDevice width={380} height={780}>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', fontFamily: C_TOKENS.font, color: C_TOKENS.text, background: C_TOKENS.bg }}>
        {/* header */}
        <div style={{
          padding: '20px 18px 16px',
          background: 'linear-gradient(180deg, rgba(30,64,175,0.08) 0%, transparent 100%)',
          borderBottom: `1px solid ${C_TOKENS.border}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 22, height: 22, borderRadius: 5, background: 'var(--c-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 12 }}>L</div>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 11, color: C_TOKENS.textDim, padding: '3px 9px', borderRadius: 10, background: C_TOKENS.surface, border: `1px solid ${C_TOKENS.border}` }}>Avery M.</span>
          </div>
          <div style={{ marginTop: 18, fontSize: 11, color: C_TOKENS.textDim, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' }}>Start a session</div>
          <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.15, marginTop: 4, letterSpacing: -0.4 }}>Customer · Job</div>
        </div>

        {/* body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          <FlowSection num="1" label="Customer" complete={!!cust}>
            <SearchField value={custQ} onChange={setCustQ} placeholder="Search customers" />
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {filteredCust.map(c => (
                <PickRow key={c.id} active={c.id === custId} onClick={() => { setCustId(c.id); setJobId(null); }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                      {c.name}
                      {c.recent && <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 8, background: 'var(--c-accent)', color: '#fff', fontWeight: 700, letterSpacing: 0.3 }}>RECENT</span>}
                    </div>
                    <div style={{ fontSize: 11, color: C_TOKENS.textDim, marginTop: 1 }}>{c.jobs} jobs · {c.lots} lots</div>
                  </div>
                </PickRow>
              ))}
              {filteredCust.length === 0 && <EmptyHint label="No customers match" />}
            </div>
          </FlowSection>

          {cust && (
            <FlowSection num="2" label="Job" complete={!!job}>
              <SearchField value={jobQ} onChange={setJobQ} placeholder="Search jobs" />
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {filteredJobs.map(j => (
                  <PickRow key={j.id} active={j.id === jobId} onClick={() => setJobId(j.id)} disabled={j.status === 'closed'}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, fontFamily: '"JetBrains Mono", monospace', letterSpacing: -0.2 }}>{j.id}</div>
                      <div style={{ fontSize: 11, color: C_TOKENS.textDim, marginTop: 2 }}>
                        Created {j.date} · {j.lots} lots
                      </div>
                    </div>
                    <span style={{
                      fontSize: 10, padding: '2px 8px', borderRadius: 8, fontWeight: 600,
                      background: j.status === 'open' ? '#DCFCE7' : '#F1F5F9',
                      color: j.status === 'open' ? C_TOKENS.success : C_TOKENS.textDim,
                    }}>{j.status}</span>
                  </PickRow>
                ))}
                {filteredJobs.length === 0 && <EmptyHint label="No jobs match" />}
              </div>
            </FlowSection>
          )}
        </div>

        {/* sticky footer */}
        <div style={{
          padding: 16, borderTop: `1px solid ${C_TOKENS.border}`,
          background: C_TOKENS.surfaceSolid,
        }}>
          {canBegin && (
            <div style={{
              padding: '10px 12px', borderRadius: C_TOKENS.radius, background: C_TOKENS.surfaceAlt,
              border: `1px solid ${C_TOKENS.border}`, fontSize: 12, color: C_TOKENS.textDim, marginBottom: 10,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <Icon d={ICONS.tag} size={13} />
              <span>Next lot will be <b style={{ color: C_TOKENS.text, fontVariantNumeric: 'tabular-nums' }}>#{(job?.lots ?? 0) + 1}</b> in {job?.id.split('-').slice(0,3).join('-')}…</span>
            </div>
          )}
          <button onClick={() => canBegin && onBegin({ customer: cust, job })} disabled={!canBegin} style={{
            width: '100%', height: 50, border: 'none', borderRadius: C_TOKENS.radius,
            background: canBegin ? 'var(--c-accent)' : '#CBD5E1', color: '#fff',
            fontFamily: 'inherit', fontSize: 15, fontWeight: 600,
            cursor: canBegin ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            boxShadow: canBegin ? '0 6px 16px rgba(30,64,175,0.35)' : 'none',
          }}>
            Begin session <Icon d={ICONS.chevronR} size={14} stroke={2.4} />
          </button>
        </div>
      </div>
    </AndroidDevice>
  );
}

function FlowSection({ num, label, complete, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{
          width: 18, height: 18, borderRadius: '50%',
          background: complete ? C_TOKENS.success : 'var(--c-accent)',
          color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, fontWeight: 700,
        }}>{complete ? <Icon d={ICONS.check} size={9} stroke={2.4} /> : num}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: C_TOKENS.textDim, letterSpacing: 0.4, textTransform: 'uppercase' }}>{label}</span>
      </div>
      {children}
    </div>
  );
}

function SearchField({ value, onChange, placeholder }) {
  return (
    <div style={{
      height: 38, padding: '0 12px', border: `1px solid ${C_TOKENS.borderStrong}`,
      borderRadius: C_TOKENS.radius, background: C_TOKENS.surfaceSolid,
      display: 'flex', alignItems: 'center', gap: 8,
    }}>
      <Icon d={ICONS.search} size={13} />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={{
        flex: 1, border: 'none', outline: 'none', background: 'transparent',
        fontFamily: 'inherit', fontSize: 13, color: C_TOKENS.text,
      }} />
    </div>
  );
}

function PickRow({ active, onClick, disabled, children }) {
  return (
    <button onClick={!disabled ? onClick : undefined} disabled={disabled} style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
      borderRadius: C_TOKENS.radius,
      background: active ? 'rgba(30,64,175,0.08)' : C_TOKENS.surfaceSolid,
      border: `1px solid ${active ? 'var(--c-accent)' : C_TOKENS.border}`,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1, textAlign: 'left',
      fontFamily: 'inherit',
    }}>
      <span style={{
        width: 16, height: 16, borderRadius: '50%',
        border: `1.5px solid ${active ? 'var(--c-accent)' : C_TOKENS.borderStrong}`,
        background: active ? 'var(--c-accent)' : 'transparent',
        flexShrink: 0,
        boxShadow: active ? `inset 0 0 0 3px ${C_TOKENS.surfaceSolid}` : 'none',
      }} />
      {children}
    </button>
  );
}

function EmptyHint({ label }) {
  return (
    <div style={{ padding: 16, textAlign: 'center', color: C_TOKENS.textFaint, fontSize: 12, border: `1px dashed ${C_TOKENS.border}`, borderRadius: C_TOKENS.radius }}>{label}</div>
  );
}

// ───────────────────────────────────────── Lot in progress
function LotInProgressScreen({ session, lotNumber, photos, onChangePhotos, onSaveAndNext, onEnd, onOpenPhotoMgr, printFailing, dismissPrint }) {
  const [notes, setNotes] = React.useState('CLOTHING');
  const [size, setSize] = React.useState('Large');
  const [untested, setUntested] = React.useState(false);
  const [qty, setQty] = React.useState(1);
  const [showAll, setShowAll] = React.useState(false);

  const canSave = photos.length >= 1;

  return (
    <AndroidDevice width={380} height={780}>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', fontFamily: C_TOKENS.font, color: C_TOKENS.text, background: C_TOKENS.bg, position: 'relative' }}>
        {/* session header — context on left, big lot number on right */}
        <div style={{ padding: '12px 16px 12px', background: 'linear-gradient(180deg, rgba(30,64,175,0.08), transparent)', borderBottom: `1px solid ${C_TOKENS.border}`, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={onEnd} style={{ border: 'none', background: 'transparent', padding: 0, color: C_TOKENS.textDim, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <Icon d={ICONS.back} size={13} />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C_TOKENS.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{session.customer.name}</div>
            <div style={{ fontSize: 10, color: C_TOKENS.textDim, fontFamily: '"JetBrains Mono", monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>{session.job.id}</div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 9, color: C_TOKENS.textDim, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase', lineHeight: 1 }}>Lot</div>
            <div style={{ fontSize: 30, fontWeight: 700, lineHeight: 1, letterSpacing: -1, color: 'var(--c-accent)', fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>{lotNumber}</div>
          </div>
        </div>

        {/* body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* capture CTA — large for first photo, compact thereafter */}
          {photos.length === 0 ? (
            <button onClick={() => onChangePhotos([...photos, { hue: 28 }])} style={{
              height: 96, borderRadius: C_TOKENS.radiusLg, border: 'none',
              background: 'linear-gradient(135deg, var(--c-accent), color-mix(in srgb, var(--c-accent), #000 15%))',
              color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
              fontFamily: 'inherit', fontSize: 16, fontWeight: 600, cursor: 'pointer',
              boxShadow: '0 8px 24px rgba(30,64,175,0.35)',
            }}>
              <Icon d={ICONS.camera} size={28} stroke={1.6} />
              Capture first photo
            </button>
          ) : (
            <button onClick={() => onChangePhotos([...photos, { hue: (photos.length * 70) % 360 }])} style={{
              height: 44, borderRadius: C_TOKENS.radius, border: 'none',
              background: 'var(--c-accent)',
              color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(30,64,175,0.25)',
            }}>
              <Icon d={ICONS.camera} size={16} stroke={1.8} />
              Add Photo
            </button>
          )}

          {/* photo strip */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {photos.map((p, i) => (
              <button key={i} onClick={() => onOpenPhotoMgr(i)} style={{
                flex: 1, aspectRatio: '1', borderRadius: C_TOKENS.radius, overflow: 'hidden',
                border: i === 0 ? `2px solid var(--c-accent)` : `1px solid ${C_TOKENS.border}`,
                cursor: 'pointer', padding: 0, position: 'relative',
              }}>
                <PhotoPlaceholder hue={p.hue} label={`#${i+1}`} />
                {i === 0 && <span style={{ position: 'absolute', bottom: 2, left: 2, fontSize: 8, padding: '1px 4px', borderRadius: 3, background: 'var(--c-accent)', color: '#fff', fontWeight: 700, letterSpacing: 0.3 }}>COVER</span>}
              </button>
            ))}
            {photos.length < 12 && (
              <button onClick={() => onChangePhotos([...photos, { hue: (photos.length * 70) % 360 }])} style={{
                flex: 1, aspectRatio: '1', borderRadius: C_TOKENS.radius,
                border: `1.5px dashed ${C_TOKENS.borderStrong}`, background: 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: C_TOKENS.textFaint,
                cursor: 'pointer',
              }}>
                <Icon d={ICONS.plus} size={16} />
              </button>
            )}
          </div>

          {/* upload status hint */}
          {photos.length > 0 && (
            <div style={{ fontSize: 11, color: C_TOKENS.textDim, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: C_TOKENS.success }} />
              {photos.length} photo{photos.length > 1 ? 's' : ''} uploading in background · max 12
            </div>
          )}

          {/* Quantity + Untested share the top row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <FieldC label="Quantity">
              <div style={{ display: 'flex', alignItems: 'center', height: 38, border: `1px solid ${C_TOKENS.borderStrong}`, borderRadius: C_TOKENS.radius, background: C_TOKENS.surfaceSolid, overflow: 'hidden', minWidth: 0, boxSizing: 'border-box' }}>
                <button onClick={() => setQty(Math.max(1, qty - 1))} style={qtyBtnStyle()}>
                  <Icon d="M3 8h10" size={13} stroke={2} />
                </button>
                <input type="number" value={qty} onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))} style={{
                  flex: 1, width: '100%', height: '100%', border: 'none', outline: 'none', textAlign: 'center',
                  fontFamily: C_TOKENS.font, fontSize: 14, fontWeight: 600, color: C_TOKENS.text,
                  background: 'transparent', fontVariantNumeric: 'tabular-nums', minWidth: 0, padding: 0,
                }} />
                <button onClick={() => setQty(qty + 1)} style={qtyBtnStyle()}>
                  <Icon d={ICONS.plus} size={13} stroke={2} />
                </button>
              </div>
            </FieldC>
            <FieldC label="Untested">
              <button onClick={() => setUntested(!untested)} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px', height: 38, width: '100%',
                borderRadius: C_TOKENS.radius, minWidth: 0,
                border: `1px solid ${untested ? 'var(--c-accent)' : C_TOKENS.borderStrong}`,
                background: untested ? 'rgba(30,64,175,0.08)' : C_TOKENS.surfaceSolid,
                cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                boxSizing: 'border-box',
              }}>
                <span style={{
                  width: 16, height: 16, borderRadius: 3,
                  border: `1.5px solid ${untested ? 'var(--c-accent)' : C_TOKENS.borderStrong}`,
                  background: untested ? 'var(--c-accent)' : C_TOKENS.surfaceSolid,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0,
                }}>{untested && <Icon d={ICONS.check} size={10} stroke={2.4} />}</span>
                <span style={{ fontSize: 13, fontWeight: 500, color: untested ? 'var(--c-accent)' : C_TOKENS.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Untested</span>
              </button>
            </FieldC>
          </div>

          {/* required field */}
          <FieldC label="Special Notes" required>
            <select value={notes} onChange={(e) => setNotes(e.target.value)} style={selectStyleC()}>
              <option>None</option><option>TOOL ONLY</option><option>READ</option><option>CLOTHING</option>
            </select>
          </FieldC>

          {notes === 'CLOTHING' && (
            <FieldC label="Size">
              <input value={size} onChange={(e) => setSize(e.target.value)} style={inputStyleC()} />
            </FieldC>
          )}

          {/* Optional fields trigger — chevron expand pattern */}
          <button onClick={() => setShowAll(!showAll)} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
            borderRadius: C_TOKENS.radius, border: `1px solid ${C_TOKENS.border}`,
            background: C_TOKENS.surfaceAlt, color: C_TOKENS.textDim, fontSize: 13, fontWeight: 500,
            cursor: 'pointer', width: '100%', textAlign: 'left', fontFamily: 'inherit',
          }}>
            <Icon d={showAll ? ICONS.chevron : ICONS.chevronR} size={11} />
            <span>Additional Info</span>
            <div style={{ flex: 1 }} />
          </button>

          {showAll && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12, borderRadius: C_TOKENS.radius, border: `1px solid ${C_TOKENS.border}`, background: C_TOKENS.surfaceSolid }}>
              <FieldC label="Title"><input placeholder="AI will fill" style={inputStyleC()} /></FieldC>
              <FieldC label="Description"><textarea placeholder="AI will fill" rows={3} style={{ ...inputStyleC(), height: 'auto', padding: 10, resize: 'vertical' }} /></FieldC>
              <FieldC label="Price"><input placeholder="$" style={inputStyleC()} /></FieldC>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <FieldC label="Ref 1"><input style={inputStyleC()} /></FieldC>
                <FieldC label="Ref 2"><input style={inputStyleC()} /></FieldC>
              </div>
            </div>
          )}

          {/* Print Label — manually trigger a label print */}
          <button style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '10px 12px', borderRadius: C_TOKENS.radius,
            border: `1px solid ${C_TOKENS.borderStrong}`, background: 'transparent',
            color: C_TOKENS.textDim, fontFamily: 'inherit', fontSize: 12, fontWeight: 500, cursor: 'pointer',
          }}>
            <Icon d={ICONS.printer} size={13} />
            Print Label
          </button>
        </div>

        {/* footer */}
        <div style={{ padding: 12, borderTop: `1px solid ${C_TOKENS.border}`, background: C_TOKENS.surfaceSolid, display: 'flex', gap: 10 }}>
          <button onClick={onEnd} style={{
            width: 110, height: 50, border: `1px solid ${C_TOKENS.borderStrong}`, borderRadius: C_TOKENS.radius,
            background: C_TOKENS.surfaceSolid, color: C_TOKENS.text,
            fontFamily: 'inherit', fontSize: 13, fontWeight: 500, cursor: 'pointer',
          }}>End session</button>
          <button onClick={() => canSave && onSaveAndNext()} disabled={!canSave} style={{
            flex: 1, height: 50, border: 'none', borderRadius: C_TOKENS.radius,
            background: canSave ? 'var(--c-accent)' : '#CBD5E1', color: '#fff',
            fontFamily: 'inherit', fontSize: 14, fontWeight: 600,
            cursor: canSave ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            boxShadow: canSave ? '0 6px 16px rgba(30,64,175,0.35)' : 'none',
          }}>
            <span>Next</span>
            <Icon d={ICONS.chevronR} size={14} stroke={2.4} />
          </button>
        </div>

        {/* print failure toast */}
        {printFailing && (
          <div style={{
            position: 'absolute', bottom: 78, left: 12, right: 12,
            padding: '10px 12px', background: '#FEF3C7', border: `1px solid #F5C518`,
            borderRadius: C_TOKENS.radius, display: 'flex', alignItems: 'center', gap: 10,
            boxShadow: '0 8px 24px rgba(15,23,42,0.15)',
            fontSize: 12,
          }}>
            <span style={{ color: C_TOKENS.warn, display: 'flex' }}><Icon d={ICONS.warning} size={14} /></span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, color: '#92400E' }}>Label print failed — Lot {lotNumber - 1}</div>
              <div style={{ color: '#A16207', fontSize: 11, marginTop: 1 }}>Lot saved. Printer not responding.</div>
            </div>
            <button style={{ border: `1px solid #92400E`, background: 'transparent', color: '#92400E', padding: '4px 10px', borderRadius: 4, fontFamily: 'inherit', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Retry</button>
            <button onClick={dismissPrint} style={{ border: 'none', background: 'transparent', color: '#92400E', padding: 4, cursor: 'pointer', display: 'flex' }}>
              <Icon d={ICONS.close} size={11} />
            </button>
          </div>
        )}
      </div>
    </AndroidDevice>
  );
}

const qtyBtnStyle = () => ({
  width: 34, height: '100%', border: 'none', borderRight: `1px solid ${C_TOKENS.border}`,
  borderLeft: `1px solid ${C_TOKENS.border}`,
  background: C_TOKENS.surfaceAlt, color: C_TOKENS.text, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
});

const inputStyleC = () => ({
  width: '100%', height: 42, padding: '0 12px', border: `1px solid ${C_TOKENS.borderStrong}`,
  borderRadius: C_TOKENS.radius, background: C_TOKENS.surfaceSolid, fontFamily: C_TOKENS.font, fontSize: 14,
  color: C_TOKENS.text, outline: 'none', boxSizing: 'border-box',
});
const selectStyleC = () => ({
  ...inputStyleC(), appearance: 'none',
  backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path fill='${encodeURIComponent(C_TOKENS.textDim)}' d='M0 0h10L5 6z'/></svg>")`,
  backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center',
});

function FieldC({ label, required, children }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: C_TOKENS.textDim, marginBottom: 4, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
        {label}{required && <span style={{ color: C_TOKENS.danger }}>*</span>}
      </div>
      {children}
    </div>
  );
}

// ───────────────────────────────────────── Save success splash
function SaveSuccessScreen({ savedLot, nextLot, session }) {
  return (
    <AndroidDevice width={380} height={780}>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', fontFamily: C_TOKENS.font, color: C_TOKENS.text, background: C_TOKENS.bg }}>
        <div style={{ padding: '14px 16px 12px', background: 'linear-gradient(180deg, rgba(30,64,175,0.08), transparent)', borderBottom: `1px solid ${C_TOKENS.border}` }}>
          <div style={{ fontSize: 11, color: C_TOKENS.textDim, fontFamily: '"JetBrains Mono", monospace' }}>{session.customer.name} · {session.job.id.split('-').slice(0,3).join('-')}</div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 18 }}>
          <div style={{
            width: 84, height: 84, borderRadius: '50%',
            background: `radial-gradient(circle, rgba(21,128,61,0.16) 0%, transparent 70%)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%', background: C_TOKENS.success,
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
              boxShadow: '0 8px 24px rgba(21,128,61,0.4)',
            }}>
              <Icon d={ICONS.check} size={28} stroke={2.6} />
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.4 }}>Lot {savedLot} saved</div>
            <div style={{ fontSize: 13, color: C_TOKENS.textDim, marginTop: 4 }}>Label printed · QR encoded · uploading photos</div>
          </div>

          <div style={{
            padding: '10px 16px', borderRadius: 999,
            background: C_TOKENS.surfaceSolid, border: `1px solid ${C_TOKENS.border}`,
            display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: C_TOKENS.textDim,
            boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
          }}>
            <Icon d={ICONS.qr} size={13} />
            <span>4×2" thermal label sent to Zebra ZD450</span>
          </div>

          <div style={{ marginTop: 8, fontSize: 12, color: C_TOKENS.textFaint }}>
            Auto-advancing to <b style={{ color: C_TOKENS.text, fontVariantNumeric: 'tabular-nums' }}>Lot {nextLot}</b> in 1.2s…
          </div>
        </div>
      </div>
    </AndroidDevice>
  );
}

// ───────────────────────────────────────── Photo manager
function PhotoMgrScreen({ photos, focusIdx, onClose, onChangePhotos }) {
  const [idx, setIdx] = React.useState(focusIdx || 0);
  const swap = (i, j) => {
    const next = [...photos]; [next[i], next[j]] = [next[j], next[i]]; onChangePhotos(next);
    setIdx(j);
  };
  const del = () => {
    const next = photos.filter((_, i) => i !== idx); onChangePhotos(next);
    setIdx(Math.max(0, idx - 1));
    if (next.length === 0) onClose();
  };
  const photo = photos[idx];
  if (!photo) return null;
  return (
    <AndroidDevice width={380} height={780}>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', fontFamily: C_TOKENS.font, color: C_TOKENS.text, background: '#0F172A' }}>
        <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, color: '#fff' }}>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', padding: 0, color: '#fff', cursor: 'pointer', display: 'flex' }}>
            <Icon d={ICONS.close} size={18} />
          </button>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Photo {idx + 1} of {photos.length}</div>
          <div style={{ flex: 1 }} />
          {idx === 0 && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: 'var(--c-accent)', color: '#fff', fontWeight: 700, letterSpacing: 0.3 }}>COVER</span>}
        </div>

        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, position: 'relative' }}>
          <div style={{ width: '100%', aspectRatio: '4/3', borderRadius: C_TOKENS.radius, overflow: 'hidden' }}>
            <PhotoPlaceholder hue={photo.hue} label={`photo ${idx + 1}`} />
          </div>
          {idx > 0 && (
            <button onClick={() => setIdx(idx - 1)} style={navArrowStyle('left')}>
              <Icon d={ICONS.chevronL} size={18} stroke={2.4} />
            </button>
          )}
          {idx < photos.length - 1 && (
            <button onClick={() => setIdx(idx + 1)} style={navArrowStyle('right')}>
              <Icon d={ICONS.chevronR} size={18} stroke={2.4} />
            </button>
          )}
        </div>

        {/* thumbnail strip */}
        <div style={{ padding: '0 16px 12px', display: 'flex', gap: 6, overflowX: 'auto' }}>
          {photos.map((p, i) => (
            <button key={i} onClick={() => setIdx(i)} style={{
              width: 56, height: 56, flexShrink: 0, borderRadius: C_TOKENS.radius, overflow: 'hidden', padding: 0,
              border: i === idx ? `2px solid var(--c-accent)` : `1px solid rgba(255,255,255,0.15)`,
              background: 'transparent', cursor: 'pointer',
            }}>
              <PhotoPlaceholder hue={p.hue} label={`#${i+1}`} />
            </button>
          ))}
        </div>

        {/* actions */}
        <div style={{ padding: 12, borderTop: `1px solid rgba(255,255,255,0.1)`, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          <PhotoAction icon={ICONS.camera} label="Retake" />
          <PhotoAction icon={ICONS.chevronL} label="Move ←" onClick={() => idx > 0 && swap(idx, idx - 1)} disabled={idx === 0} />
          <PhotoAction icon={ICONS.chevronR} label="Move →" onClick={() => idx < photos.length - 1 && swap(idx, idx + 1)} disabled={idx === photos.length - 1} />
          <PhotoAction icon={ICONS.trash} label="Delete" onClick={del} danger />
        </div>
      </div>
    </AndroidDevice>
  );
}

function PhotoAction({ icon, label, onClick, disabled, danger }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      height: 56, border: `1px solid rgba(255,255,255,0.12)`, borderRadius: C_TOKENS.radius,
      background: 'rgba(255,255,255,0.06)', color: danger ? '#FCA5A5' : '#fff',
      fontFamily: 'inherit', fontSize: 11, fontWeight: 500,
      cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
    }}>
      <Icon d={icon} size={15} />
      <span>{label}</span>
    </button>
  );
}

const navArrowStyle = (side) => ({
  position: 'absolute', top: '50%', [side]: 16, transform: 'translateY(-50%)',
  width: 36, height: 36, borderRadius: '50%', border: 'none',
  background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)',
  color: '#fff', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
});

// ───────────────────────────────────────── End-session confirm
function EndConfirmScreen({ savedCount, onCancel, onConfirm }) {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: C_TOKENS.font,
    }}>
      <div style={{
        width: 320, background: C_TOKENS.surfaceSolid, borderRadius: C_TOKENS.radiusLg,
        padding: 22, boxShadow: '0 30px 80px rgba(15,23,42,0.4)',
      }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: C_TOKENS.text }}>End cataloging session?</div>
        <div style={{ fontSize: 13, color: C_TOKENS.textDim, marginTop: 6, lineHeight: 1.5 }}>
          You've cataloged <b style={{ color: C_TOKENS.text }}>{savedCount} lot{savedCount !== 1 ? 's' : ''}</b> in this session. They're saved. The current draft (if any) will be discarded.
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{
            height: 36, padding: '0 14px', border: `1px solid ${C_TOKENS.borderStrong}`, borderRadius: C_TOKENS.radius,
            background: C_TOKENS.surfaceSolid, color: C_TOKENS.text, fontFamily: 'inherit', fontSize: 13, fontWeight: 500, cursor: 'pointer',
          }}>Keep going</button>
          <button onClick={onConfirm} style={{
            height: 36, padding: '0 14px', border: 'none', borderRadius: C_TOKENS.radius,
            background: C_TOKENS.danger, color: '#fff', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>End session</button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { PickerScreen, LotInProgressScreen, SaveSuccessScreen, PhotoMgrScreen, EndConfirmScreen, C_TOKENS });
