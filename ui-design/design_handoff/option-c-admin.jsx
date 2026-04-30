// option-c-admin.jsx — Admin shell (Option C · Mica Slate)
// Pages:
//   Customers (list + detail with jobs)
//   Users
//   Settings (Printer · AI Schedule · Org)
//   Audit (reporting view)
//
// Reuses C_TOKENS, CUSTOMERS, JOBS_BY_CUSTOMER from option-c-flow.jsx
// Reuses LIFECYCLE_LOTS, StatePill from option-c-lifecycle.jsx

// ────── Sample data ──────
const ADMIN_USERS = [
  { id: 'u1', name: 'Avery Mitchell',  email: 'avery@liquidationos.test',   role: 'admin',     status: 'active',   lastSignIn: '2026-04-29 09:14', avatar: '#1E40AF' },
  { id: 'u2', name: 'Jordan Pena',     email: 'jordan@liquidationos.test',  role: 'admin',     status: 'active',   lastSignIn: '2026-04-28 17:02', avatar: '#0E7490' },
  { id: 'u3', name: 'Riley Chen',      email: 'riley@liquidationos.test',   role: 'office',    status: 'active',   lastSignIn: '2026-04-29 08:30', avatar: '#7C2D12' },
  { id: 'u4', name: 'Sam Okafor',      email: 'sam@liquidationos.test',     role: 'office',    status: 'active',   lastSignIn: '2026-04-26 14:45', avatar: '#15803D' },
  { id: 'u5', name: 'Morgan Liu',      email: 'morgan@liquidationos.test',  role: 'warehouse', status: 'active',   lastSignIn: '2026-04-29 07:50', avatar: '#92400E' },
  { id: 'u6', name: 'Casey Brooks',    email: 'casey@liquidationos.test',   role: 'warehouse', status: 'active',   lastSignIn: '2026-04-29 06:38', avatar: '#7E22CE' },
  { id: 'u7', name: 'Drew Hassan',     email: 'drew@liquidationos.test',    role: 'warehouse', status: 'inactive', lastSignIn: '2026-03-12 11:24', avatar: '#475569' },
  { id: 'u8', name: 'Pat Romero',      email: 'pat@liquidationos.test',     role: 'office',    status: 'pending',  lastSignIn: null,               avatar: '#BE185D' },
];

const ROLE_LABEL = { admin: 'Admin', office: 'Office', warehouse: 'Warehouse' };
const ROLE_BG = { admin: '#FEE2E2', office: '#DBEAFE', warehouse: '#FEF3C7' };
const ROLE_FG = { admin: '#B91C1C', office: '#1E40AF', warehouse: '#92400E' };

const STATUS_BG = { active: '#DCFCE7', inactive: '#F1F5F9', pending: '#FEF3C7' };
const STATUS_FG = { active: '#15803D', inactive: '#64748B', pending: '#92400E' };

