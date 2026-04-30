// option-c.jsx — Mica Slate
// Layered "Mica" feel with translucent panels, slate accent, and a navigation
// pane that floats over a tinted background. Density-forward.

function OptionC({ accent, view, density }) {
  const tokens = {
    accent,
    bg: '#EDEEF1',         // cool tinted Mica
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
    success: '#15803D',
    font: '"Segoe UI Variable", "Segoe UI", system-ui, -apple-system, sans-serif',
    radius: 6,
    radiusLg: 10,
  };
  return <MicaShell tokens={tokens} view={view} density={density} />;
}

function MicaShell({ tokens, view, density }) {
  const [selected, setSelected] = React.useState([]);
  const [activeLot, setActiveLot] = React.useState(null);
  const [tab, setTab] = React.useState('desktop');
  return (
    <div style={{
      width: '100%', height: '100%', background: tokens.bgWash, color: tokens.text,
      fontFamily: tokens.font, fontSize: 13, display: 'flex', flexDirection: 'column', overflow: 'hidden',
      position: 'relative',
    }}>
      {/* Subtle Mica noise/blob for depth */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background:
        `radial-gradient(600px 300px at 8% 0%, ${tokens.accent}14, transparent 60%),
         radial-gradient(800px 400px at 100% 100%, #94A3B822, transparent 60%)` }} />
      <MicaTitleBar tokens={tokens} tab={tab} setTab={setTab} />
      <div style={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', minHeight: 0 }}>
        {tab === 'desktop'
          ? <MicaDesktop tokens={tokens} selected={selected} setSelected={setSelected} setActiveLot={setActiveLot} view={view} density={density} />
          : <MicaMobile tokens={tokens} />}
      </div>
      {activeLot != null && <MicaLotModal tokens={tokens} lot={SAMPLE_LOTS.find(l => l.id === activeLot)} onClose={() => setActiveLot(null)} />}
    </div>
  );
}

function MicaTitleBar({ tokens, tab, setTab }) {
  return (
    <div style={{
      height: 40, display: 'flex', alignItems: 'center', padding: '0 14px', gap: 14, flexShrink: 0,
      borderBottom: `1px solid ${tokens.border}`, position: 'relative', zIndex: 2,
      background: 'rgba(255,255,255,0.45)', backdropFilter: 'blur(20px)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 20, height: 20, borderRadius: 5, background: tokens.accent,
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
          fontWeight: 700, fontSize: 11,
          boxShadow: `0 1px 2px ${tokens.accent}66`,
        }}>L</div>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Liquidation OS</div>
      </div>
      <div style={{ width: 1, height: 16, background: tokens.border }} />
      <div style={{ display: 'flex', gap: 4 }}>
        {[['desktop','Desktop'], ['mobile','Mobile']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            border: 'none', background: tab === k ? 'rgba(15,23,42,0.06)' : 'transparent',
            color: tokens.text, padding: '4px 10px', borderRadius: tokens.radius,
            fontFamily: 'inherit', fontSize: 12, cursor: 'pointer', fontWeight: tab === k ? 600 : 400,
          }}>{l}</button>
        ))}
      </div>
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
        <div style={{
          width: 360, height: 26, borderRadius: 13,
          background: 'rgba(255,255,255,0.55)', border: `1px solid ${tokens.border}`,
          display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px',
          color: tokens.textFaint, fontSize: 12,
        }}>
          <Icon d={ICONS.search} size={13} />
          Search lots, customers, jobs
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, background: 'rgba(15,23,42,0.06)' }}>⌘K</span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 11, color: tokens.textDim }}>Avery M.</span>
        <div style={{ width: 22, height: 22, borderRadius: '50%', background: tokens.accent,
          color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, fontWeight: 700 }}>AM</div>
      </div>
    </div>
  );
}

