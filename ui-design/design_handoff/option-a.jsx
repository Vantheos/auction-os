// option-a.jsx — Fluent Crisp
// Cool neutrals, true Fluent blue, hairline borders, subtle elevation.

function OptionA({ accent, view, density }) {
  const tokens = {
    accent,
    bg: '#F3F3F3',
    surface: '#FFFFFF',
    surfaceAlt: '#FAFAFA',
    border: '#E5E5E5',
    borderStrong: '#D1D1D1',
    text: '#1A1A1A',
    textDim: '#5C5C5C',
    textFaint: '#8A8A8A',
    font: '"Segoe UI Variable", "Segoe UI", system-ui, -apple-system, sans-serif',
    radius: 4,
    radiusLg: 8,
  };
  return <FluentCrispShell tokens={tokens} view={view} density={density} />;
}

function FluentCrispShell({ tokens, view, density }) {
  const [selected, setSelected] = React.useState([]);
  const [activeLot, setActiveLot] = React.useState(null);
  const [tab, setTab] = React.useState('desktop'); // desktop | mobile

  return (
    <div style={{
      width: '100%', height: '100%', background: tokens.bg, color: tokens.text,
      fontFamily: tokens.font, fontSize: 13, display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <FluentTitleBar tokens={tokens} tab={tab} setTab={setTab} />
      {tab === 'desktop' ? (
        <FluentDesktop tokens={tokens} selected={selected} setSelected={setSelected}
          setActiveLot={setActiveLot} view={view} density={density} />
      ) : (
        <FluentMobile tokens={tokens} />
      )}
      {activeLot != null && (
        <FluentLotModal tokens={tokens} lot={SAMPLE_LOTS.find(l => l.id === activeLot)}
          onClose={() => setActiveLot(null)} />
      )}
    </div>
  );
}

function FluentTitleBar({ tokens, tab, setTab }) {
  return (
    <div style={{
      height: 48, background: tokens.surface, borderBottom: `1px solid ${tokens.border}`,
      display: 'flex', alignItems: 'center', padding: '0 16px', gap: 16, flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 22, height: 22, borderRadius: 4, background: tokens.accent,
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
          fontWeight: 700, fontSize: 12, letterSpacing: -0.5,
        }}>L</div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Liquidation OS</div>
      </div>
      <div style={{ width: 1, height: 20, background: tokens.border }} />
      <div style={{ display: 'flex', gap: 2 }}>
        {[['desktop','Desktop'], ['mobile','Mobile']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            border: 'none', background: tab === k ? tokens.bg : 'transparent',
            color: tokens.text, padding: '6px 12px', borderRadius: tokens.radius,
            fontFamily: 'inherit', fontSize: 12, cursor: 'pointer', fontWeight: tab === k ? 600 : 400,
          }}>{l} surface</button>
        ))}
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: tokens.textDim, fontSize: 12 }}>
        <span>Office · Avery M.</span>
        <div style={{ width: 24, height: 24, borderRadius: '50%', background: tokens.accent,
          color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 600 }}>AM</div>
      </div>
    </div>
  );
}