const AUDIT_ENTRIES = [
  { id: 'a1',  ts: '2026-04-29 14:32', actor: 'Avery Mitchell', action: 'state.change',    target: 'Lot 13 (Smith Estate · 2026-04-Smith-001)', from: 'sold',         to: 'picked-up',   note: 'Buyer B-1042 collected' },
  { id: 'a2',  ts: '2026-04-29 14:18', actor: 'Riley Chen',     action: 'lot.move',         target: 'Lot 87 → Lot 12 (Patel Holdings · 2026-04-Patel-002)', from: 'Smith·001#87', to: 'Patel·002#12', note: '' },
  { id: 'a3',  ts: '2026-04-29 13:55', actor: 'Avery Mitchell', action: 'lot.delete',       target: 'Lot 4 (Smith Estate · 2026-03-Smith-009)', from: '—', to: '—', note: 'Duplicate entry' },
  { id: 'a4',  ts: '2026-04-29 13:14', actor: 'Sam Okafor',     action: 'state.change',    target: 'Lot 22 (Jones Family · 2026-03-Jones-014)', from: 'assigned',     to: 'sold',        note: '' },
  { id: 'a5',  ts: '2026-04-29 11:42', actor: 'AI · scheduled', action: 'ai.run',          target: '34 lots in 2026-04-Smith-001', from: '—', to: '—', note: '32 success · 1 partial · 1 failure' },
  { id: 'a6',  ts: '2026-04-29 10:30', actor: 'Jordan Pena',    action: 'user.role',       target: 'Pat Romero',                from: '—', to: 'office', note: 'Invited new office user' },
  { id: 'a7',  ts: '2026-04-29 09:18', actor: 'Avery Mitchell', action: 'state.change',    target: 'Lot 15 (Jones Family · 2026-03-Jones-014)', from: 'assigned',     to: 'not-sellable', note: 'Damaged beyond repair' },
  { id: 'a8',  ts: '2026-04-28 16:05', actor: 'Morgan Liu',     action: 'lot.create',      target: 'Lot 41 (O\u2019Connor · 2026-04-OConnor-005)', from: '—', to: '—', note: 'Cataloged on mobile' },
  { id: 'a9',  ts: '2026-04-28 15:41', actor: 'Riley Chen',     action: 'job.create',      target: '2026-04-Patel-002 (Patel Holdings)',         from: '—', to: '—', note: '' },
  { id: 'a10', ts: '2026-04-28 14:22', actor: 'Avery Mitchell', action: 'settings.update', target: 'AI schedule',                                from: 'Daily 02:00',  to: 'Hourly',      note: 'Higher cadence for backlog week' },
  { id: 'a11', ts: '2026-04-28 12:00', actor: 'AI · scheduled', action: 'ai.run',          target: '127 lots across 4 jobs',                     from: '—', to: '—', note: '120 success · 4 partial · 3 failure' },
  { id: 'a12', ts: '2026-04-28 09:50', actor: 'Avery Mitchell', action: 'customer.create', target: 'Reyes Property LLC',                          from: '—', to: '—', note: '' },
];
const ACTION_COLORS = {
  'state.change':    { bg: 'rgba(30,64,175,0.10)', fg: '#1E40AF' },
  'lot.move':        { bg: 'rgba(124,45,18,0.10)', fg: '#7C2D12' },
  'lot.delete':      { bg: 'rgba(185,28,28,0.10)', fg: '#B91C1C' },
  'lot.create':      { bg: 'rgba(21,128,61,0.10)', fg: '#15803D' },
  'ai.run':          { bg: 'rgba(180,83,9,0.10)',  fg: '#B45309' },
  'user.role':       { bg: 'rgba(126,34,206,0.10)',fg: '#7E22CE' },
  'job.create':      { bg: 'rgba(14,116,144,0.10)',fg: '#0E7490' },
  'customer.create': { bg: 'rgba(190,24,93,0.10)', fg: '#BE185D' },
  'settings.update': { bg: 'rgba(71,85,105,0.10)', fg: '#475569' },
};