function MicaDesktop({ tokens, selected, setSelected, setActiveLot, view, density }) {
  const navItems = [
    { k: 'inv', l: 'Inventory', icon: ICONS.inventory, active: true },
    { k: 'cust', l: 'Customers', icon: ICONS.customers },
    { k: 'auc', l: 'Auctions', icon: ICONS.tag },
    { k: 'ai', l: 'AI runs', icon: ICONS.ai },
    { k: 'usr', l: 'Users', icon: ICONS.customers },
    { k: 'set', l: 'Settings', icon: ICONS.gear },
  ];
  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0, padding: 10, gap: 10 }}>
      {/* Floating nav panel */}
      <div style={{
        width: 200, background: tokens.surface, backdropFilter: 'blur(20px)',
        borderRadius: tokens.radiusLg, border: `1px solid ${tokens.border}`,
        padding: 8, display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0,
        boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
      }}>
        {navItems.map(n => (
          <div key={n.k} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px',
            borderRadius: tokens.radius,
            background: n.active ? tokens.surfaceSolid : 'transparent',
            boxShadow: n.active ? '0 1px 2px rgba(15,23,42,0.06)' : 'none',
            border: n.active ? `1px solid ${tokens.border}` : '1px solid transparent',
            cursor: 'pointer', position: 'relative',
          }}>
            {n.active && <div style={{ position: 'absolute', left: -4, top: 8, bottom: 8, width: 3, background: tokens.accent, borderRadius: 2 }} />}
            <span style={{ color: n.active ? tokens.accent : tokens.textDim, display: 'flex' }}>
              <Icon d={n.icon} size={15} />
            </span>
            <span style={{ fontSize: 13, fontWeight: n.active ? 600 : 500 }}>{n.l}</span>
          </div>
        ))}
        <div style={{ height: 1, background: tokens.border, margin: '6px 4px' }} />
        <div style={{ padding: '6px 10px', fontSize: 10, color: tokens.textFaint, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' }}>Pinned views</div>
        {['Needs description', 'Ready to assign', 'AI failures'].map(p => (
          <div key={p} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', cursor: 'pointer',
            borderRadius: tokens.radius, fontSize: 12, color: tokens.textDim,
          }}>
            <span style={{ width: 5, height: 5, borderRadius: 2, background: tokens.accent, opacity: 0.6 }} />
            {p}
          </div>
        ))}
      </div>

      {/* Main panel */}
      <div style={{
        flex: 1, background: tokens.surfaceSolid, borderRadius: tokens.radiusLg,
        border: `1px solid ${tokens.border}`, display: 'flex', minWidth: 0, overflow: 'hidden',
        boxShadow: '0 1px 2px rgba(15,23,42,0.04)', position: 'relative',
      }}>
        <MicaFilters tokens={tokens} />
        <MicaResults tokens={tokens} selected={selected} setSelected={setSelected}
          setActiveLot={setActiveLot} view={view} density={density} />
      </div>
    </div>
  );
}

function MicaFilters({ tokens }) {
  const Field = ({ label, value }) => (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: tokens.textDim, marginBottom: 4, fontWeight: 500 }}>{label}</div>
      <div style={{
        height: 28, padding: '0 10px', border: `1px solid ${tokens.borderStrong}`,
        borderRadius: tokens.radius, background: tokens.surfaceSolid,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12,
        color: value ? tokens.text : tokens.textFaint, cursor: 'pointer',
      }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value || 'Any'}</span>
        <Icon d={ICONS.chevron} size={11} />
      </div>
    </div>
  );
  const Pill = ({ on, label }) => (
    <span style={{
      display: 'inline-flex', alignItems: 'center', fontSize: 11, padding: '3px 8px',
      borderRadius: 10, border: `1px solid ${on ? tokens.accent : tokens.border}`,
      background: on ? `${tokens.accent}14` : 'transparent', color: on ? tokens.accent : tokens.textDim,
      marginRight: 4, marginBottom: 4, cursor: 'pointer', fontWeight: 500,
    }}>{label}</span>
  );
  return (
    <div style={{
      width: 230, borderRight: `1px solid ${tokens.border}`,
      padding: 14, overflowY: 'auto', flexShrink: 0, background: tokens.surfaceAlt,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Filters</div>
        <button style={{ border: 'none', background: 'none', color: tokens.accent, fontSize: 11, cursor: 'pointer' }}>Clear</button>
      </div>
      <Field label="Customer" value="Smith Estate" />
      <Field label="Job" value="2026-04-Smith-001" />
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: tokens.textDim, marginBottom: 6, fontWeight: 500 }}>Lot state</div>
        <div>
          <Pill on label="Assigned" />
          <Pill on label="Unassigned" />
          <Pill label="Sold" />
          <Pill label="Picked up" />
          <Pill label="Not sellable" />
        </div>
      </div>
      <Field label="Date cataloged" value="04-01 → 04-29" />
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: tokens.textDim, marginBottom: 6, fontWeight: 500 }}>Has data</div>
        <div>
          <Pill on label="Title" />
          <Pill label="Description" />
          <Pill label="Price" />
        </div>
      </div>
      <div>
        <div style={{ fontSize: 11, color: tokens.textDim, marginBottom: 6, fontWeight: 500 }}>AI status</div>
        <div>
          <Pill on label="Success" />
          <Pill on label="Partial" />
          <Pill label="Failure" />
          <Pill label="Not yet run" />
        </div>
      </div>
    </div>
  );
}

