// option-b.jsx — Warehouse Yellow
// Higher-contrast utilitarian take: amber/safety-yellow primary, stronger borders,
// more deliberate spacing in the cataloging loop. Keeps Fluent IA but reads as a
// purpose-built tool rather than a generic admin app.

function OptionB({ accent, view, density }) {
  const tokens = {
    accent: '#1F1F1F',           // primary actions are near-black for max readability
    accentSoft: '#FFF4D6',
    highlight: accent,            // user-set hue used for selection/badges
    bg: '#F7F5EE',
    surface: '#FFFFFF',
    surfaceAlt: '#FBF9F2',
    border: '#D9D4C5',
    borderStrong: '#B8B19E',
    text: '#1A1814',
    textDim: '#5C5848',
    textFaint: '#9A9482',
    danger: '#A4262C',
    warning: '#B45309',
    success: '#2D6A2A',
    font: '"Inter", "Segoe UI Variable", system-ui, sans-serif',
    mono: '"JetBrains Mono", "SF Mono", Menlo, monospace',
    radius: 2,
    radiusLg: 4,
  };
  return <WarehouseShell tokens={tokens} view={view} density={density} />;
}

function WarehouseShell({ tokens, view, density }) {
  const [selected, setSelected] = React.useState([]);
  const [activeLot, setActiveLot] = React.useState(null);
  const [tab, setTab] = React.useState('desktop');
  return (
    <div style={{
      width: '100%', height: '100%', background: tokens.bg, color: tokens.text,
      fontFamily: tokens.font, fontSize: 13, display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <WarehouseTitleBar tokens={tokens} tab={tab} setTab={setTab} />
      {tab === 'desktop'
        ? <WarehouseDesktop tokens={tokens} selected={selected} setSelected={setSelected} setActiveLot={setActiveLot} view={view} density={density} />
        : <WarehouseMobile tokens={tokens} />}
      {activeLot != null && <WarehouseLotModal tokens={tokens} lot={SAMPLE_LOTS.find(l => l.id === activeLot)} onClose={() => setActiveLot(null)} />}
    </div>
  );
}

function WarehouseTitleBar({ tokens, tab, setTab }) {
  return (
    <div style={{
      height: 44, background: tokens.text, borderBottom: `1px solid ${tokens.text}`,
      display: 'flex', alignItems: 'center', padding: '0 12px', gap: 12, flexShrink: 0, color: '#fff',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 22, height: 22, background: tokens.highlight, color: tokens.text,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 800, fontSize: 11, letterSpacing: 0,
          fontFamily: tokens.mono,
        }}>L</div>
        <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.2, textTransform: 'uppercase' }}>Liquidation OS</div>
      </div>
      <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,.15)' }} />
      <div style={{ display: 'flex', gap: 0 }}>
        {[['desktop','Desktop'], ['mobile','Mobile']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            border: 'none', background: tab === k ? 'rgba(255,255,255,.12)' : 'transparent',
            color: '#fff', padding: '6px 12px',
            fontFamily: 'inherit', fontSize: 12, cursor: 'pointer',
            fontWeight: tab === k ? 600 : 400, letterSpacing: 0.2,
          }}>{l.toUpperCase()}</button>
        ))}
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,.55)', fontFamily: tokens.mono }}>SHIFT 04 · 14:23</div>
      <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,.15)' }} />
      <div style={{ fontSize: 12 }}>Avery M.</div>
    </div>
  );
}

function WarehouseDesktop({ tokens, selected, setSelected, setActiveLot, view, density }) {
  const navItems = [
    { k: 'inventory', l: 'INVENTORY', count: '12,403', active: true },
    { k: 'customers', l: 'CUSTOMERS', count: '47' },
    { k: 'auctions', l: 'AUCTIONS', count: '8' },
    { k: 'ai', l: 'AI RUNS', count: '2 pending' },
    { k: 'users', l: 'USERS' },
    { k: 'settings', l: 'SETTINGS' },
  ];
  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
      <div style={{
        width: 180, background: tokens.surface, borderRight: `1px solid ${tokens.border}`,
        padding: '12px 0', display: 'flex', flexDirection: 'column', flexShrink: 0,
      }}>
        {navItems.map(n => (
          <div key={n.k} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
            background: n.active ? tokens.bg : 'transparent',
            borderLeft: `3px solid ${n.active ? tokens.highlight : 'transparent'}`,
            cursor: 'pointer',
          }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, flex: 1, color: n.active ? tokens.text : tokens.textDim }}>{n.l}</span>
            {n.count && <span style={{ fontSize: 10, color: tokens.textFaint, fontFamily: tokens.mono }}>{n.count}</span>}
          </div>
        ))}
      </div>

      <div style={{ flex: 1, display: 'flex', minWidth: 0 }}>
        <WarehouseFilters tokens={tokens} />
        <WarehouseResults tokens={tokens} selected={selected} setSelected={setSelected}
          setActiveLot={setActiveLot} view={view} density={density} />
      </div>
    </div>
  );
}