function FluentDesktop({ tokens, selected, setSelected, setActiveLot, view, density }) {
  const navItems = [
    { k: 'inventory', l: 'Inventory', icon: ICONS.inventory, active: true, count: '12,403' },
    { k: 'customers', l: 'Customers', icon: ICONS.customers },
    { k: 'auctions', l: 'Auctions', icon: ICONS.tag },
    { k: 'ai', l: 'AI runs', icon: ICONS.ai },
    { k: 'users', l: 'Users', icon: ICONS.customers },
    { k: 'settings', l: 'Settings', icon: ICONS.gear },
  ];
  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
      {/* Left nav */}
      <div style={{
        width: 220, background: tokens.surface, borderRight: `1px solid ${tokens.border}`,
        padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 1, flexShrink: 0,
      }}>
        {navItems.map(n => (
          <div key={n.k} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px',
            borderRadius: tokens.radius, background: n.active ? tokens.bg : 'transparent',
            cursor: 'pointer', position: 'relative',
          }}>
            {n.active && <div style={{ position: 'absolute', left: 0, top: 8, bottom: 8, width: 3, background: tokens.accent, borderRadius: 2 }} />}
            <span style={{ color: n.active ? tokens.accent : tokens.textDim, display: 'flex' }}>
              <Icon d={n.icon} size={16} />
            </span>
            <span style={{ fontSize: 13, fontWeight: n.active ? 600 : 400, flex: 1 }}>{n.l}</span>
            {n.count && <span style={{ fontSize: 11, color: tokens.textFaint, fontVariantNumeric: 'tabular-nums' }}>{n.count}</span>}
          </div>
        ))}
      </div>
      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', minWidth: 0 }}>
        {/* Filters */}
        <FluentFilters tokens={tokens} />
        {/* Results */}
        <FluentResults tokens={tokens} selected={selected} setSelected={setSelected}
          setActiveLot={setActiveLot} view={view} density={density} />
      </div>
    </div>
  );
}