function MicaResults({ tokens, selected, setSelected, setActiveLot, view, density }) {
  const lots = SAMPLE_LOTS;
  const allSelected = selected.length === lots.length;
  const toggle = (id) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  const toggleAll = () => setSelected(allSelected ? [] : lots.map(l => l.id));

  const stateColor = (s) => ({
    'assigned':    { bg: `${tokens.accent}18`, fg: tokens.accent, dot: tokens.accent },
    'unassigned':  { bg: '#F1F5F9', fg: '#64748B', dot: '#94A3B8' },
    'sold':        { bg: '#DCFCE7', fg: tokens.success, dot: tokens.success },
    'picked-up':   { bg: '#F1F5F9', fg: tokens.textFaint, dot: tokens.textFaint },
    'not-sellable':{ bg: '#FEE2E2', fg: tokens.danger, dot: tokens.danger },
  }[s]);

  const aiIcon = (a) => {
    if (a === 'partial') return <span style={{ color: '#B45309' }}><Icon d={ICONS.warning} size={12} /></span>;
    if (a === 'failure') return <span style={{ color: tokens.danger }}><Icon d={ICONS.error} size={12} /></span>;
    return null;
  };

  const rowH = density === 'comfortable' ? 56 : 38;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, position: 'relative' }}>
      <div style={{
        height: 50, padding: '0 16px', borderBottom: `1px solid ${tokens.border}`,
        display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
      }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>Inventory</div>
        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 8, background: `${tokens.accent}14`, color: tokens.accent, fontWeight: 600 }}>12,403</span>
        <div style={{ flex: 1 }} />
        <button style={btnStyleC(tokens, 'subtle')}>Save preset</button>
        <button style={btnStyleC(tokens, 'subtle')}>Export</button>
        <button style={btnStyleC(tokens, 'primary')}><Icon d={ICONS.plus} size={12} stroke={2.4} /> New lot</button>
      </div>

      <div style={{
        height: 36, padding: '0 16px', borderBottom: `1px solid ${tokens.border}`,
        background: tokens.surfaceAlt, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, fontSize: 12,
      }}>
        <span onClick={toggleAll} style={{
          width: 14, height: 14, borderRadius: 3, border: `1.5px solid ${allSelected ? tokens.accent : tokens.borderStrong}`,
          background: allSelected ? tokens.accent : tokens.surfaceSolid, display: 'flex',
          alignItems: 'center', justifyContent: 'center', color: '#fff', cursor: 'pointer',
        }}>{allSelected && <Icon d={ICONS.check} size={9} stroke={2.4} />}</span>
        <span style={{ color: tokens.textDim }}>Sort</span>
        <span style={{ fontWeight: 600 }}>Date cataloged ↓</span>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', borderRadius: tokens.radius, overflow: 'hidden', border: `1px solid ${tokens.borderStrong}` }}>
          {[['rows', ICONS.rows], ['cards', ICONS.cards]].map(([k, ic]) => (
            <button key={k} style={{
              border: 'none', background: view === k ? tokens.surfaceSolid : 'transparent',
              padding: '4px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center',
              color: view === k ? tokens.accent : tokens.textDim,
            }}><Icon d={ic} size={13} /></button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {view === 'rows' ? (
          <div>
            {lots.map((lot) => {
              const sc = stateColor(lot.state);
              const isSel = selected.includes(lot.id);
              const frozen = lot.state === 'sold' || lot.state === 'picked-up' || lot.state === 'not-sellable';
              return (
                <div key={lot.id} onClick={() => setActiveLot(lot.id)} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '4px 16px',
                  height: rowH, borderBottom: `1px solid ${tokens.border}`,
                  background: isSel ? `${tokens.accent}10` : 'transparent', cursor: 'pointer',
                  position: 'relative',
                }}>
                  {isSel && <div style={{ position: 'absolute', left: 0, top: 6, bottom: 6, width: 3, background: tokens.accent, borderRadius: 2 }} />}
                  <span onClick={(e) => { e.stopPropagation(); toggle(lot.id); }} style={{
                    width: 14, height: 14, borderRadius: 3, border: `1.5px solid ${isSel ? tokens.accent : tokens.borderStrong}`,
                    background: isSel ? tokens.accent : tokens.surfaceSolid, display: 'flex',
                    alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0,
                  }}>{isSel && <Icon d={ICONS.check} size={9} stroke={2.4} />}</span>
                  <div style={{
                    width: density === 'comfortable' ? 40 : 28, height: density === 'comfortable' ? 40 : 28,
                    borderRadius: tokens.radius, overflow: 'hidden', flexShrink: 0,
                    border: `1px solid ${tokens.border}`,
                  }}>
                    <PhotoPlaceholder hue={lot.hue} label="" />
                  </div>
                  <div style={{ width: 60, fontSize: 12, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>#{lot.id}</div>
                  <div style={{ width: 160, fontSize: 12, color: tokens.textDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {lot.customer.split(' ')[0]} · {lot.job.split('-').slice(0,2).join('-')}
                  </div>
                  <div style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: frozen ? tokens.textDim : tokens.text }}>
                    {lot.title}
                  </div>
                  {lot.notes !== 'None' && (
                    <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 8, background: tokens.surfaceAlt, border: `1px solid ${tokens.border}`, color: tokens.textDim, fontWeight: 600 }}>
                      {lot.notes}
                    </span>
                  )}
                  {aiIcon(lot.ai)}
                  <span style={{
                    fontSize: 11, padding: '2px 9px', borderRadius: 10, fontWeight: 600,
                    background: sc.bg, color: sc.fg, display: 'flex', alignItems: 'center', gap: 5,
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: sc.dot }} />
                    {STATE_LABELS[lot.state]}
                  </span>
                  {frozen && <span style={{ color: tokens.textFaint }}><Icon d={ICONS.lock} size={11} /></span>}
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
            {lots.map(lot => {
              const sc = stateColor(lot.state);
              const isSel = selected.includes(lot.id);
              return (
                <div key={lot.id} onClick={() => setActiveLot(lot.id)} style={{
                  border: `1px solid ${isSel ? tokens.accent : tokens.border}`, borderRadius: tokens.radiusLg,
                  background: tokens.surfaceSolid, overflow: 'hidden', cursor: 'pointer',
                  boxShadow: isSel ? `0 0 0 1px ${tokens.accent}` : '0 1px 2px rgba(15,23,42,0.04)',
                }}>
                  <div style={{ aspectRatio: '4/3', position: 'relative' }}>
                    <PhotoPlaceholder hue={lot.hue} label="photo" />
                    <span onClick={(e) => { e.stopPropagation(); toggle(lot.id); }} style={{
                      position: 'absolute', top: 8, left: 8, width: 18, height: 18, borderRadius: 4,
                      border: `1.5px solid ${isSel ? tokens.accent : '#fff'}`,
                      background: isSel ? tokens.accent : 'rgba(255,255,255,.85)', display: 'flex',
                      alignItems: 'center', justifyContent: 'center', color: '#fff',
                    }}>{isSel && <Icon d={ICONS.check} size={10} stroke={2.4} />}</span>
                    <span style={{ position: 'absolute', top: 8, right: 8, fontSize: 10, padding: '2px 7px', borderRadius: 8, background: sc.bg, color: sc.fg, fontWeight: 600 }}>
                      {STATE_LABELS[lot.state]}
                    </span>
                  </div>
                  <div style={{ padding: 10 }}>
                    <div style={{ fontSize: 11, color: tokens.textDim, marginBottom: 2, fontVariantNumeric: 'tabular-nums' }}>#{lot.id} · {lot.customer.split(' ')[0]}</div>
                    <div style={{ fontSize: 12, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{lot.title}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selected.length > 0 && (
        <div style={{
          position: 'absolute', bottom: 14, left: 16, right: 16,
          background: 'rgba(15,23,42,0.92)', backdropFilter: 'blur(20px)', color: '#fff',
          borderRadius: tokens.radiusLg, padding: '8px 8px 8px 16px',
          display: 'flex', alignItems: 'center', gap: 12, fontSize: 12,
          boxShadow: '0 12px 40px rgba(15,23,42,0.25)',
        }}>
          <span style={{ fontWeight: 600 }}>{selected.length} selected</span>
          <button onClick={() => setSelected([])} style={{
            border: 'none', background: 'transparent', color: 'rgba(255,255,255,0.7)',
            fontFamily: 'inherit', fontSize: 12, cursor: 'pointer', padding: '4px 8px',
          }}>Clear</button>
          <div style={{ flex: 1 }} />
          {[
            ['Assign to auction', null, true],
            ['Change state', ICONS.tag],
            ['Run AI', ICONS.ai],
            ['Export CSV', ICONS.upload],
          ].map(([l, ic, primary]) => (
            <button key={l} style={{
              border: 'none', background: primary ? tokens.accent : 'rgba(255,255,255,0.1)',
              color: '#fff', padding: '6px 12px', borderRadius: tokens.radius,
              fontFamily: 'inherit', fontSize: 12, fontWeight: 500, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>{ic && <Icon d={ic} size={12} />}{l}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function btnStyleC(tokens, kind) {
  return {
    border: kind === 'primary' ? 'none' : `1px solid ${tokens.borderStrong}`,
    background: kind === 'primary' ? tokens.accent : tokens.surfaceSolid,
    color: kind === 'primary' ? '#fff' : tokens.text,
    padding: '5px 12px', height: 28, borderRadius: tokens.radius,
    fontFamily: 'inherit', fontSize: 12, cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: 6, fontWeight: 500,
    boxShadow: kind === 'primary' ? `0 1px 2px ${tokens.accent}66` : 'none',
  };
}

// ── Mobile cataloging — minimal premium
function MicaMobile({ tokens }) {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 32, overflow: 'auto' }}>
      <MicaLotInProgress tokens={tokens} />
    </div>
  );
}

function MicaLotInProgress({ tokens }) {
  return (
    <AndroidDevice width={380} height={780} title={undefined}>
      <div style={{
        background: `linear-gradient(180deg, ${tokens.accent}10, transparent)`,
        padding: '14px 16px 12px', fontFamily: tokens.font,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: tokens.textDim, fontWeight: 500 }}>
          <Icon d={ICONS.back} size={12} />
          <span>Smith Estate</span>
          <span style={{ color: tokens.textFaint }}>·</span>
          <span>2026-04-Smith-001</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 8 }}>
          <span style={{ fontSize: 11, color: tokens.textDim, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' }}>Lot</span>
          <span style={{ fontSize: 36, fontWeight: 700, lineHeight: 1, letterSpacing: -1, color: tokens.accent }}>10</span>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: tokens.textDim, padding: '3px 9px', borderRadius: 10, background: tokens.surfaceAlt, border: `1px solid ${tokens.border}` }}>9 done · session</span>
        </div>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, fontFamily: tokens.font, fontSize: 13, color: tokens.text }}>
        <div style={{
          height: 96, borderRadius: tokens.radiusLg,
          background: `linear-gradient(135deg, ${tokens.accent}, ${tokens.accent}DD)`,
          color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
          fontFamily: 'inherit', fontSize: 16, fontWeight: 600, cursor: 'pointer',
          boxShadow: `0 8px 24px ${tokens.accent}55`,
        }}>
          <Icon d={ICONS.camera} size={28} stroke={1.6} />
          Capture photo
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          {[0,1,2].map(i => (
            <div key={i} style={{ flex: 1, aspectRatio: '1', borderRadius: tokens.radius, overflow: 'hidden', border: `1px solid ${tokens.border}` }}>
              <PhotoPlaceholder hue={(i * 80) % 360} label={`#${i+1}`} />
            </div>
          ))}
          <div style={{ flex: 1, aspectRatio: '1', borderRadius: tokens.radius, border: `1.5px dashed ${tokens.borderStrong}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: tokens.textFaint }}>
            <Icon d={ICONS.plus} size={16} />
          </div>
        </div>

        <FieldC tokens={tokens} label="Special Notes" required>
          <select defaultValue="CLOTHING" style={selectStyleC(tokens)}>
            <option>None</option><option>TOOL ONLY</option><option>READ</option><option>CLOTHING</option>
          </select>
        </FieldC>

        <FieldC tokens={tokens} label="Size">
          <input defaultValue="Large" style={inputStyleC(tokens)} />
        </FieldC>

        <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: tokens.radius, border: `1px solid ${tokens.border}`, background: tokens.surfaceAlt, cursor: 'pointer' }}>
          <span style={{
            width: 18, height: 18, borderRadius: 4, border: `1.5px solid ${tokens.borderStrong}`, background: tokens.surfaceSolid,
          }} />
          <span style={{ fontSize: 14, fontWeight: 500 }}>Untested</span>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: tokens.textFaint }}>appended to AI desc</span>
        </label>

        <details style={{ borderRadius: tokens.radius, border: `1px solid ${tokens.border}`, background: tokens.surfaceAlt, padding: '10px 12px' }}>
          <summary style={{ fontSize: 13, fontWeight: 500, color: tokens.textDim, cursor: 'pointer' }}>Optional fields · title, desc, price</summary>
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input placeholder="Title (AI will fill)" style={inputStyleC(tokens)} />
            <input placeholder="Price" style={inputStyleC(tokens)} />
          </div>
        </details>

        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button style={{
            flex: 1, height: 50, border: `1px solid ${tokens.borderStrong}`, borderRadius: tokens.radius,
            background: tokens.surfaceSolid, color: tokens.text,
            fontFamily: 'inherit', fontSize: 14, fontWeight: 500, cursor: 'pointer',
          }}>End session</button>
          <button style={{
            flex: 2, height: 50, border: 'none', borderRadius: tokens.radius,
            background: tokens.accent, color: '#fff',
            fontFamily: 'inherit', fontSize: 15, fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            boxShadow: `0 6px 16px ${tokens.accent}55`,
          }}>
            Next · Print Lot 11 <Icon d={ICONS.chevronR} size={14} stroke={2.4} />
          </button>
        </div>
      </div>
    </AndroidDevice>
  );
}

function FieldC({ tokens, label, required, children }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: tokens.textDim, marginBottom: 4, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
        {label}{required && <span style={{ color: tokens.danger }}>*</span>}
      </div>
      {children}
    </div>
  );
}
const inputStyleC = (tokens) => ({
  width: '100%', height: 42, padding: '0 12px', border: `1px solid ${tokens.borderStrong}`,
  borderRadius: tokens.radius, background: tokens.surfaceSolid, fontFamily: tokens.font, fontSize: 14,
  color: tokens.text, outline: 'none', boxSizing: 'border-box',
});
const selectStyleC = (tokens) => ({ ...inputStyleC(tokens), appearance: 'none',
  backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path fill='${encodeURIComponent(tokens.textDim)}' d='M0 0h10L5 6z'/></svg>")`,
  backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center',
});

// ── Lot detail (Mica)
function MicaLotModal({ tokens, lot, onClose }) {
  const frozen = lot.state === 'sold' || lot.state === 'picked-up' || lot.state === 'not-sellable';
  return (
    <div onClick={onClose} style={{
      position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(10px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: 740, maxHeight: '85%', background: tokens.surfaceSolid, borderRadius: tokens.radiusLg,
        boxShadow: '0 30px 80px rgba(15,23,42,0.35)', overflow: 'hidden',
        display: 'flex', flexDirection: 'column', border: `1px solid ${tokens.border}`,
      }}>
        <div style={{
          padding: '14px 18px', borderBottom: `1px solid ${tokens.border}`,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div>
            <div style={{ fontSize: 11, color: tokens.textDim, fontWeight: 500 }}>{lot.customer} · {lot.job}</div>
            <div style={{ fontSize: 17, fontWeight: 600, marginTop: 2 }}>Lot {lot.id}</div>
          </div>
          {frozen && (
            <span style={{ marginLeft: 4, fontSize: 11, padding: '3px 9px', borderRadius: 10, background: '#FEF3C7', color: '#92400E', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Icon d={ICONS.lock} size={11} /> Read-only
            </span>
          )}
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{
            border: 'none', background: 'transparent', cursor: 'pointer', color: tokens.textDim,
            width: 30, height: 30, borderRadius: tokens.radius, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}><Icon d={ICONS.close} size={14} /></button>
        </div>
        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          <div style={{ flex: 1, padding: 18, borderRight: `1px solid ${tokens.border}`, background: tokens.surfaceAlt }}>
            <div style={{ aspectRatio: '4/3', borderRadius: tokens.radius, overflow: 'hidden', border: `1px solid ${tokens.border}` }}>
              <PhotoPlaceholder hue={lot.hue} label="photo 1 of 5" />
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              {[0,1,2,3,4].map(i => (
                <div key={i} style={{ flex: 1, aspectRatio: '1', borderRadius: tokens.radius, overflow: 'hidden', border: `${i === 0 ? 2 : 1}px solid ${i === 0 ? tokens.accent : tokens.border}` }}>
                  <PhotoPlaceholder hue={(lot.hue + i * 40) % 360} />
                </div>
              ))}
            </div>
          </div>
          <div style={{ flex: 1, padding: 18, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field2 tokens={tokens} k="Title" v={lot.title} />
            <Field2 tokens={tokens} k="Description" v={`Brass vase with patina, approx 12" tall. Heavy base, no visible cracks.${lot.notes !== 'None' ? ` ${lot.notes === 'CLOTHING' ? 'CLOTHING - Large' : ''}` : ''}`} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <Field2 tokens={tokens} k="Price" v={lot.price ? `$${lot.price}` : '—'} />
              <Field2 tokens={tokens} k="Quantity" v="1" />
              <Field2 tokens={tokens} k="State" v={STATE_LABELS[lot.state]} pill />
            </div>
            <Field2 tokens={tokens} k="Special Notes" v={lot.notes} />
          </div>
        </div>
        <div style={{ padding: 12, borderTop: `1px solid ${tokens.border}`, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          {!frozen && <button style={btnStyleC(tokens, 'subtle')}><Icon d={ICONS.edit} size={13} /> Edit</button>}
          <button style={btnStyleC(tokens, 'subtle')}><Icon d={ICONS.printer} size={13} /> Reprint label</button>
          <button style={btnStyleC(tokens, 'subtle')}>Change state ▾</button>
          <button style={btnStyleC(tokens, 'primary')}>Done</button>
        </div>
      </div>
    </div>
  );
}

function Field2({ tokens, k, v, pill }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: tokens.textDim, fontWeight: 600, marginBottom: 3 }}>{k}</div>
      {pill ? (
        <span style={{ fontSize: 12, padding: '2px 9px', borderRadius: 10, background: '#DCFCE7', color: tokens.success, fontWeight: 600, display: 'inline-flex' }}>{v}</span>
      ) : (
        <div style={{ fontSize: 13, color: tokens.text, lineHeight: 1.5 }}>{v}</div>
      )}
    </div>
  );
}

Object.assign(window, { OptionC });