// ────────────────────────────────────────────────────────────
// Admin shell — reusable chrome with left nav rail + page area
// ────────────────────────────────────────────────────────────
function AdminShell({ active = 'customers', onNav = () => {}, children, width = 1180, height = 740 }) {
  const t = C_TOKENS;
  return (
    <div style={{
      width, height, borderRadius: t.radiusLg, overflow: 'hidden',
      background: t.bgWash, border: `1px solid ${t.borderStrong}`,
      boxShadow: '0 24px 64px -12px rgba(0,0,0,0.5)',
      display: 'flex', flexDirection: 'column',
      fontFamily: t.font, color: t.text,
    }}>
      {/* Window chrome */}
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
        <span style={{ fontSize: 12, fontWeight: 600, color: t.textDim }}>Liquidation OS</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: t.textFaint, fontFamily: '"JetBrains Mono", monospace' }}>admin@liquidationos.test</span>
      </div>

      {/* Body — rail + content */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <NavRail active={active} onNav={onNav} />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

const NAV_ITEMS = [
  { id: 'inventory', label: 'Inventory',  icon: 'M3 4h10v3H3zM3 9h10v3H3z' },
  { id: 'customers', label: 'Customers',  icon: 'M5 6a3 3 0 1 1 6 0a3 3 0 0 1-6 0M2 14a6 6 0 0 1 12 0' },
  { id: 'users',     label: 'Users',      icon: 'M5 6a3 3 0 1 1 6 0a3 3 0 0 1-6 0M2 14a6 6 0 0 1 12 0' },
  { id: 'settings',  label: 'Settings',   icon: 'M8 5l1.4 1.4M8 5v2M8 11v2M3 8h2M11 8h2M5 11l-1.4 1.4M11 5l1.4-1.4M5 5L3.6 3.6' },
  { id: 'audit',     label: 'Audit',      icon: 'M3 3h10v10H3zM3 7h10M6 11h4' },
];

function NavRail({ active, onNav }) {
  const t = C_TOKENS;
  return (
    <nav style={{
      width: 200, padding: '14px 10px', borderRight: `1px solid ${t.border}`,
      background: t.surfaceAlt, display: 'flex', flexDirection: 'column', gap: 2,
    }}>
      <div style={{ padding: '4px 10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 26, height: 26, borderRadius: 6, background: 'var(--c-accent)',
          color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700, fontSize: 12,
        }}>L</div>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.2 }}>Liquidation<span style={{ color: t.textDim, fontWeight: 500 }}> OS</span></div>
      </div>
      {NAV_ITEMS.map(item => (
        <button key={item.id} onClick={() => onNav(item.id)} style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
          border: 'none', background: active === item.id ? 'var(--c-accent)' : 'transparent',
          color: active === item.id ? '#fff' : t.textDim,
          borderRadius: t.radius, cursor: 'pointer', fontFamily: 'inherit',
          fontSize: 13, fontWeight: active === item.id ? 600 : 500, textAlign: 'left',
          transition: 'background 120ms',
        }}
        onMouseEnter={(e) => { if (active !== item.id) e.currentTarget.style.background = 'rgba(15,23,42,0.04)'; }}
        onMouseLeave={(e) => { if (active !== item.id) e.currentTarget.style.background = 'transparent'; }}>
          <Icon d={item.icon} size={14} stroke={1.8} />
          {item.label}
        </button>
      ))}
      <div style={{ flex: 1 }} />
      <div style={{
        padding: '10px 10px 4px', display: 'flex', alignItems: 'center', gap: 8,
        borderTop: `1px solid ${t.border}`, marginTop: 8,
      }}>
        <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#1E40AF', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>AM</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Avery Mitchell</div>
          <div style={{ fontSize: 10, color: t.textDim }}>Admin</div>
        </div>
      </div>
    </nav>
  );
}