function FluentFilters({ tokens }) {
  const Filter = ({ label, value, badge }) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, color: tokens.textDim, marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      <div style={{
        height: 30, padding: '0 10px', border: `1px solid ${tokens.borderStrong}`, borderRadius: tokens.radius,
        background: tokens.surface, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontSize: 13, color: value ? tokens.text : tokens.textFaint, cursor: 'pointer',
      }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value || 'Any'}</span>
        {badge ? <span style={{
          background: tokens.accent, color: '#fff', fontSize: 10, padding: '1px 6px',
          borderRadius: 8, fontWeight: 600, marginLeft: 6,
        }}>{badge}</span> : <Icon d={ICONS.chevron} size={12} />}
      </div>
    </div>
  );
  const Check = ({ label, on }) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer' }}>
      <span style={{
        width: 16, height: 16, borderRadius: 3, border: `1.5px solid ${on ? tokens.accent : tokens.borderStrong}`,
        background: on ? tokens.accent : tokens.surface, display: 'flex', alignItems: 'center',
        justifyContent: 'center', color: '#fff', flexShrink: 0,
      }}>{on && <Icon d={ICONS.check} size={10} stroke={2.4} />}</span>
      <span style={{ fontSize: 13 }}>{label}</span>
    </label>
  );
  return (
    <div style={{
      width: 240, background: tokens.surface, borderRight: `1px solid ${tokens.border}`,
      padding: 16, overflowY: 'auto', flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Filters</div>
        <button style={{ border: 'none', background: 'none', color: tokens.accent, fontSize: 12, cursor: 'pointer', padding: 0 }}>Clear all</button>
      </div>
      <Filter label="Customer" value="Smith Estate" />
      <Filter label="Job" value="2026-04-Smith-001" />
      <Filter label="Lot state" value="Assigned, Unassigned" badge="2" />
      <Filter label="Date cataloged" />
      <Filter label="Special notes" />
      <div style={{ height: 1, background: tokens.border, margin: '4px 0 14px' }} />
      <div style={{ fontSize: 11, color: tokens.textDim, marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>Has data</div>
      <Check label="Title" on={true} />
      <Check label="Description" on={false} />
      <Check label="Price" on={false} />
      <div style={{ height: 1, background: tokens.border, margin: '14px 0' }} />
      <div style={{ fontSize: 11, color: tokens.textDim, marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>AI status</div>
      <Check label="Success" on={true} />
      <Check label="Partial" on={true} />
      <Check label="Failure" on={false} />
      <Check label="Not yet run" on={false} />
    </div>
  );
}

function FluentResults({ tokens, selected, setSelected, setActiveLot, view, density }) {
  const lots = SAMPLE_LOTS;
  const allSelected = selected.length === lots.length;
  const toggle = (id) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  const toggleAll = () => setSelected(allSelected ? [] : lots.map(l => l.id));

  const stateColor = (s) => ({
    'assigned': { bg: '#EFF6FC', fg: '#005A9E', dot: tokens.accent },
    'unassigned': { bg: '#F5F5F5', fg: '#616161', dot: '#9E9E9E' },
    'sold': { bg: '#F0F8E8', fg: '#0E6B0E', dot: '#107C10' },
    'picked-up': { bg: '#F3F2F1', fg: '#605E5C', dot: '#8A8886' },
    'not-sellable': { bg: '#FDF3F4', fg: '#A4262C', dot: '#A4262C' },
  }[s]);

  const aiIcon = (a) => {
    if (a === 'partial') return <span title="Partial AI" style={{ color: '#CA5010' }}><Icon d={ICONS.warning} size={12} /></span>;
    if (a === 'failure') return <span title="AI failed" style={{ color: '#A4262C' }}><Icon d={ICONS.error} size={12} /></span>;
    return null;
  };

  const rowH = density === 'comfortable' ? 56 : 40;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, position: 'relative' }}>
      {/* Command bar */}
      <div style={{
        height: 56, padding: '0 20px', borderBottom: `1px solid ${tokens.border}`,
        background: tokens.surface, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
      }}>
        <div style={{
          flex: 1, maxWidth: 360, height: 30, padding: '0 10px', border: `1px solid ${tokens.borderStrong}`,
          borderRadius: tokens.radius, background: tokens.surfaceAlt, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ color: tokens.textFaint }}><Icon d={ICONS.search} size={14} /></span>
          <input placeholder="Search title, description, ref…" style={{
            flex: 1, border: 'none', background: 'transparent', outline: 'none',
            fontFamily: 'inherit', fontSize: 13, color: tokens.text,
          }} />
          <span style={{ color: tokens.textFaint, fontSize: 11,
            border: `1px solid ${tokens.borderStrong}`, padding: '0 5px', borderRadius: 3 }}>⌘K</span>
        </div>
        <div style={{ width: 1, height: 20, background: tokens.border }} />
        <button style={btnStyle(tokens, 'subtle')}>Saved presets <Icon d={ICONS.chevron} size={11} /></button>
        <button style={btnStyle(tokens, 'subtle')}>Save current</button>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: tokens.textDim, fontVariantNumeric: 'tabular-nums' }}>12,403 lots</span>
      </div>

      {/* Sub bar: sort + view */}
      <div style={{
        height: 40, padding: '0 20px', borderBottom: `1px solid ${tokens.border}`,
        background: tokens.surfaceAlt, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, fontSize: 12,
      }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <span style={{
            width: 14, height: 14, borderRadius: 3, border: `1.5px solid ${tokens.borderStrong}`,
            background: allSelected ? tokens.accent : tokens.surface, display: 'flex',
            alignItems: 'center', justifyContent: 'center', color: '#fff',
          }} onClick={toggleAll}>{allSelected && <Icon d={ICONS.check} size={9} stroke={2.4} />}</span>
        </label>
        <div style={{ width: 1, height: 16, background: tokens.border, margin: '0 4px' }} />
        <span style={{ color: tokens.textDim }}>Sort:</span>
        <button style={{ ...btnStyle(tokens, 'subtle'), padding: '4px 8px', height: 24 }}>
          Date cataloged, newest <Icon d={ICONS.chevron} size={10} />
        </button>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', border: `1px solid ${tokens.borderStrong}`, borderRadius: tokens.radius, overflow: 'hidden' }}>
          {[['rows', ICONS.rows], ['cards', ICONS.cards]].map(([k, ic]) => (
            <button key={k} style={{
              border: 'none', background: view === k ? tokens.bg : tokens.surface,
              padding: '4px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center',
              color: view === k ? tokens.accent : tokens.textDim,
            }}><Icon d={ic} size={14} /></button>
          ))}
        </div>
      </div>

      {/* Rows */}
      <div style={{ flex: 1, overflowY: 'auto', background: tokens.surface }}>
        {view === 'rows' ? (
          <div>
            {lots.map((lot) => {
              const sc = stateColor(lot.state);
              const isSel = selected.includes(lot.id);
              const frozen = lot.state === 'sold' || lot.state === 'picked-up' || lot.state === 'not-sellable';
              return (
                <div key={lot.id} onClick={() => setActiveLot(lot.id)} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: density === 'comfortable' ? '8px 20px' : '4px 20px',
                  height: rowH, borderBottom: `1px solid ${tokens.border}`,
                  background: isSel ? '#EFF6FC' : 'transparent', cursor: 'pointer',
                  position: 'relative',
                }}>
                  {isSel && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 2, background: tokens.accent }} />}
                  <span onClick={(e) => { e.stopPropagation(); toggle(lot.id); }} style={{
                    width: 14, height: 14, borderRadius: 3, border: `1.5px solid ${isSel ? tokens.accent : tokens.borderStrong}`,
                    background: isSel ? tokens.accent : tokens.surface, display: 'flex',
                    alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0,
                  }}>{isSel && <Icon d={ICONS.check} size={9} stroke={2.4} />}</span>
                  <div style={{
                    width: density === 'comfortable' ? 40 : 28, height: density === 'comfortable' ? 40 : 28,
                    borderRadius: 3, overflow: 'hidden', flexShrink: 0,
                    border: `1px solid ${tokens.border}`,
                  }}>
                    <PhotoPlaceholder hue={lot.hue} label="" stripes={true} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 200, fontSize: 12, color: tokens.textDim, fontVariantNumeric: 'tabular-nums' }}>
                    <span style={{ color: tokens.text, fontWeight: 500 }}>Lot {lot.id}</span>
                    <span>·</span>
                    <span>{lot.customer}</span>
                  </div>
                  <div style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: frozen ? tokens.textDim : tokens.text }}>
                    {lot.title}
                  </div>
                  {lot.notes !== 'None' && (
                    <span style={{ fontSize: 10, padding: '2px 6px', border: `1px solid ${tokens.border}`, borderRadius: 3, color: tokens.textDim, fontWeight: 600, letterSpacing: 0.3 }}>
                      {lot.notes}
                    </span>
                  )}
                  {aiIcon(lot.ai)}
                  <span style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600,
                    background: sc.bg, color: sc.fg, display: 'flex', alignItems: 'center', gap: 5,
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: sc.dot }} />
                    {STATE_LABELS[lot.state]}
                  </span>
                  {frozen && <span style={{ color: tokens.textFaint }}><Icon d={ICONS.lock} size={12} /></span>}
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ padding: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 }}>
            {lots.map(lot => {
              const sc = stateColor(lot.state);
              const isSel = selected.includes(lot.id);
              return (
                <div key={lot.id} onClick={() => setActiveLot(lot.id)} style={{
                  border: `1px solid ${isSel ? tokens.accent : tokens.border}`, borderRadius: tokens.radiusLg,
                  background: tokens.surface, overflow: 'hidden', cursor: 'pointer',
                  boxShadow: isSel ? `0 0 0 1px ${tokens.accent}` : '0 1px 2px rgba(0,0,0,.04)',
                }}>
                  <div style={{ aspectRatio: '4/3', position: 'relative' }}>
                    <PhotoPlaceholder hue={lot.hue} label="photo" />
                    <span onClick={(e) => { e.stopPropagation(); toggle(lot.id); }} style={{
                      position: 'absolute', top: 8, left: 8, width: 18, height: 18, borderRadius: 3,
                      border: `1.5px solid ${isSel ? tokens.accent : '#fff'}`,
                      background: isSel ? tokens.accent : 'rgba(255,255,255,.85)', display: 'flex',
                      alignItems: 'center', justifyContent: 'center', color: '#fff',
                    }}>{isSel && <Icon d={ICONS.check} size={10} stroke={2.4} />}</span>
                    <span style={{
                      position: 'absolute', top: 8, right: 8,
                      fontSize: 10, padding: '2px 6px', borderRadius: 8, fontWeight: 600,
                      background: sc.bg, color: sc.fg,
                    }}>{STATE_LABELS[lot.state]}</span>
                  </div>
                  <div style={{ padding: 10 }}>
                    <div style={{ fontSize: 11, color: tokens.textDim, marginBottom: 2, fontVariantNumeric: 'tabular-nums' }}>Lot {lot.id} · {lot.customer.split(' ')[0]}</div>
                    <div style={{ fontSize: 12, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{lot.title}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bulk action bar */}
      {selected.length > 0 && (
        <div style={{
          position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
          background: '#1F1F1F', color: '#fff', borderRadius: tokens.radiusLg, padding: '8px 8px 8px 16px',
          display: 'flex', alignItems: 'center', gap: 12, fontSize: 13,
          boxShadow: '0 8px 24px rgba(0,0,0,.18)',
        }}>
          <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{selected.length} selected</span>
          <span style={{ width: 1, height: 16, background: 'rgba(255,255,255,.2)' }} />
          <button onClick={() => setSelected([])} style={{
            border: 'none', background: 'transparent', color: 'rgba(255,255,255,.7)', fontFamily: 'inherit',
            fontSize: 13, cursor: 'pointer', padding: '4px 8px',
          }}>Clear</button>
          {[
            ['Assign to auction', null, true],
            ['Change state', ICONS.tag],
            ['Run AI', ICONS.ai],
            ['Export CSV', ICONS.upload],
          ].map(([l, ic, primary]) => (
            <button key={l} style={{
              border: 'none', background: primary ? tokens.accent : 'rgba(255,255,255,.1)',
              color: '#fff', padding: '6px 12px', borderRadius: 4, fontFamily: 'inherit', fontSize: 12,
              fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
            }}>
              {ic && <Icon d={ic} size={13} />}
              {l}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function btnStyle(tokens, kind) {
  const base = {
    border: kind === 'primary' ? 'none' : `1px solid ${tokens.borderStrong}`,
    background: kind === 'primary' ? tokens.accent : (kind === 'subtle' ? 'transparent' : tokens.surface),
    color: kind === 'primary' ? '#fff' : tokens.text,
    padding: '6px 12px', borderRadius: tokens.radius, height: 30,
    fontFamily: 'inherit', fontSize: 12, cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: 6, fontWeight: 500,
  };
  if (kind === 'subtle') base.border = '1px solid transparent';
  return base;
}

// ── Mobile cataloging ──────────────────────────────────────────────────────
function FluentMobile({ tokens }) {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: tokens.bg, padding: 32, overflow: 'auto' }}>
      <FluentLotInProgress tokens={tokens} />
    </div>
  );
}

function FluentLotInProgress({ tokens }) {
  const [photos, setPhotos] = React.useState([1, 2, 3]);
  const [notes, setNotes] = React.useState('CLOTHING');
  const [size, setSize] = React.useState('Large');
  const [untested, setUntested] = React.useState(false);
  return (
    <AndroidDevice width={380} height={780} title={undefined}>
      {/* Session header (custom, replaces app bar) */}
      <div style={{
        background: tokens.surface, padding: '12px 16px',
        borderBottom: `1px solid ${tokens.border}`, fontFamily: tokens.font,
      }}>
        <div style={{ fontSize: 11, color: tokens.textDim, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' }}>Smith Estate · 2026-04-Smith-001</div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 4 }}>
          <div style={{ fontSize: 32, fontWeight: 600, letterSpacing: -0.6 }}>Lot 10</div>
          <div style={{ fontSize: 12, color: tokens.textDim }}>9 cataloged today</div>
        </div>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14, fontFamily: tokens.font, fontSize: 13, color: tokens.text }}>
        {/* Big camera button */}
        <button style={{
          height: 96, border: `2px dashed ${tokens.borderStrong}`, borderRadius: tokens.radiusLg,
          background: tokens.surface, color: tokens.accent,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          fontFamily: 'inherit', fontSize: 16, fontWeight: 600, cursor: 'pointer',
        }}>
          <Icon d={ICONS.camera} size={28} stroke={1.6} />
          Take photo
        </button>

        {/* Thumbnails */}
        <div style={{ display: 'flex', gap: 8 }}>
          {photos.map((p, i) => (
            <div key={p} style={{ flex: 1, aspectRatio: '1', borderRadius: tokens.radius, overflow: 'hidden', border: `1px solid ${tokens.border}`, position: 'relative' }}>
              <PhotoPlaceholder hue={(i * 80) % 360} label={`#${i+1}`} />
            </div>
          ))}
          <div style={{ flex: 1, aspectRatio: '1', borderRadius: tokens.radius, border: `1.5px dashed ${tokens.borderStrong}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: tokens.textFaint }}>
            <Icon d={ICONS.plus} size={18} />
          </div>
        </div>

        {/* Special notes */}
        <Field tokens={tokens} label="Special Notes" required>
          <select value={notes} onChange={(e) => setNotes(e.target.value)} style={selectStyle(tokens)}>
            <option>None</option>
            <option>TOOL ONLY</option>
            <option>READ</option>
            <option>CLOTHING</option>
          </select>
        </Field>

        {notes === 'CLOTHING' && (
          <Field tokens={tokens} label="Size">
            <input value={size} onChange={(e) => setSize(e.target.value)} style={inputStyle(tokens)} />
          </Field>
        )}

        <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0' }}>
          <span onClick={() => setUntested(!untested)} style={{
            width: 18, height: 18, borderRadius: 3, border: `1.5px solid ${untested ? tokens.accent : tokens.borderStrong}`,
            background: untested ? tokens.accent : tokens.surface, display: 'flex',
            alignItems: 'center', justifyContent: 'center', color: '#fff', cursor: 'pointer',
          }}>{untested && <Icon d={ICONS.check} size={11} stroke={2.4} />}</span>
          <span style={{ fontSize: 14 }}>Untested</span>
        </label>

        <Field tokens={tokens} label="Title" optional>
          <input placeholder="(optional — AI will fill)" style={inputStyle(tokens)} />
        </Field>
        <Field tokens={tokens} label="Price" optional>
          <input placeholder="(optional)" style={inputStyle(tokens)} />
        </Field>

        {/* Bottom buttons */}
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button style={{
            flex: 1, height: 48, border: `1px solid ${tokens.borderStrong}`, borderRadius: tokens.radius,
            background: tokens.surface, color: tokens.text,
            fontFamily: 'inherit', fontSize: 14, fontWeight: 500, cursor: 'pointer',
          }}>New Catalog</button>
          <button style={{
            flex: 2, height: 48, border: 'none', borderRadius: tokens.radius,
            background: tokens.accent, color: '#fff',
            fontFamily: 'inherit', fontSize: 15, fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            Next · Print Lot 11 <Icon d={ICONS.chevronR} size={14} stroke={2.5} />
          </button>
        </div>
      </div>
    </AndroidDevice>
  );
}

function Field({ label, optional, required, children, tokens }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: tokens.textDim, marginBottom: 4, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
        {label}
        {required && <span style={{ color: '#A4262C' }}>*</span>}
        {optional && <span style={{ color: tokens.textFaint, fontWeight: 400 }}>optional</span>}
      </div>
      {children}
    </div>
  );
}

const inputStyle = (tokens) => ({
  width: '100%', height: 40, padding: '0 12px', border: `1px solid ${tokens.borderStrong}`,
  borderRadius: tokens.radius, background: tokens.surface, fontFamily: tokens.font, fontSize: 14,
  color: tokens.text, outline: 'none', boxSizing: 'border-box',
});
const selectStyle = (tokens) => ({ ...inputStyle(tokens), appearance: 'none',
  backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path fill='${encodeURIComponent(tokens.textDim)}' d='M0 0h10L5 6z'/></svg>")`,
  backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center',
});

// ── Lot detail modal (light) ───────────────────────────────────────────────
function FluentLotModal({ tokens, lot, onClose }) {
  const frozen = lot.state === 'sold' || lot.state === 'picked-up' || lot.state === 'not-sellable';
  return (
    <div onClick={onClose} style={{
      position: 'absolute', inset: 0, background: 'rgba(0,0,0,.4)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: 720, maxHeight: '85%', background: tokens.surface, borderRadius: tokens.radiusLg,
        boxShadow: '0 20px 60px rgba(0,0,0,.25)', overflow: 'hidden', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          height: 48, padding: '0 16px', borderBottom: `1px solid ${tokens.border}`,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>Lot {lot.id}</div>
          <span style={{ color: tokens.textFaint }}>·</span>
          <div style={{ fontSize: 13, color: tokens.textDim }}>{lot.customer} · {lot.job}</div>
          {frozen && (
            <span style={{ marginLeft: 8, fontSize: 11, padding: '2px 8px', borderRadius: 10, background: '#FFF4CE', color: '#7A5400', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Icon d={ICONS.lock} size={11} /> Read-only
            </span>
          )}
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{
            border: 'none', background: 'transparent', cursor: 'pointer', color: tokens.textDim,
            width: 28, height: 28, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}><Icon d={ICONS.close} size={14} /></button>
        </div>
        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          <div style={{ flex: 1, padding: 16, borderRight: `1px solid ${tokens.border}` }}>
            <div style={{ aspectRatio: '4/3', borderRadius: tokens.radius, overflow: 'hidden', border: `1px solid ${tokens.border}` }}>
              <PhotoPlaceholder hue={lot.hue} label="photo 1 of 5" />
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              {[0,1,2,3,4].map(i => (
                <div key={i} style={{ flex: 1, aspectRatio: '1', borderRadius: 3, overflow: 'hidden', border: `${i === 0 ? 2 : 1}px solid ${i === 0 ? tokens.accent : tokens.border}` }}>
                  <PhotoPlaceholder hue={(lot.hue + i * 40) % 360} />
                </div>
              ))}
            </div>
          </div>
          <div style={{ flex: 1, padding: 16, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: tokens.textDim, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>Title</div>
              <div style={{ fontSize: 14, marginTop: 2 }}>{lot.title}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: tokens.textDim, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>Description</div>
              <div style={{ fontSize: 13, marginTop: 2, color: tokens.textDim, lineHeight: 1.5 }}>
                Brass vase with patina, approx 12" tall. Heavy base, no visible cracks. {lot.notes !== 'None' && <strong style={{ color: tokens.text }}>{lot.notes === 'CLOTHING' ? 'CLOTHING - Large' : ''}</strong>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 16 }}>
              <div>
                <div style={{ fontSize: 11, color: tokens.textDim, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>Price</div>
                <div style={{ fontSize: 14, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{lot.price ? `$${lot.price}` : '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: tokens.textDim, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>Quantity</div>
                <div style={{ fontSize: 14, marginTop: 2 }}>1</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: tokens.textDim, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>State</div>
                <div style={{ fontSize: 12, marginTop: 2, padding: '2px 8px', borderRadius: 10, background: '#F0F8E8', color: '#0E6B0E', display: 'inline-flex', fontWeight: 600 }}>
                  {STATE_LABELS[lot.state]}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div style={{ padding: 12, borderTop: `1px solid ${tokens.border}`, display: 'flex', gap: 8, justifyContent: 'flex-end', background: tokens.surfaceAlt }}>
          {!frozen && <button style={btnStyle(tokens, 'subtle')}><Icon d={ICONS.edit} size={13} /> Edit</button>}
          <button style={btnStyle(tokens, 'subtle')}><Icon d={ICONS.printer} size={13} /> Reprint label</button>
          <button style={btnStyle(tokens, 'subtle')}>Change state <Icon d={ICONS.chevron} size={11} /></button>
          <button style={btnStyle(tokens, 'primary')}>Done</button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { OptionA });