function WarehouseFilters({ tokens }) {
  const Section = ({ label, children }) => (
    <div style={{ borderBottom: `1px solid ${tokens.border}`, padding: '12px 14px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.8, color: tokens.textDim, marginBottom: 8 }}>{label}</div>
      {children}
    </div>
  );
  const FilterField = ({ value }) => (
    <div style={{
      height: 28, padding: '0 8px', border: `1px solid ${tokens.borderStrong}`,
      background: tokens.surface, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      fontSize: 12, fontFamily: tokens.mono, cursor: 'pointer',
    }}>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
      <Icon d={ICONS.chevron} size={11} />
    </div>
  );
  const Pill = ({ on, label, color }) => (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '3px 8px',
      border: `1px solid ${on ? tokens.text : tokens.border}`, background: on ? tokens.text : 'transparent',
      color: on ? '#fff' : tokens.textDim, marginRight: 4, marginBottom: 4, cursor: 'pointer', fontWeight: 500,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
      {label}
    </span>
  );
  return (
    <div style={{
      width: 220, background: tokens.surfaceAlt, borderRight: `1px solid ${tokens.border}`,
      overflowY: 'auto', flexShrink: 0,
    }}>
      <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${tokens.border}` }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8 }}>FILTERS</div>
        <button style={{ border: 'none', background: 'none', fontSize: 11, color: tokens.textDim, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>RESET</button>
      </div>
      <Section label="SCOPE">
        <FilterField value="Smith Estate" />
        <div style={{ height: 6 }} />
        <FilterField value="2026-04-Smith-001" />
      </Section>
      <Section label="STATE">
        <div>
          <Pill on={true} label="Assigned" color="#2563EB" />
          <Pill on={true} label="Unassigned" color="#9A9482" />
          <Pill on={false} label="Sold" color={tokens.success} />
          <Pill on={false} label="Picked up" color={tokens.textFaint} />
          <Pill on={false} label="Not sellable" color={tokens.danger} />
        </div>
      </Section>
      <Section label="DATE CATALOGED">
        <div style={{ display: 'flex', gap: 6 }}>
          <FilterField value="04-01" />
          <FilterField value="04-29" />
        </div>
      </Section>
      <Section label="HAS DATA">
        <Check tokens={tokens} label="Title" on />
        <Check tokens={tokens} label="Description" on={false} />
        <Check tokens={tokens} label="Price" on={false} />
      </Section>
      <Section label="AI STATUS">
        <Check tokens={tokens} label="Success" on />
        <Check tokens={tokens} label="Partial" on />
        <Check tokens={tokens} label="Failure" on={false} />
        <Check tokens={tokens} label="Not yet run" on={false} />
      </Section>
    </div>
  );
}

function Check({ tokens, label, on }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', cursor: 'pointer' }}>
      <span style={{
        width: 14, height: 14, border: `1.5px solid ${on ? tokens.text : tokens.borderStrong}`,
        background: on ? tokens.text : 'transparent', display: 'flex', alignItems: 'center',
        justifyContent: 'center', color: '#fff', flexShrink: 0,
      }}>{on && <Icon d={ICONS.check} size={9} stroke={2.6} />}</span>
      <span style={{ fontSize: 12 }}>{label}</span>
    </label>
  );
}

function WarehouseResults({ tokens, selected, setSelected, setActiveLot, view, density }) {
  const lots = SAMPLE_LOTS;
  const allSelected = selected.length === lots.length;
  const toggle = (id) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  const toggleAll = () => setSelected(allSelected ? [] : lots.map(l => l.id));

  const stateColor = (s) => ({
    'assigned': { bg: '#FFFFFF', border: '#2563EB', fg: '#1E40AF' },
    'unassigned': { bg: '#FFFFFF', border: tokens.borderStrong, fg: tokens.textDim },
    'sold': { bg: tokens.accentSoft, border: '#A87C00', fg: '#5C4500' },
    'picked-up': { bg: '#F1EFE8', border: tokens.borderStrong, fg: tokens.textFaint },
    'not-sellable': { bg: '#FCEAEA', border: tokens.danger, fg: tokens.danger },
  }[s]);

  const aiBadge = (a) => {
    if (a === 'partial') return <span style={{ color: tokens.warning, fontFamily: tokens.mono, fontSize: 10, fontWeight: 600 }}>PRT</span>;
    if (a === 'failure') return <span style={{ color: tokens.danger, fontFamily: tokens.mono, fontSize: 10, fontWeight: 600 }}>ERR</span>;
    if (a === 'success') return <span style={{ color: tokens.success, fontFamily: tokens.mono, fontSize: 10, fontWeight: 600 }}>OK</span>;
    return <span style={{ color: tokens.textFaint, fontFamily: tokens.mono, fontSize: 10 }}>—</span>;
  };

  const rowH = density === 'comfortable' ? 52 : 36;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, position: 'relative' }}>
      <div style={{
        height: 48, padding: '0 16px', borderBottom: `1px solid ${tokens.border}`,
        background: tokens.surface, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
      }}>
        <div style={{
          flex: 1, maxWidth: 380, height: 30, padding: '0 10px',
          border: `1px solid ${tokens.borderStrong}`, background: tokens.surfaceAlt,
          display: 'flex', alignItems: 'center', gap: 8, fontFamily: tokens.mono,
        }}>
          <Icon d={ICONS.search} size={14} />
          <input placeholder="search…" style={{
            flex: 1, border: 'none', background: 'transparent', outline: 'none',
            fontFamily: 'inherit', fontSize: 12, color: tokens.text,
          }} />
        </div>
        <button style={btnStyleB(tokens, 'subtle')}>Saved presets <Icon d={ICONS.chevron} size={10} /></button>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: tokens.textDim, fontFamily: tokens.mono }}>12,403 RESULTS</span>
      </div>

      <div style={{
        height: 32, padding: '0 16px', borderBottom: `1px solid ${tokens.border}`,
        background: tokens.surfaceAlt, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, fontSize: 11, fontFamily: tokens.mono,
      }}>
        <span onClick={toggleAll} style={{
          width: 13, height: 13, border: `1.5px solid ${allSelected ? tokens.text : tokens.borderStrong}`,
          background: allSelected ? tokens.text : tokens.surface, display: 'flex',
          alignItems: 'center', justifyContent: 'center', color: '#fff', cursor: 'pointer',
        }}>{allSelected && <Icon d={ICONS.check} size={8} stroke={2.6} />}</span>
        <span style={{ color: tokens.textDim }}>SORT</span>
        <span style={{ fontWeight: 600 }}>DATE ▼</span>
        <span style={{ width: 1, height: 14, background: tokens.border }} />
        <span style={{ color: tokens.textDim }}>COLS</span>
        <span style={{ fontWeight: 600 }}>STD</span>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', border: `1px solid ${tokens.borderStrong}` }}>
          {[['rows', ICONS.rows], ['cards', ICONS.cards]].map(([k, ic]) => (
            <button key={k} style={{
              border: 'none', background: view === k ? tokens.text : tokens.surface,
              color: view === k ? '#fff' : tokens.textDim,
              padding: '4px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center',
            }}><Icon d={ic} size={13} /></button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', background: tokens.surface }}>
        {view === 'rows' ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: 36 }} />
              <col style={{ width: density === 'comfortable' ? 64 : 48 }} />
              <col style={{ width: 60 }} />
              <col style={{ width: 160 }} />
              <col />
              <col style={{ width: 90 }} />
              <col style={{ width: 50 }} />
              <col style={{ width: 130 }} />
            </colgroup>
            <thead>
              <tr style={{ background: tokens.surfaceAlt, borderBottom: `1px solid ${tokens.border}` }}>
                {[' ', ' ', 'LOT', 'CUSTOMER · JOB', 'TITLE', 'NOTES', 'AI', 'STATE'].map((h, i) => (
                  <th key={i} style={{
                    padding: '6px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700,
                    letterSpacing: 0.6, color: tokens.textDim, fontFamily: tokens.mono,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lots.map((lot) => {
                const sc = stateColor(lot.state);
                const isSel = selected.includes(lot.id);
                const frozen = lot.state === 'sold' || lot.state === 'picked-up' || lot.state === 'not-sellable';
                return (
                  <tr key={lot.id} onClick={() => setActiveLot(lot.id)} style={{
                    borderBottom: `1px solid ${tokens.border}`, height: rowH,
                    background: isSel ? `${tokens.highlight}22` : 'transparent', cursor: 'pointer',
                  }}>
                    <td style={{ padding: '0 10px' }}>
                      <span onClick={(e) => { e.stopPropagation(); toggle(lot.id); }} style={{
                        display: 'inline-flex', width: 13, height: 13,
                        border: `1.5px solid ${isSel ? tokens.text : tokens.borderStrong}`,
                        background: isSel ? tokens.text : tokens.surface,
                        alignItems: 'center', justifyContent: 'center', color: '#fff',
                      }}>{isSel && <Icon d={ICONS.check} size={8} stroke={2.6} />}</span>
                    </td>
                    <td style={{ padding: '4px 10px' }}>
                      <div style={{ width: density === 'comfortable' ? 44 : 28, height: density === 'comfortable' ? 44 : 28, border: `1px solid ${tokens.border}`, overflow: 'hidden' }}>
                        <PhotoPlaceholder hue={lot.hue} label="" />
                      </div>
                    </td>
                    <td style={{ padding: '0 10px', fontFamily: tokens.mono, fontSize: 12, fontWeight: 600 }}>{lot.id}</td>
                    <td style={{ padding: '0 10px', fontSize: 12, color: tokens.textDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {lot.customer.split(' ')[0]} · {lot.job.split('-').slice(0,2).join('-')}
                    </td>
                    <td style={{ padding: '0 10px', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: frozen ? tokens.textDim : tokens.text }}>
                      {lot.title}
                    </td>
                    <td style={{ padding: '0 10px', fontSize: 10, fontFamily: tokens.mono, color: tokens.textDim, fontWeight: 600 }}>
                      {lot.notes !== 'None' ? lot.notes : '—'}
                    </td>
                    <td style={{ padding: '0 10px' }}>{aiBadge(lot.ai)}</td>
                    <td style={{ padding: '0 10px' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        fontSize: 10, padding: '2px 6px', fontFamily: tokens.mono, fontWeight: 700,
                        background: sc.bg, color: sc.fg, border: `1px solid ${sc.border}`, letterSpacing: 0.4,
                      }}>{STATE_LABELS[lot.state].toUpperCase()}{frozen && <Icon d={ICONS.lock} size={10} />}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12 }}>
            {lots.map(lot => {
              const sc = stateColor(lot.state);
              const isSel = selected.includes(lot.id);
              return (
                <div key={lot.id} onClick={() => setActiveLot(lot.id)} style={{
                  border: `1px solid ${isSel ? tokens.text : tokens.border}`,
                  background: tokens.surface, cursor: 'pointer',
                }}>
                  <div style={{ aspectRatio: '1', position: 'relative', borderBottom: `1px solid ${tokens.border}` }}>
                    <PhotoPlaceholder hue={lot.hue} label="photo" />
                    <span onClick={(e) => { e.stopPropagation(); toggle(lot.id); }} style={{
                      position: 'absolute', top: 6, left: 6, width: 16, height: 16,
                      border: `1.5px solid ${isSel ? tokens.text : '#fff'}`,
                      background: isSel ? tokens.text : 'rgba(255,255,255,.85)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
                    }}>{isSel && <Icon d={ICONS.check} size={9} stroke={2.6} />}</span>
                  </div>
                  <div style={{ padding: 8 }}>
                    <div style={{ fontSize: 10, color: tokens.textDim, fontFamily: tokens.mono, marginBottom: 2 }}>
                      LOT {lot.id} · {lot.customer.split(' ')[0].toUpperCase()}
                    </div>
                    <div style={{ fontSize: 12, lineHeight: 1.3, marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', minHeight: 31 }}>{lot.title}</div>
                    <span style={{
                      display: 'inline-flex', fontSize: 10, padding: '2px 6px', fontFamily: tokens.mono, fontWeight: 700,
                      background: sc.bg, color: sc.fg, border: `1px solid ${sc.border}`, letterSpacing: 0.4,
                    }}>{STATE_LABELS[lot.state].toUpperCase()}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selected.length > 0 && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          background: tokens.text, color: '#fff', padding: '10px 16px',
          display: 'flex', alignItems: 'center', gap: 12, fontSize: 12,
          borderTop: `3px solid ${tokens.highlight}`,
        }}>
          <span style={{ fontFamily: tokens.mono, fontWeight: 700, fontSize: 11, color: tokens.highlight, letterSpacing: 0.5 }}>
            {String(selected.length).padStart(3, '0')} SELECTED
          </span>
          <button onClick={() => setSelected([])} style={{
            border: 'none', background: 'transparent', color: 'rgba(255,255,255,.7)', fontFamily: tokens.mono,
            fontSize: 11, cursor: 'pointer', padding: 0, letterSpacing: 0.5,
          }}>CLEAR</button>
          <div style={{ flex: 1 }} />
          {[
            ['ASSIGN TO AUCTION', true],
            ['CHANGE STATE'],
            ['RUN AI'],
            ['EXPORT CSV'],
          ].map(([l, primary]) => (
            <button key={l} style={{
              border: primary ? 'none' : `1px solid rgba(255,255,255,.2)`,
              background: primary ? tokens.highlight : 'transparent',
              color: primary ? tokens.text : '#fff',
              padding: '7px 14px', fontFamily: tokens.mono, fontSize: 11,
              fontWeight: 700, cursor: 'pointer', letterSpacing: 0.6,
            }}>{l}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function btnStyleB(tokens, kind) {
  return {
    border: kind === 'primary' ? 'none' : `1px solid ${tokens.borderStrong}`,
    background: kind === 'primary' ? tokens.text : tokens.surface,
    color: kind === 'primary' ? '#fff' : tokens.text,
    padding: '6px 10px', height: 28,
    fontFamily: 'inherit', fontSize: 12, cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: 6, fontWeight: 500,
  };
}

// ── Mobile cataloging — utility-first
function WarehouseMobile({ tokens }) {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: tokens.bg, padding: 32, overflow: 'auto' }}>
      <WarehouseLotInProgress tokens={tokens} />
    </div>
  );
}

function WarehouseLotInProgress({ tokens }) {
  return (
    <AndroidDevice width={380} height={780} title={undefined}>
      <div style={{
        background: tokens.text, color: '#fff', padding: '10px 14px',
        fontFamily: tokens.font, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: 10, fontFamily: tokens.mono, color: 'rgba(255,255,255,.6)', letterSpacing: 0.5 }}>SMITH ESTATE / 2026-04-SMITH-001</div>
          <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>Cataloging session</div>
        </div>
        <div style={{ fontFamily: tokens.mono, fontSize: 10, color: tokens.highlight, fontWeight: 700, letterSpacing: 0.5 }}>● LIVE</div>
      </div>

      {/* Big lot number bar */}
      <div style={{
        background: tokens.highlight, padding: '14px 14px',
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', fontFamily: tokens.font,
      }}>
        <div>
          <div style={{ fontSize: 10, fontFamily: tokens.mono, fontWeight: 700, letterSpacing: 0.6 }}>NEXT LOT</div>
          <div style={{ fontSize: 44, fontWeight: 800, lineHeight: 1, fontFamily: tokens.mono, letterSpacing: -1 }}>10</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10, fontFamily: tokens.mono, fontWeight: 700, letterSpacing: 0.6, color: 'rgba(0,0,0,.55)' }}>SESSION</div>
          <div style={{ fontSize: 18, fontWeight: 700, fontFamily: tokens.mono }}>9 done</div>
          <div style={{ fontSize: 10, fontFamily: tokens.mono, color: 'rgba(0,0,0,.55)' }}>~1.4/min</div>
        </div>
      </div>

      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12, fontFamily: tokens.font, fontSize: 13 }}>
        <button style={{
          height: 88, border: `2px solid ${tokens.text}`,
          background: tokens.surface, color: tokens.text,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
          fontFamily: 'inherit', fontSize: 16, fontWeight: 700, cursor: 'pointer',
          letterSpacing: 0.4,
        }}>
          <Icon d={ICONS.camera} size={26} stroke={1.8} />
          TAKE PHOTO
        </button>

        <div style={{ display: 'flex', gap: 6 }}>
          {[0,1,2].map(i => (
            <div key={i} style={{ flex: 1, aspectRatio: '1', border: `1px solid ${tokens.border}`, position: 'relative' }}>
              <PhotoPlaceholder hue={(i * 80) % 360} label={`#${i+1}`} />
            </div>
          ))}
          <div style={{ flex: 1, aspectRatio: '1', border: `1.5px dashed ${tokens.borderStrong}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: tokens.textFaint, fontSize: 11, fontFamily: tokens.mono }}>+</div>
        </div>

        <FieldB tokens={tokens} label="SPECIAL NOTES" required>
          <select defaultValue="CLOTHING" style={selectStyleB(tokens)}>
            <option>None</option><option>TOOL ONLY</option><option>READ</option><option>CLOTHING</option>
          </select>
        </FieldB>

        <FieldB tokens={tokens} label="SIZE">
          <input defaultValue="Large" style={inputStyleB(tokens)} />
        </FieldB>

        <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', border: `1px solid ${tokens.border}`, background: tokens.surfaceAlt, cursor: 'pointer' }}>
          <span style={{
            width: 18, height: 18, border: `2px solid ${tokens.borderStrong}`, background: tokens.surface,
          }} />
          <span style={{ fontSize: 13, fontWeight: 500, fontFamily: tokens.mono, letterSpacing: 0.3 }}>UNTESTED</span>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 10, color: tokens.textFaint, fontFamily: tokens.mono }}>appends to AI desc</span>
        </label>

        <details style={{ background: tokens.surfaceAlt, border: `1px solid ${tokens.border}`, padding: '10px 12px' }}>
          <summary style={{ fontSize: 11, fontFamily: tokens.mono, fontWeight: 700, color: tokens.textDim, letterSpacing: 0.6, cursor: 'pointer' }}>OPTIONAL FIELDS · TITLE / DESC / PRICE / REF</summary>
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input placeholder="title" style={inputStyleB(tokens)} />
            <input placeholder="price" style={inputStyleB(tokens)} />
          </div>
        </details>

        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button style={{
            flex: 1, height: 52, border: `2px solid ${tokens.text}`,
            background: tokens.surface, color: tokens.text,
            fontFamily: tokens.mono, fontSize: 12, fontWeight: 700, letterSpacing: 0.6, cursor: 'pointer',
          }}>END SESSION</button>
          <button style={{
            flex: 2, height: 52, border: 'none',
            background: tokens.text, color: tokens.highlight,
            fontFamily: tokens.mono, fontSize: 14, fontWeight: 800, letterSpacing: 1, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          }}>NEXT · PRINT 11 →</button>
        </div>
      </div>
    </AndroidDevice>
  );
}

function FieldB({ tokens, label, required, children }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontFamily: tokens.mono, fontWeight: 700, color: tokens.textDim, letterSpacing: 0.6, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
        {label}{required && <span style={{ color: tokens.danger }}>*</span>}
      </div>
      {children}
    </div>
  );
}
const inputStyleB = (tokens) => ({
  width: '100%', height: 42, padding: '0 12px', border: `1px solid ${tokens.borderStrong}`,
  background: tokens.surface, fontFamily: tokens.font, fontSize: 14, color: tokens.text,
  outline: 'none', boxSizing: 'border-box',
});
const selectStyleB = (tokens) => ({ ...inputStyleB(tokens), appearance: 'none', fontWeight: 600,
  backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path d='M0 0h10L5 6z'/></svg>")`,
  backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center',
});

// ── Lot detail (Warehouse)
function WarehouseLotModal({ tokens, lot, onClose }) {
  const frozen = lot.state === 'sold' || lot.state === 'picked-up' || lot.state === 'not-sellable';
  return (
    <div onClick={onClose} style={{
      position: 'absolute', inset: 0, background: 'rgba(26,24,20,.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: 720, maxHeight: '85%', background: tokens.surface,
        border: `1px solid ${tokens.text}`, display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          padding: '10px 14px', borderBottom: `1px solid ${tokens.border}`,
          display: 'flex', alignItems: 'center', gap: 10, background: tokens.surfaceAlt,
        }}>
          <div style={{ fontFamily: tokens.mono, fontSize: 11, color: tokens.textDim, fontWeight: 700, letterSpacing: 0.6 }}>LOT</div>
          <div style={{ fontFamily: tokens.mono, fontSize: 22, fontWeight: 800 }}>{lot.id}</div>
          <div style={{ fontSize: 11, color: tokens.textDim }}>{lot.customer} · {lot.job}</div>
          {frozen && (
            <span style={{ marginLeft: 6, fontSize: 10, padding: '2px 8px', background: tokens.text, color: tokens.highlight, fontFamily: tokens.mono, fontWeight: 700, letterSpacing: 0.6, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Icon d={ICONS.lock} size={10} /> READ-ONLY
            </span>
          )}
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: tokens.textDim, padding: 4 }}><Icon d={ICONS.close} size={14} /></button>
        </div>
        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          <div style={{ flex: 1, padding: 14, borderRight: `1px solid ${tokens.border}`, background: tokens.surfaceAlt }}>
            <div style={{ aspectRatio: '4/3', border: `1px solid ${tokens.border}` }}>
              <PhotoPlaceholder hue={lot.hue} label="photo 1 of 5" />
            </div>
            <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
              {[0,1,2,3,4].map(i => (
                <div key={i} style={{ flex: 1, aspectRatio: '1', border: `${i === 0 ? 2 : 1}px solid ${i === 0 ? tokens.text : tokens.border}` }}>
                  <PhotoPlaceholder hue={(lot.hue + i * 40) % 360} />
                </div>
              ))}
            </div>
          </div>
          <div style={{ flex: 1, padding: 14, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Row tokens={tokens} k="TITLE" v={lot.title} />
            <Row tokens={tokens} k="DESCRIPTION" v="Brass vase with patina, approx 12&quot; tall. Heavy base, no visible cracks." />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Row tokens={tokens} k="PRICE" v={lot.price ? `$${lot.price}` : '—'} mono />
              <Row tokens={tokens} k="QTY" v="1" mono />
              <Row tokens={tokens} k="NOTES" v={lot.notes} mono />
              <Row tokens={tokens} k="AI" v={lot.ai.toUpperCase()} mono />
            </div>
            <div>
              <div style={{ fontSize: 10, fontFamily: tokens.mono, fontWeight: 700, color: tokens.textDim, letterSpacing: 0.6, marginBottom: 4 }}>STATE</div>
              <span style={{
                display: 'inline-flex', alignItems: 'center', fontSize: 11, padding: '4px 10px',
                background: '#FFF', border: `1.5px solid ${tokens.text}`, fontFamily: tokens.mono,
                fontWeight: 700, letterSpacing: 0.5,
              }}>{STATE_LABELS[lot.state].toUpperCase()}</span>
            </div>
          </div>
        </div>
        <div style={{ padding: 10, borderTop: `1px solid ${tokens.border}`, display: 'flex', gap: 6, justifyContent: 'flex-end', background: tokens.surfaceAlt }}>
          {!frozen && <button style={btnStyleB(tokens)}><Icon d={ICONS.edit} size={12} /> EDIT</button>}
          <button style={btnStyleB(tokens)}><Icon d={ICONS.printer} size={12} /> REPRINT</button>
          <button style={btnStyleB(tokens)}>STATE ▾</button>
          <button style={btnStyleB(tokens, 'primary')}>DONE</button>
        </div>
      </div>
    </div>
  );
}

function Row({ tokens, k, v, mono }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontFamily: tokens.mono, fontWeight: 700, color: tokens.textDim, letterSpacing: 0.6, marginBottom: 2 }}>{k}</div>
      <div style={{ fontSize: 13, fontFamily: mono ? tokens.mono : tokens.font, color: tokens.text }} dangerouslySetInnerHTML={{ __html: v }} />
    </div>
  );
}

Object.assign(window, { OptionB });