function PageHeader({ title, sub, right }) {
  const t = C_TOKENS;
  return (
    <div style={{
      padding: '18px 24px 14px', borderBottom: `1px solid ${t.border}`,
      display: 'flex', alignItems: 'center', gap: 12, background: t.surface,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.3 }}>{title}</div>
        {sub && <div style={{ fontSize: 12, color: t.textDim, marginTop: 2 }}>{sub}</div>}
      </div>
      {right}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Customers page (list + detail panel)
// ────────────────────────────────────────────────────────────
function CustomersPage({ activeCustId = 'smith' }) {
  const t = C_TOKENS;
  const cust = CUSTOMERS.find(c => c.id === activeCustId);
  const jobs = JOBS_BY_CUSTOMER[activeCustId] || [];

  return (
    <>
      <PageHeader
        title="Customers"
        sub={`${CUSTOMERS.length} consignors · click to manage their jobs`}
        right={
          <>
            <SearchBox placeholder="Search customers…" />
            <button style={btnAdmin(t, 'primary')}>
              <Icon d={ICONS.plus} size={12} stroke={2.4} /> New customer
            </button>
          </>
        }
      />
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* List */}
        <div style={{ flex: '0 0 360px', borderRight: `1px solid ${t.border}`, overflowY: 'auto', background: t.surfaceSolid }}>
          {CUSTOMERS.map(c => {
            const isActive = c.id === activeCustId;
            return (
              <div key={c.id} style={{
                padding: '12px 18px', cursor: 'pointer',
                background: isActive ? 'rgba(30,64,175,0.08)' : 'transparent',
                borderLeft: isActive ? `3px solid var(--c-accent)` : `3px solid transparent`,
                borderBottom: `1px solid ${t.border}`,
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <div style={{
                  width: 34, height: 34, borderRadius: t.radius,
                  background: `hsl(${(c.id.charCodeAt(0) * 47) % 360} 55% 92%)`,
                  color: `hsl(${(c.id.charCodeAt(0) * 47) % 360} 50% 35%)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700, flexShrink: 0,
                }}>{c.name.split(' ').map(w => w[0]).slice(0, 2).join('')}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: t.textDim, marginTop: 2 }}>
                    {c.jobs} jobs · {c.lots} lots {c.recent && <span style={{ marginLeft: 4, color: 'var(--c-accent)', fontWeight: 600 }}>· recent</span>}
                  </div>
                </div>
                <Icon d="M5 3l5 5l-5 5" size={11} stroke={2} />
              </div>
            );
          })}
        </div>

        {/* Detail panel — Customer info + jobs list */}
        <div style={{ flex: 1, padding: 22, overflowY: 'auto' }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <div style={{
              width: 56, height: 56, borderRadius: t.radius,
              background: `hsl(${(cust.id.charCodeAt(0) * 47) % 360} 55% 90%)`,
              color: `hsl(${(cust.id.charCodeAt(0) * 47) % 360} 50% 30%)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, fontWeight: 700,
            }}>{cust.name.split(' ').map(w => w[0]).slice(0, 2).join('')}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.4 }}>{cust.name}</div>
              <div style={{ fontSize: 12, color: t.textDim, marginTop: 4 }}>
                {cust.jobs} jobs · {cust.lots} lots cataloged · added 2024-09-12
              </div>
            </div>
            <button style={btnAdmin(t, 'subtle')}><Icon d={ICONS.edit} size={12} /> Edit</button>
            <button style={{ ...btnAdmin(t, 'subtle'), color: t.danger, borderColor: 'rgba(185,28,28,0.25)' }}>
              <Icon d={ICONS.trash} size={12} /> Delete
            </button>
          </div>

          {/* Jobs section */}
          <div style={{ marginTop: 22, display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <div style={{ fontSize: 11, color: t.textDim, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' }}>Jobs</div>
            <div style={{ flex: 1 }} />
            <button style={btnAdmin(t, 'primary')}>
              <Icon d={ICONS.plus} size={12} stroke={2.4} /> New job
            </button>
          </div>
          <div style={{
            marginTop: 10, background: t.surfaceSolid, borderRadius: t.radius,
            border: `1px solid ${t.border}`, overflow: 'hidden',
          }}>
            <div style={{
              display: 'grid', gridTemplateColumns: '2fr 1fr 110px 90px 120px',
              padding: '10px 14px', fontSize: 10, color: t.textDim, fontWeight: 600,
              letterSpacing: 0.4, textTransform: 'uppercase', gap: 10, alignItems: 'center',
              borderBottom: `1px solid ${t.border}`, background: t.surfaceAlt,
            }}>
              <div>Job number</div>
              <div>Created</div>
              <div>Lots</div>
              <div>Status</div>
              <div></div>
            </div>
            {jobs.map(j => (
              <div key={j.id} style={{
                display: 'grid', gridTemplateColumns: '2fr 1fr 110px 90px 120px',
                padding: '12px 14px', alignItems: 'center', gap: 10,
                borderBottom: `1px solid ${t.border}`,
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, fontFamily: '"JetBrains Mono", monospace', letterSpacing: -0.2 }}>{j.id}</div>
                <div style={{ fontSize: 12, color: t.textDim, fontFamily: '"JetBrains Mono", monospace' }}>{j.date}</div>
                <div style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', color: t.text }}>{j.lots}</div>
                <div>
                  <span style={{
                    fontSize: 10, padding: '2px 8px', borderRadius: 8, fontWeight: 600,
                    background: j.status === 'open' ? '#DCFCE7' : '#F1F5F9',
                    color: j.status === 'open' ? '#15803D' : t.textDim,
                  }}>{j.status}</span>
                </div>
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <button style={btnAdmin(t, 'tinyLink')}>View lots ›</button>
                  <button style={btnAdmin(t, 'tinyLink')}>···</button>
                </div>
              </div>
            ))}
            {jobs.length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: t.textFaint }}>
                No jobs yet · create the first auction job for {cust.name}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ────────────────────────────────────────────────────────────
// Users page
// ────────────────────────────────────────────────────────────
function UsersPage() {
  const t = C_TOKENS;
  return (
    <>
      <PageHeader
        title="Users"
        sub={`${ADMIN_USERS.filter(u => u.status === 'active').length} active · ${ADMIN_USERS.filter(u => u.status === 'pending').length} pending invitations`}
        right={
          <>
            <SearchBox placeholder="Search users…" />
            <FakeChip label="Role" />
            <FakeChip label="Status" />
            <button style={btnAdmin(t, 'primary')}>
              <Icon d={ICONS.plus} size={12} stroke={2.4} /> Invite user
            </button>
          </>
        }
      />
      <div style={{ flex: 1, overflowY: 'auto', background: t.surfaceSolid }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '2fr 2fr 110px 100px 1.4fr 30px',
          padding: '10px 24px', fontSize: 10, color: t.textDim, fontWeight: 600,
          letterSpacing: 0.4, textTransform: 'uppercase', gap: 14,
          borderBottom: `1px solid ${t.border}`, background: t.surfaceAlt,
        }}>
          <div>Name</div>
          <div>Email</div>
          <div>Role</div>
          <div>Status</div>
          <div>Last sign-in</div>
          <div></div>
        </div>
        {ADMIN_USERS.map(u => (
          <div key={u.id} style={{
            display: 'grid', gridTemplateColumns: '2fr 2fr 110px 100px 1.4fr 30px',
            padding: '12px 24px', gap: 14, alignItems: 'center',
            borderBottom: `1px solid ${t.border}`,
            opacity: u.status === 'inactive' ? 0.6 : 1,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 30, height: 30, borderRadius: '50%',
                background: u.avatar, color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700, flexShrink: 0,
              }}>{u.name.split(' ').map(w => w[0]).slice(0, 2).join('')}</div>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{u.name}</span>
            </div>
            <div style={{ fontSize: 12, color: t.textDim, fontFamily: '"JetBrains Mono", monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</div>
            <div>
              <span style={{
                fontSize: 11, padding: '3px 9px', borderRadius: 10, fontWeight: 600,
                background: ROLE_BG[u.role], color: ROLE_FG[u.role],
              }}>{ROLE_LABEL[u.role]}</span>
            </div>
            <div>
              <span style={{
                fontSize: 11, padding: '3px 9px', borderRadius: 10, fontWeight: 600,
                background: STATUS_BG[u.status], color: STATUS_FG[u.status],
                display: 'inline-flex', alignItems: 'center', gap: 5,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_FG[u.status] }} />
                {u.status}
              </span>
            </div>
            <div style={{ fontSize: 12, color: t.textDim, fontFamily: '"JetBrains Mono", monospace' }}>
              {u.lastSignIn || <span style={{ color: t.textFaint }}>never</span>}
            </div>
            <div style={{ color: t.textFaint, fontSize: 16, textAlign: 'right', cursor: 'pointer' }}>···</div>
          </div>
        ))}
      </div>
    </>
  );
}

// ────────────────────────────────────────────────────────────
// Settings page
// ────────────────────────────────────────────────────────────
function SettingsPage() {
  const t = C_TOKENS;
  const [aiEnabled, setAiEnabled] = React.useState(true);
  const [frequency, setFrequency] = React.useState('daily');
  const [time, setTime] = React.useState('02:00');
  const [printerUrl, setPrinterUrl] = React.useState('http://127.0.0.1:9100');
  const [printerStatus, setPrinterStatus] = React.useState('connected');

  return (
    <>
      <PageHeader title="Settings" sub="Printer configuration · AI scheduling · organization details" />
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 40px', display: 'flex', flexDirection: 'column', gap: 18 }}>

        {/* Printer */}
        <SettingsCard title="Label printer" sub="Browser Print helper that sends 4×2 labels to the Zebra ZD450">
          <SettingRow label="Helper URL">
            <input value={printerUrl} onChange={(e) => setPrinterUrl(e.target.value)} style={inputStyleAdmin(t, 360)} />
            <button style={btnAdmin(t, 'subtle')} onClick={() => setPrinterStatus(printerStatus === 'connected' ? 'unreachable' : 'connected')}>Test</button>
            <ConnStatus status={printerStatus} />
          </SettingRow>
          <SettingRow label="Printer model">
            <input value="Zebra ZD450" disabled style={inputStyleAdmin(t, 240)} />
          </SettingRow>
          <SettingRow label="Label size">
            <select style={inputStyleAdmin(t, 240)}>
              <option>4" × 2" (default)</option>
              <option>3" × 1"</option>
              <option>4" × 6"</option>
            </select>
          </SettingRow>
        </SettingsCard>

        {/* AI Schedule */}
        <SettingsCard title="AI schedule" sub="When the system should automatically run AI on lots needing title, description or price">
          <SettingRow label="Enabled">
            <Toggle value={aiEnabled} onChange={setAiEnabled} />
            <span style={{ fontSize: 12, color: t.textDim }}>{aiEnabled ? 'AI runs on schedule' : 'Manual only'}</span>
          </SettingRow>
          <SettingRow label="Frequency">
            <Segmented
              value={frequency}
              onChange={setFrequency}
              options={[{ value: 'hourly', label: 'Hourly' }, { value: 'daily', label: 'Daily' }]}
              disabled={!aiEnabled}
            />
          </SettingRow>
          {frequency === 'daily' && (
            <SettingRow label="Time of day">
              <input
                type="time" value={time} onChange={(e) => setTime(e.target.value)}
                disabled={!aiEnabled}
                style={{ ...inputStyleAdmin(t, 140), opacity: aiEnabled ? 1 : 0.5 }}
              />
              <span style={{ fontSize: 11, color: t.textDim }}>Server time · UTC-05:00</span>
            </SettingRow>
          )}
          <SettingRow label="Last run">
            <span style={{ fontSize: 12, color: t.textDim, fontFamily: '"JetBrains Mono", monospace' }}>2026-04-29 02:00 · 127 lots · 120 ok / 4 partial / 3 failed</span>
            <button style={btnAdmin(t, 'subtle')}>View runs</button>
          </SettingRow>
        </SettingsCard>

        {/* Organization */}
        <SettingsCard title="Organization" sub="Branding shown on labels, headers, and email">
          <SettingRow label="Org name">
            <input defaultValue="Liquidation OS · Demo" style={inputStyleAdmin(t, 360)} />
          </SettingRow>
          <SettingRow label="Timezone">
            <select style={inputStyleAdmin(t, 240)}>
              <option>America/New_York (UTC-05:00)</option>
              <option>America/Chicago (UTC-06:00)</option>
              <option>America/Denver (UTC-07:00)</option>
              <option>America/Los_Angeles (UTC-08:00)</option>
            </select>
          </SettingRow>
          <SettingRow label="Logo">
            <div style={{
              width: 64, height: 64, borderRadius: t.radius,
              background: 'var(--c-accent)', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22, fontWeight: 700,
            }}>L</div>
            <button style={btnAdmin(t, 'subtle')}>Upload…</button>
          </SettingRow>
        </SettingsCard>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
          <button style={btnAdmin(t, 'subtle')}>Discard</button>
          <button style={btnAdmin(t, 'primary')}>Save changes</button>
        </div>
      </div>
    </>
  );
}

function SettingsCard({ title, sub, children }) {
  const t = C_TOKENS;
  return (
    <div style={{
      background: t.surfaceSolid, border: `1px solid ${t.border}`, borderRadius: t.radiusLg,
      overflow: 'hidden',
    }}>
      <div style={{ padding: '14px 18px', borderBottom: `1px solid ${t.border}`, background: t.surfaceAlt }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>
        {sub && <div style={{ fontSize: 12, color: t.textDim, marginTop: 2 }}>{sub}</div>}
      </div>
      <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>
    </div>
  );
}

function SettingRow({ label, children }) {
  const t = C_TOKENS;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 32 }}>
      <div style={{ flex: '0 0 130px', fontSize: 12, color: t.textDim, fontWeight: 600 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>{children}</div>
    </div>
  );
}

function ConnStatus({ status }) {
  const t = C_TOKENS;
  const map = {
    connected:   { bg: '#DCFCE7', fg: '#15803D', label: 'Connected' },
    unreachable: { bg: '#FEE2E2', fg: '#B91C1C', label: 'Unreachable' },
    pending:     { bg: '#FEF3C7', fg: '#92400E', label: 'Pending' },
  };
  const s = map[status] || map.pending;
  return (
    <span style={{
      fontSize: 11, padding: '3px 9px', borderRadius: 10,
      background: s.bg, color: s.fg, fontWeight: 600,
      display: 'inline-flex', alignItems: 'center', gap: 5,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.fg }} />
      {s.label}
    </span>
  );
}

function Toggle({ value, onChange }) {
  return (
    <button onClick={() => onChange(!value)} style={{
      width: 38, height: 22, borderRadius: 12, border: 'none',
      background: value ? 'var(--c-accent)' : '#CBD5E1',
      position: 'relative', cursor: 'pointer', transition: 'background 150ms',
      padding: 0,
    }}>
      <span style={{
        position: 'absolute', top: 2, left: value ? 18 : 2,
        width: 18, height: 18, borderRadius: '50%', background: '#fff',
        boxShadow: '0 1px 4px rgba(0,0,0,0.2)', transition: 'left 150ms',
      }} />
    </button>
  );
}

function Segmented({ value, onChange, options, disabled }) {
  const t = C_TOKENS;
  return (
    <div style={{
      display: 'inline-flex', padding: 2,
      background: t.surfaceAlt, border: `1px solid ${t.border}`, borderRadius: t.radius,
      opacity: disabled ? 0.5 : 1,
    }}>
      {options.map(o => (
        <button key={o.value} onClick={() => !disabled && onChange(o.value)} style={{
          padding: '5px 14px', border: 'none',
          background: value === o.value ? t.surfaceSolid : 'transparent',
          boxShadow: value === o.value ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
          color: value === o.value ? t.text : t.textDim,
          fontSize: 12, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit', borderRadius: t.radius - 1,
        }}>{o.label}</button>
      ))}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Audit page (admin-only reporting view)
// ────────────────────────────────────────────────────────────
function AuditPage() {
  const t = C_TOKENS;
  return (
    <>
      <PageHeader
        title="Audit"
        sub={`${AUDIT_ENTRIES.length} events shown · admin-only`}
        right={
          <>
            <SearchBox placeholder="Search target, actor…" />
            <FakeChip label="Action" />
            <FakeChip label="Actor" />
            <FakeChip label="Date" />
            <button style={btnAdmin(t, 'subtle')}>
              <Icon d="M8 2v9m0 0l-3-3m3 3l3-3M2 13h12" size={12} stroke={2} /> Export CSV
            </button>
          </>
        }
      />
      <div style={{ flex: 1, overflowY: 'auto', background: t.surfaceSolid }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '160px 150px 130px 1fr 1.2fr',
          padding: '10px 24px', fontSize: 10, color: t.textDim, fontWeight: 600,
          letterSpacing: 0.4, textTransform: 'uppercase', gap: 14,
          borderBottom: `1px solid ${t.border}`, background: t.surfaceAlt,
        }}>
          <div>When</div>
          <div>Actor</div>
          <div>Action</div>
          <div>Target</div>
          <div>Detail</div>
        </div>
        {AUDIT_ENTRIES.map(e => {
          const ac = ACTION_COLORS[e.action] || { bg: t.surfaceAlt, fg: t.textDim };
          const isAi = e.actor.startsWith('AI');
          return (
            <div key={e.id} style={{
              display: 'grid', gridTemplateColumns: '160px 150px 130px 1fr 1.2fr',
              padding: '11px 24px', gap: 14, alignItems: 'center',
              borderBottom: `1px solid ${t.border}`, fontSize: 12,
            }}>
              <div style={{ color: t.textDim, fontFamily: '"JetBrains Mono", monospace' }}>{e.ts}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <div style={{
                  width: 22, height: 22, borderRadius: '50%',
                  background: isAi ? '#FEF3C7' : 'rgba(30,64,175,0.12)',
                  color: isAi ? '#92400E' : '#1E40AF',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 700, flexShrink: 0,
                }}>{isAi ? '✦' : e.actor.split(' ').map(w => w[0]).slice(0, 2).join('')}</div>
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.actor}</span>
              </div>
              <div>
                <span style={{
                  fontSize: 11, padding: '2px 8px', borderRadius: 8,
                  background: ac.bg, color: ac.fg, fontWeight: 600,
                  fontFamily: '"JetBrains Mono", monospace',
                }}>{e.action}</span>
              </div>
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: t.text }}>{e.target}</div>
              <div style={{ color: t.textDim, display: 'flex', alignItems: 'center', gap: 6 }}>
                {e.from !== '—' && (
                  <>
                    <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11 }}>{e.from}</span>
                    <span style={{ color: t.textFaint }}>→</span>
                    <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, fontWeight: 600, color: t.text }}>{e.to}</span>
                  </>
                )}
                {e.note && (
                  <span style={{ marginLeft: e.from !== '—' ? 8 : 0, fontStyle: 'italic', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.note}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ────────────────────────────────────────────────────────────
// Shared atoms
// ────────────────────────────────────────────────────────────
function SearchBox({ placeholder }) {
  const t = C_TOKENS;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px',
      background: t.surfaceSolid, border: `1px solid ${t.borderStrong}`,
      borderRadius: t.radius, minWidth: 220,
    }}>
      <Icon d={ICONS.search} size={12} />
      <span style={{ fontSize: 12, color: t.textFaint }}>{placeholder}</span>
    </div>
  );
}

function inputStyleAdmin(t, width) {
  return {
    height: 32, padding: '0 10px', width, maxWidth: '100%',
    border: `1px solid ${t.borderStrong}`, borderRadius: t.radius,
    background: t.surfaceSolid, fontFamily: 'inherit', fontSize: 13, color: t.text,
    outline: 'none', boxSizing: 'border-box',
  };
}

function btnAdmin(t, kind) {
  const base = {
    fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
    boxSizing: 'border-box', whiteSpace: 'nowrap',
  };
  if (kind === 'primary') return { ...base, height: 32, padding: '0 14px', borderRadius: t.radius, border: 'none', background: 'var(--c-accent)', color: '#fff' };
  if (kind === 'subtle')  return { ...base, height: 32, padding: '0 12px', borderRadius: t.radius, border: `1px solid ${t.borderStrong}`, background: t.surfaceSolid, color: t.text };
  if (kind === 'tinyLink') return { ...base, height: 24, padding: '0 8px', borderRadius: 4, border: 'none', background: 'transparent', color: 'var(--c-accent)', fontSize: 11 };
  return base;
}

Object.assign(window, {
  AdminShell, NAV_ITEMS,
  CustomersPage, UsersPage, SettingsPage, AuditPage,
  ADMIN_USERS, AUDIT_ENTRIES,
});
