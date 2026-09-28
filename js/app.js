/* ─────────────────────────────────────────────
   Seed - API Console — Front-end logic
   Matches Console.js endpoints exactly.
───────────────────────────────────────────── */

const API_BASE = 'https://api.seed.soy';

// ── State ──────────────────────────────────────
const state = {
  user: null,
  keys: [],
  activeKeyId: null,
  activeKey: null,
  quotaTimes: [],
  requestableScopes: [],
  scopeNameMap: {}, // scope id → display name
  allScopes: [],
  lastUsageData: null,
};

// ── Helpers ─────────────────────────────────────
async function api(path) {
  const r = await fetch(API_BASE + path, { credentials: 'include' });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${r.status}`);
  }
  return r.json();
}

function qs(params) {
  return '?' + new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([,v]) => v !== undefined && v !== null && v !== ''))).toString();
}

function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast' + (type ? ' ' + type : '');
  el.classList.remove('hidden');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add('hidden'), 3000);
}

function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
}
function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

function formatStatus(status) {
  if (!status) return '';
  const map = {
    API_KEY_STATUS_ACTIVE: 'active',
    API_KEY_STATUS_USER_DISABLED: 'disabled',
    API_KEY_STATUS_ADMIN_DISABLED: 'admin-disabled',
  };
  return map[status] || status;
}

function statusLabel(status) {
  const map = {
    API_KEY_STATUS_ACTIVE: 'Active',
    API_KEY_STATUS_USER_DISABLED: 'Disabled',
    API_KEY_STATUS_ADMIN_DISABLED: 'Admin Disabled',
  };
  return map[status] || status;
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Navigation ───────────────────────────────────
function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  const target = document.getElementById('page-' + pageId);
  if (target) target.classList.remove('hidden');

  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const navEl = document.getElementById('nav-' + pageId);
  if (navEl) navEl.classList.add('active');
}

// ── Auth ────────────────────────────────────────
const OAUTH_URL = `https://accounts.google.com/o/oauth2/v2/auth?` + new URLSearchParams({
  client_id: '152719550786-1h8m12dta2lobjidps4v17gnounftfti.apps.googleusercontent.com',
  redirect_uri: 'https://api.seed.soy/console/auth/callback',
  response_type: 'code',
  scope: 'https://www.googleapis.com/auth/youtube.readonly',
  access_type: 'offline',
  prompt: 'select_account',
});

async function init() {
  try {
    const data = await api('/console/auth/me');
    if (data.authenticated) {
      state.user = data.user;
      onLoggedIn();
    } else {
      showLoginScreen();
    }
  } catch {
    showLoginScreen();
  }
}

function showLoginScreen() {
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
  document.getElementById('login-btn').href = OAUTH_URL;
}

function onLoggedIn() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');

  // Show admin nav
  if (state.user.role === 'admin') {
    document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
    loadAdminBadge();
  }

  loadChannelInfo(state.user.channelId);
  loadMetadata();
  loadKeys();
  showPage('keys');
}

async function loadChannelInfo(channelId) {
  const avatarEl = document.getElementById('user-avatar');
  const handleEl = document.getElementById('user-channel-id');
  const topBarEl = document.getElementById('top-bar-channel');

  // Show channel ID while we wait
  handleEl.textContent = channelId || '…';
  if (topBarEl) topBarEl.textContent = channelId || '…';

  try {
    const r = await fetch(`${API_BASE}/console/channel-info`, { credentials: 'include' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const info = await r.json();

    console.log('[channel-info]', info); // inspect field names in DevTools

    const data = Array.isArray(info) ? info[0] : info;

    // Handle common field name variants
    const handle = data?.channelHandle || data?.channel_handle || data?.handle || data?.name || channelId;
    const picture = data?.profilePicture || data?.profile_picture || data?.avatar || data?.thumbnailUrl || data?.thumbnail || null;

    handleEl.textContent = handle.length > 20 ? handle.slice(0, 20) + '…' : handle;
    if (topBarEl) topBarEl.textContent = handle;

    if (picture) {
      avatarEl.innerHTML = `<img src="${escHtml(picture)}" alt="${escHtml(handle)}" style="width:100%;height:100%;object-fit:cover;display:block;" />`;
      avatarEl.style.background = 'none';
    } else {
      avatarEl.textContent = channelId.slice(2, 4).toUpperCase() || '?';
    }
  } catch (e) {
    console.warn('[channel-info] failed:', e.message);
    avatarEl.textContent = channelId.slice(2, 4).toUpperCase() || '?';
  }
}

async function loadMetadata() {
  try {
    const times = await api('/console/meta/quota-times');
    state.quotaTimes = times.map(r => r.quota_reset_time);
  } catch {}

  try {
    const scopes = await api('/console/meta/requestable-scopes');
    state.requestableScopes = scopes;
    // Build lookup: scope id → human name
    state.scopeNameMap = {};
    scopes.forEach(s => { if (s.name) state.scopeNameMap[s.scope] = s.name; });
  } catch {}

  if (state.user?.role === 'admin') {
    try {
      const all = await api('/console/meta/scopes');
      state.allScopes = all.map(r => r.scope);
    } catch {}
  }
}

async function loadAdminBadge() {
  try {
    const reqs = await api('/console/admin/requests');
    const badge = document.getElementById('badge-requests');
    if (reqs.length > 0) {
      badge.textContent = reqs.length;
      badge.style.display = 'inline';
    } else {
      badge.style.display = 'none';
    }
  } catch {}
}

// ── Keys page ────────────────────────────────────
async function loadKeys() {
  const list = document.getElementById('keys-list');
  list.innerHTML = '<div class="skeleton-list"><div class="skeleton"></div><div class="skeleton"></div></div>';
  try {
    const keys = await api('/console/keys');
    state.keys = keys;
    renderKeys(keys, list);
    // Also populate stats dropdown
    populateStatsDropdown();
  } catch (e) {
    list.innerHTML = `<p class="empty-state">${e.message}</p>`;
  }
}

function renderKeys(keys, container) {
  if (!keys.length) {
    container.innerHTML = '<p class="empty-state">No API keys yet. Create one to get started.</p>';
    return;
  }
  container.innerHTML = keys.map(k => {
    const cls = formatStatus(k.status);
    return `<div class="key-card" data-key-id="${k.key_id}">
      <div class="key-card-icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
      </div>
      <div class="key-card-body">
        <div class="key-card-name">${escHtml(k.label || '(unnamed)')}</div>
        <div class="key-card-meta">Created ${fmtDate(k.created_at)}</div>
      </div>
      <div class="key-card-status status-${cls}">
        <span class="status-dot"></span>${statusLabel(k.status)}
      </div>
    </div>`;
  }).join('');

  container.querySelectorAll('.key-card').forEach(card => {
    card.addEventListener('click', () => openKeyDetail(card.dataset.keyId));
  });
}

async function populateStatsDropdown() {
  const sel = document.getElementById('stats-key-select');
  const prev = sel.value;
  let keysToDisplay = state.keys || [];

  if (state.user?.role === 'admin') {
    try {
      const allKeys = await api('/console/admin/keys-list');
      state.allAdminKeys = allKeys;
      keysToDisplay = allKeys;
    } catch {}
  }

  sel.innerHTML = '<option value="">-- Choose a key --</option>' + keysToDisplay.map(k => {
    const owner = (state.user?.role === 'admin' && k.owner_channel_id) ? ` (${k.owner_channel_id})` : '';
    const label = (k.label || k.key_id) + owner;
    return `<option value="${k.key_id}">${escHtml(label)}</option>`;
  }).join('');
  if (prev && Array.from(sel.options).some(o => o.value === prev)) sel.value = prev;
}

// ── Key detail ───────────────────────────────────
async function openKeyDetail(keyId) {
  const key = state.keys.find(k => k.key_id == keyId);
  if (!key) return;
  state.activeKeyId = keyId;
  state.activeKey = key;

  document.getElementById('detail-key-name').textContent = key.label || '(unnamed)';
  document.getElementById('detail-key-value').textContent = key.key || 'sk-••••••••••••••••';
  updateToggleBtn(key.status);

  const isAdminDisabled = key.status === 'API_KEY_STATUS_ADMIN_DISABLED';
  document.getElementById('rename-key-btn').style.display = isAdminDisabled ? 'none' : '';
  document.getElementById('request-scope-btn').style.display = isAdminDisabled ? 'none' : '';

  showPage('key-detail');
  loadKeyScopes(keyId);
  loadKeyUsageChart(keyId, 'detail-usage-chart', 24, 'detail-scope-select');
}

function updateToggleBtn(status) {
  const btn = document.getElementById('toggle-key-btn');
  btn.disabled = false;
  if (status === 'API_KEY_STATUS_ACTIVE') {
    btn.textContent = 'Disable';
    btn.dataset.action = 'disable';
  } else if (status === 'API_KEY_STATUS_USER_DISABLED') {
    btn.textContent = 'Enable';
    btn.dataset.action = 'enable';
  } else {
    btn.textContent = statusLabel(status);
    btn.disabled = true;
  }
}

async function loadKeyScopes(keyId) {
  const el = document.getElementById('detail-scopes-list');
  el.innerHTML = '<p class="empty-state">Loading…</p>';
  try {
    const scopes = await api('/console/keys/scopes' + qs({ key_id: keyId }));
    if (!scopes.length) {
      el.innerHTML = '<p class="empty-state">No scopes assigned. Request access to get started.</p>';
      return;
    }
    el.innerHTML = scopes.map(s => {
      const pill = s.approved ? '<span class="pill pill-approved">Approved</span>'
                  : s.pending ? '<span class="pill pill-pending">Pending</span>'
                  : '<span class="pill pill-denied">Denied</span>';
      const displayName = state.scopeNameMap[s.scope] || s.scope;
      const quota = s.approved ? `<span style="font-size:11px;color:var(--text-muted)">${s.quota} / ${formatResetTime(s.quota_reset_time)}</span>` : '';
      return `<div class="scope-row">
        <div>
          <div class="scope-name">${escHtml(displayName)}</div>
          <div class="scope-meta">${escHtml(s.scope)}&nbsp;${quota}</div>
        </div>
        <div class="scope-pills">${pill}</div>
      </div>`;
    }).join('');
  } catch (e) {
    el.innerHTML = `<p class="empty-state">${e.message}</p>`;
  }
}

async function loadKeyUsageChart(keyId, containerId, hours, scopeSelectId) {
  const el = document.getElementById(containerId);
  el.innerHTML = '<p class="empty-state" style="font-size:12px">Loading…</p>';
  try {
    const data = await api('/console/keys/usage-timeseries' + qs({ key_id: keyId, hours }));
    state.lastUsageData = data;

    if (scopeSelectId) {
      const scopeSel = document.getElementById(scopeSelectId);
      const prevVal = scopeSel.value;
      const uniqueScopes = Array.from(new Set(data.map(d => d.scope).filter(Boolean)));

      scopeSel.innerHTML = '<option value="">All Scopes</option>' + uniqueScopes.map(s => {
        const displayName = state.scopeNameMap[s] || s;
        return `<option value="${escHtml(s)}">${escHtml(displayName)}</option>`;
      }).join('');

      if (uniqueScopes.includes(prevVal)) {
        scopeSel.value = prevVal;
      } else {
        scopeSel.value = '';
      }
    }

    const activeScope = scopeSelectId ? document.getElementById(scopeSelectId).value : '';
    const filteredData = activeScope ? data.filter(d => d.scope === activeScope) : data;
    renderBarChart(el, filteredData, hours);
  } catch (err) {
    el.innerHTML = '<p class="empty-state" style="font-size:12px">No usage data.</p>';
  }
}

function filterAndRenderChart(containerId, hours, scopeSelectId) {
  const el = document.getElementById(containerId);
  const activeScope = document.getElementById(scopeSelectId).value;
  const filteredData = activeScope ? state.lastUsageData.filter(d => d.scope === activeScope) : state.lastUsageData;
  renderBarChart(el, filteredData, hours);
}

function renderBarChart(container, data, hours) {
  if (!data.length) {
    container.innerHTML = '<p class="empty-state" style="font-size:12px;align-self:center;width:100%">No data for this period.</p>';
    return;
  }

  // Bucket by hour, aligned to start of current hour
  const now = Date.now();
  const alignedNow = new Date(now);
  alignedNow.setMinutes(0, 0, 0);
  const alignedNowMs = alignedNow.getTime();

  const buckets = [];
  for (let i = hours - 1; i >= 0; i--) {
    buckets.push({ t: alignedNowMs - i * 3600000, total: 0, label: '' });
  }
  // simple label every N buckets
  const step = hours <= 24 ? 6 : hours <= 72 ? 12 : 24;
  buckets.forEach((b, i) => {
    const d = new Date(b.t);
    b.label = (i % step === 0) ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  });

  data.forEach(row => {
    const t = new Date(row.time).getTime();
    const d = new Date(t);
    d.setMinutes(0, 0, 0);
    const eventHourMs = d.getTime();
    const bucket = buckets.find(b => b.t === eventHourMs);
    if (bucket) {
      bucket.total += row.amount || 0;
    }
  });

  const maxVal = Math.max(...buckets.map(b => b.total), 1);
  const midVal = Math.round(maxVal / 2);

  const isLarge = container.classList.contains('large');
  const chartHeight = isLarge ? 300 : 160;

  const yAxisHtml = `
    <div class="chart-y-axis" style="height:${chartHeight}px">
      <div>${maxVal.toLocaleString()}</div>
      <div>${midVal.toLocaleString()}</div>
      <div>0</div>
    </div>
  `;

  container.innerHTML = yAxisHtml + buckets.map(b => {
    const h = Math.max(2, Math.round((b.total / maxVal) * chartHeight));
    return `<div class="chart-bar-group" title="${b.total} calls">
      <div class="chart-bar" style="height:${h}px"></div>
      <div class="chart-label">${b.label}</div>
    </div>`;
  }).join('');
}

// ── Stats page ───────────────────────────────────
function setupStatsPage() {
  const keySel = document.getElementById('stats-key-select');
  const hrsSel = document.getElementById('stats-hours-select');

  function reload() {
    const keyId = keySel.value;
    const hours = parseInt(hrsSel.value);
    if (!keyId) {
      document.getElementById('stats-chart').innerHTML = '<p class="empty-state" style="font-size:12px;align-self:center;width:100%">Choose a key above.</p>';
      return;
    }
    loadKeyUsageChart(keyId, 'stats-chart', hours, 'stats-scope-select');
  }

  keySel.addEventListener('change', reload);
  hrsSel.addEventListener('change', reload);
}

// ── Admin: Pending requests ──────────────────────
async function loadAdminRequests() {
  const list = document.getElementById('requests-list');
  list.innerHTML = '<div class="skeleton-list"><div class="skeleton"></div><div class="skeleton"></div></div>';
  try {
    const reqs = await api('/console/admin/requests');
    if (!reqs.length) {
      list.innerHTML = '<p class="empty-state">No pending requests.</p>';
      return;
    }
    list.innerHTML = reqs.map(r => `
      <div class="request-card">
        <div class="request-card-info">
          <div class="request-card-title">${escHtml(r.scope)} — <span style="font-weight:400">${escHtml(r.label || r.key_id)}</span></div>
          <div class="request-card-meta">${escHtml(r.owner_channel_id)} · ${r.quota} / ${r.quota_reset_time?.replace('QUOTA_RESET_TIME_','').toLowerCase()}</div>
          ${r.request_reason ? `<div class="request-card-reason">"${escHtml(r.request_reason)}"</div>` : ''}
        </div>
        <div class="request-card-actions">
          <button class="btn btn-sm" style="color:var(--green);border-color:var(--green)" data-approve="${r.key_id}" data-scope="${r.scope}" data-quota="${r.quota}" data-time="${r.quota_reset_time}">Approve</button>
          <button class="btn btn-ghost btn-sm" data-deny="${r.key_id}" data-scope="${r.scope}">Deny</button>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('[data-approve]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById('approve-key-id').value = btn.dataset.approve;
        document.getElementById('approve-scope').value = btn.dataset.scope;
        document.getElementById('approve-quota').value = btn.dataset.quota;
        populateSelect('approve-quota-time', state.quotaTimes, btn.dataset.time);
        document.getElementById('approve-reason').value = '';
        openModal('modal-approve');
      });
    });

    list.querySelectorAll('[data-deny]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById('deny-key-id').value = btn.dataset.deny;
        document.getElementById('deny-scope').value = btn.dataset.scope;
        document.getElementById('deny-reason').value = '';
        openModal('modal-deny');
      });
    });
  } catch (e) {
    list.innerHTML = `<p class="empty-state">${e.message}</p>`;
  }
}

// ── Admin: All keys ──────────────────────────────
async function loadAdminKeys(channelFilter) {
  const list = document.getElementById('admin-keys-list');
  list.innerHTML = '<div class="skeleton-list"><div class="skeleton"></div><div class="skeleton"></div></div>';
  try {
    const path = '/console/admin/keys-list' + (channelFilter ? qs({ channel_id: channelFilter }) : '');
    const keys = await api(path);
    if (!keys.length) {
      list.innerHTML = '<p class="empty-state">No keys found.</p>';
      return;
    }
    list.innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>Label</th><th>Key ID</th><th>Channel</th><th>Status</th><th>Created</th><th></th></tr></thead>
      <tbody>${keys.map(k => {
        const cls = formatStatus(k.status);
        const nameLabel = k.label || '(unnamed)';
        return `<tr>
          <td><span class="clickable-key-history" data-key-history="${k.key_id}" data-key-label="${escHtml(nameLabel)}">${escHtml(k.label || '—')}</span></td>
          <td><code class="clickable-key-history" data-key-history="${k.key_id}" data-key-label="${escHtml(nameLabel)}">${escHtml(k.key_id)}</code></td>
          <td><code>${escHtml(k.owner_channel_id)}</code></td>
          <td><span class="key-card-status status-${cls}"><span class="status-dot"></span>${statusLabel(k.status)}</span></td>
          <td>${fmtDate(k.created_at)}</td>
          <td class="action-cell">
            <button class="btn btn-ghost btn-xs" data-admin-stats="${k.key_id}">Stats</button>
            <button class="btn btn-ghost btn-xs" data-admin-add-scope="${k.key_id}">+ Scope</button>
            ${k.status !== 'API_KEY_STATUS_ADMIN_DISABLED'
              ? `<button class="btn btn-ghost btn-xs" data-admin-disable="${k.key_id}">Disable</button>`
              : `<button class="btn btn-ghost btn-xs" data-admin-enable="${k.key_id}">Enable</button>`}
          </td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>`;

    list.querySelectorAll('[data-admin-stats]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const keyId = btn.dataset.adminStats;
        showPage('stats');
        await populateStatsDropdown();
        document.getElementById('stats-key-select').value = keyId;
        const hours = parseInt(document.getElementById('stats-hours-select').value || '24');
        loadKeyUsageChart(keyId, 'stats-chart', hours, 'stats-scope-select');
      });
    });

    list.querySelectorAll('[data-key-history]').forEach(el => {
      el.addEventListener('click', () => {
        openKeyHistoryModal(el.dataset.keyHistory, el.dataset.keyLabel);
      });
    });

    list.querySelectorAll('[data-admin-add-scope]').forEach(btn => {
      btn.addEventListener('click', () => {
        const keyId = btn.dataset.adminAddScope;
        document.getElementById('admin-add-scope-key-id').value = keyId;

        const allScopesObjects = state.allScopes.map(scope => ({
          scope: scope,
          name: state.scopeNameMap[scope] || scope
        }));
        populateSelect('admin-add-scope-select', allScopesObjects, '');
        populateSelect('admin-add-quota-time', state.quotaTimes, '');

        document.getElementById('admin-add-quota').value = '';
        document.getElementById('admin-add-reason').value = '';

        openModal('modal-admin-add-scope');
      });
    });

    list.querySelectorAll('[data-admin-disable]').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await api('/console/admin/keys/update-status' + qs({ key_id: btn.dataset.adminDisable, status: 'API_KEY_STATUS_ADMIN_DISABLED' }));
          toast('Key disabled.', 'success');
          loadAdminKeys(document.getElementById('admin-keys-filter').value.trim());
        } catch (e) { toast(e.message, 'error'); }
      });
    });
    list.querySelectorAll('[data-admin-enable]').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await api('/console/admin/keys/update-status' + qs({ key_id: btn.dataset.adminEnable, status: 'API_KEY_STATUS_ACTIVE' }));
          toast('Key enabled.', 'success');
          loadAdminKeys(document.getElementById('admin-keys-filter').value.trim());
        } catch (e) { toast(e.message, 'error'); }
      });
    });
  } catch (e) {
    list.innerHTML = `<p class="empty-state">${e.message}</p>`;
  }
}

async function openKeyHistoryModal(keyId, label) {
  document.getElementById('history-modal-title').textContent = `History: ${label} (${keyId})`;
  const body = document.getElementById('history-modal-body');
  body.innerHTML = '<div class="skeleton-list"><div class="skeleton"></div><div class="skeleton"></div></div>';
  openModal('modal-key-history');

  try {
    const scopes = await api('/console/keys/scopes' + qs({ key_id: keyId }));
    if (!scopes.length) {
      body.innerHTML = '<p class="empty-state">No scope request history found for this key.</p>';
      return;
    }

    body.innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>Scope</th><th>Quota</th><th>Reset</th><th>Status</th><th>Request Reason</th><th>Admin Note / Reason</th></tr></thead>
      <tbody>${scopes.map(s => {
        let statusBadge = '';
        if (s.approved && !s.pending) {
          statusBadge = '<span style="color:var(--green);border:1px solid var(--green);padding:2px 6px;border-radius:4px;font-size:12px;white-space:nowrap">Approved</span>';
        } else if (!s.approved && s.pending) {
          statusBadge = '<span style="color:var(--yellow);border:1px solid var(--yellow);padding:2px 6px;border-radius:4px;font-size:12px;white-space:nowrap">Pending</span>';
        } else {
          statusBadge = '<span style="color:var(--red);border:1px solid var(--red);padding:2px 6px;border-radius:4px;font-size:12px;white-space:nowrap">Denied</span>';
        }
        const scopeName = state.scopeNameMap[s.scope] || s.scope;
        return `<tr>
          <td><strong style="color:var(--accent)">${escHtml(scopeName)}</strong><br/><span style="font-size:11px;color:var(--text-muted)">${escHtml(s.scope)}</span></td>
          <td>${s.quota}</td>
          <td>${formatResetTime(s.quota_reset_time)}</td>
          <td>${statusBadge}</td>
          <td style="font-size:13px;max-width:200px;white-space:normal">${s.request_reason ? `"${escHtml(s.request_reason)}"` : '—'}</td>
          <td style="font-size:13px;max-width:200px;white-space:normal">${s.admin_reason ? `"${escHtml(s.admin_reason)}"` : '—'}</td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>`;
  } catch (e) {
    body.innerHTML = `<p class="empty-state" style="color:var(--red)">${escHtml(e.message)}</p>`;
  }
}

// ── Admin: Routes ────────────────────────────────
async function loadAdminRoutes() {
  const list = document.getElementById('routes-list');
  list.innerHTML = '<div class="skeleton-list"><div class="skeleton"></div><div class="skeleton"></div></div>';
  try {
    const routes = await api('/console/admin/routes');
    if (!routes.length) {
      list.innerHTML = '<p class="empty-state">No routes configured.</p>';
      return;
    }
    list.innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>Path</th><th>Destination</th><th>Type</th><th>Requires Key</th><th>Scope</th><th></th></tr></thead>
      <tbody>${routes.map(r => `<tr>
        <td><code>${escHtml(r.path)}</code></td>
        <td><code style="font-size:10px">${escHtml(r.destination)}</code></td>
        <td>${(r.type === 'ROUTER_TYPE_INTERNAL_API' || r.type === 'API_INTERNAL' || r.type === 'internal') ? 'API_INTERNAL' : 'API'}</td>
        <td>${r.requires_key ? '✓' : '—'}</td>
        <td>${r.required_scope ? `<code>${escHtml(r.required_scope)}</code>` : '—'}</td>
        <td class="action-cell">
          <button class="btn btn-ghost btn-xs" data-edit-route='${JSON.stringify(r)}'>Edit</button>
          <button class="btn btn-ghost btn-xs" style="color:var(--red)" data-del-route="${r.route_id}">Delete</button>
        </td>
      </tr>`).join('')}</tbody>
    </table></div>`;

    list.querySelectorAll('[data-edit-route]').forEach(btn => {
      btn.addEventListener('click', () => {
        const r = JSON.parse(btn.dataset.editRoute);
        openRouteModal(r);
      });
    });
    list.querySelectorAll('[data-del-route]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this route?')) return;
        try {
          await api('/console/admin/routes/delete' + qs({ id: btn.dataset.delRoute }));
          toast('Route deleted.', 'success');
          loadAdminRoutes();
        } catch (e) { toast(e.message, 'error'); }
      });
    });
  } catch (e) {
    list.innerHTML = `<p class="empty-state">${e.message}</p>`;
  }
}

async function openRouteModal(route) {
  document.getElementById('route-modal-title').textContent = route ? 'Edit Route' : 'Add Route';
  document.getElementById('route-id-field').value = route?.route_id || '';
  document.getElementById('route-path').value = route?.path || '';
  document.getElementById('route-dest').value = route?.destination || '';
  document.getElementById('route-desc').value = route?.description || '';
  const isInternal = (route?.type === 'ROUTER_TYPE_INTERNAL_API' || route?.type === 'API_INTERNAL' || route?.type === 'internal');
  document.getElementById('route-type-select').value = isInternal ? 'API_INTERNAL' : 'API';
  const reqKey = route ? Boolean(route.requires_key) : true;
  document.getElementById('route-requires-key').checked = reqKey;

  if (!state.allScopes.length) {
    try {
      const all = await api('/console/meta/scopes');
      state.allScopes = all.map(r => r.scope);
    } catch {}
  }

  const scopeOptions = [{ value: '', name: 'Select scope…' }, ...state.allScopes];
  populateSelect('route-scope-select', scopeOptions, route?.required_scope || '');

  openModal('modal-route');
}

// ── Admin: Scopes ────────────────────────────────
async function loadAdminScopes() {
  const list = document.getElementById('scopes-config-list');
  list.innerHTML = '<div class="skeleton-list"><div class="skeleton"></div><div class="skeleton"></div></div>';
  try {
    const scopes = await api('/console/admin/scopes');
    if (!scopes.length) {
      list.innerHTML = '<p class="empty-state">No scopes configured.</p>';
      return;
    }
    list.innerHTML = scopes.map(s => `
      <div class="scope-config-row">
        <div class="scope-config-info">
          <div class="scope-config-name">${escHtml(s.scope)}</div>
          ${s.name ? `<div class="scope-config-label">${escHtml(s.name)}</div>` : ''}
        </div>
        <label class="toggle" title="${s.is_requestable ? 'Requestable' : 'Not requestable'}">
          <input type="checkbox" ${s.is_requestable ? 'checked' : ''} data-scope-toggle="${escHtml(s.scope)}" />
          <span class="toggle-slider"></span>
        </label>
      </div>
    `).join('');

    list.querySelectorAll('[data-scope-toggle]').forEach(chk => {
      chk.addEventListener('change', async () => {
        try {
          await api('/console/admin/scopes/set' + qs({ scope: chk.dataset.scopeToggle, is_requestable: chk.checked ? 'true' : 'false' }));
          toast('Scope updated.', 'success');
        } catch (e) {
          chk.checked = !chk.checked; // revert
          toast(e.message, 'error');
        }
      });
    });
  } catch (e) {
    list.innerHTML = `<p class="empty-state">${e.message}</p>`;
  }
}

// ── Utilities ────────────────────────────────────
function populateSelect(id, options, selected) {
  const el = document.getElementById(id);
  el.innerHTML = options.map(o => {
    let val, label;
    if (typeof o === 'object' && o !== null) {
      val = o.value || o.scope || '';
      label = o.name || o.label || val;
    } else {
      val = o;
      label = o.startsWith('QUOTA_RESET_TIME_') ? formatResetTime(o) : o;
    }
    return `<option value="${escHtml(val)}" ${val === selected ? 'selected' : ''}>${escHtml(label)}</option>`;
  }).join('');
}

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatResetTime(time) {
  if (!time) return '—';
  const clean = time.replace('QUOTA_RESET_TIME_', '');
  switch (clean) {
    case 'EVERY_SECOND': return 'Every Second';
    case 'EVERY_MINUTE': return 'Every Minute';
    case 'EVERY_HOUR':   return 'Every Hour';
    case 'EVERY_DAY':    return 'Every Day';
    case 'EVERY_MONTH':  return 'Every Month';
    case 'EVERY_YEAR':   return 'Every Year';
    case 'NEVER':        return 'Never';
    default:
      return clean.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
}

// ── Wire up events ───────────────────────────────
function wireEvents() {
  // Logout
  document.getElementById('logout-btn').addEventListener('click', async () => {
    try {
      await api('/console/auth/logout');
    } catch {}
    state.user = null;
    state.keys = [];
    showLoginScreen();
  });

  // Sidebar nav
  document.querySelectorAll('.nav-item[data-page]').forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      const page = item.dataset.page;
      showPage(page);
      if (page === 'stats') populateStatsDropdown();
      else if (page === 'admin-requests') loadAdminRequests();
      else if (page === 'admin-keys') loadAdminKeys();
      else if (page === 'admin-routes') loadAdminRoutes();
      else if (page === 'admin-scopes') loadAdminScopes();
    });
  });

  // Back button
  document.getElementById('back-to-keys').addEventListener('click', () => {
    showPage('keys');
    state.activeKeyId = null;
  });

  // Scope filter change events
  document.getElementById('detail-scope-select').addEventListener('change', () => {
    if (state.lastUsageData) {
      filterAndRenderChart('detail-usage-chart', 24, 'detail-scope-select');
    }
  });

  document.getElementById('stats-scope-select').addEventListener('change', () => {
    if (state.lastUsageData) {
      const hours = parseInt(document.getElementById('stats-hours-select').value);
      filterAndRenderChart('stats-chart', hours, 'stats-scope-select');
    }
  });

  // Create key
  document.getElementById('create-key-btn').addEventListener('click', () => {
    document.getElementById('new-key-name').value = '';
    openModal('modal-create-key');
  });
  document.getElementById('confirm-create-key').addEventListener('click', async () => {
    const name = document.getElementById('new-key-name').value.trim();
    if (!name) return toast('Name required.', 'error');
    try {
      await api('/console/keys/create' + qs({ name }));
      toast('Key created!', 'success');
      closeModal('modal-create-key');
      loadKeys();
    } catch (e) { toast(e.message, 'error'); }
  });

  // Admin create key
  document.getElementById('admin-create-key-btn')?.addEventListener('click', () => {
    document.getElementById('admin-new-key-name').value = '';
    document.getElementById('admin-new-key-channel').value = '';
    openModal('modal-admin-create-key');
  });
  document.getElementById('confirm-admin-create-key').addEventListener('click', async () => {
    const name = document.getElementById('admin-new-key-name').value.trim();
    const channel = document.getElementById('admin-new-key-channel').value.trim();
    if (!name || !channel) return toast('Name and channel ID required.', 'error');
    try {
      await api('/console/admin/keys/create' + qs({ name, owner_channel_id: channel }));
      toast('Key created!', 'success');
      closeModal('modal-admin-create-key');
      loadAdminKeys(document.getElementById('admin-keys-filter').value.trim());
    } catch (e) { toast(e.message, 'error'); }
  });

  // Admin keys filter
  let filterTimeout;
  document.getElementById('admin-keys-filter')?.addEventListener('input', e => {
    clearTimeout(filterTimeout);
    filterTimeout = setTimeout(() => loadAdminKeys(e.target.value.trim()), 500);
  });

  // View history
  document.getElementById('view-history-btn').addEventListener('click', () => {
    openKeyHistoryModal(state.activeKeyId, state.activeKey?.label || '(unnamed)');
  });

  // Rename key
  document.getElementById('rename-key-btn').addEventListener('click', () => {
    document.getElementById('rename-key-input').value = state.activeKey?.label || '';
    openModal('modal-rename-key');
  });
  document.getElementById('confirm-rename-key').addEventListener('click', async () => {
    const name = document.getElementById('rename-key-input').value.trim();
    if (!name) return toast('Name required.', 'error');
    try {
      await api('/console/keys/rename' + qs({ key_id: state.activeKeyId, name }));
      toast('Key renamed.', 'success');
      closeModal('modal-rename-key');
      state.activeKey.label = name;
      document.getElementById('detail-key-name').textContent = name;
      loadKeys();
    } catch (e) { toast(e.message, 'error'); }
  });

  // Toggle key status
  document.getElementById('toggle-key-btn').addEventListener('click', async () => {
    const btn = document.getElementById('toggle-key-btn');
    const action = btn.dataset.action;
    if (!action) return;
    const newStatus = action === 'enable' ? 'API_KEY_STATUS_ACTIVE' : 'API_KEY_STATUS_USER_DISABLED';
    try {
      await api('/console/keys/update-status' + qs({ key_id: state.activeKeyId, status: newStatus }));
      state.activeKey.status = newStatus;
      updateToggleBtn(newStatus);
      toast(action === 'enable' ? 'Key enabled.' : 'Key disabled.', 'success');
      loadKeys();
    } catch (e) { toast(e.message, 'error'); }
  });

  // Copy key
  document.getElementById('copy-key-btn').addEventListener('click', () => {
    const val = document.getElementById('detail-key-value').textContent;
    navigator.clipboard.writeText(val).then(() => toast('Copied!', 'success'));
  });

  // Request scope
  document.getElementById('request-scope-btn').addEventListener('click', () => {
    populateSelect('req-scope-select', state.requestableScopes, '');
    populateSelect('req-quota-time', state.quotaTimes, '');
    document.getElementById('req-quota').value = '';
    document.getElementById('req-reason').value = '';
    openModal('modal-request-scope');
  });
  document.getElementById('confirm-request-scope').addEventListener('click', async () => {
    const scope = document.getElementById('req-scope-select').value;
    const quota = document.getElementById('req-quota').value;
    const time = document.getElementById('req-quota-time').value;
    const reason = document.getElementById('req-reason').value.trim();
    if (!scope || !quota || !time) return toast('All fields required.', 'error');
    try {
      await api('/console/keys/scopes/request' + qs({ key_id: state.activeKeyId, scope, requested_quota: quota, quota_time: time, request_reason: reason || null }));
      toast('Request submitted.', 'success');
      closeModal('modal-request-scope');
      loadKeyScopes(state.activeKeyId);
    } catch (e) { toast(e.message, 'error'); }
  });

  // Route modal
  document.getElementById('add-route-btn')?.addEventListener('click', () => openRouteModal(null));
  document.getElementById('route-requires-key').addEventListener('change', async e => {
    if (!state.allScopes.length) {
      try {
        const all = await api('/console/meta/scopes');
        state.allScopes = all.map(r => r.scope);
      } catch {}
    }
    const scopeOptions = [{ value: '', name: 'Select scope…' }, ...state.allScopes];
    populateSelect('route-scope-select', scopeOptions, document.getElementById('route-scope-select').value || '');
  });
  document.getElementById('confirm-save-route').addEventListener('click', async () => {
    const id = document.getElementById('route-id-field').value;
    const path = document.getElementById('route-path').value.trim();
    const dest = document.getElementById('route-dest').value.trim();
    const desc = document.getElementById('route-desc').value.trim();
    const typeVal = document.getElementById('route-type-select').value;
    const isInternal = typeVal === 'API_INTERNAL' || typeVal === 'internal';
    const reqKey = document.getElementById('route-requires-key').checked;
    const scope = document.getElementById('route-scope-select').value;
    if (!path || !dest) return toast('Path and destination required.', 'error');
    try {
      await api('/console/admin/routes/save' + qs({ id: id || null, path, destination: dest, description: desc || null, is_internal: isInternal, requires_key: reqKey, required_scope: scope || null }));
      toast('Route saved.', 'success');
      closeModal('modal-route');
      loadAdminRoutes();
    } catch (e) { toast(e.message, 'error'); }
  });

  // Approve modal confirm
  document.getElementById('confirm-approve').addEventListener('click', async () => {
    const keyId = document.getElementById('approve-key-id').value;
    const scope = document.getElementById('approve-scope').value;
    const quota = document.getElementById('approve-quota').value;
    const time = document.getElementById('approve-quota-time').value;
    const reason = document.getElementById('approve-reason').value.trim();
    try {
      await api('/console/admin/requests/approve' + qs({ key_id: keyId, scope, quota_limit: quota, quota_time: time, admin_reason: reason || null }));
      toast('Request approved.', 'success');
      closeModal('modal-approve');
      loadAdminRequests();
      loadAdminBadge();
    } catch (e) { toast(e.message, 'error'); }
  });

  // Deny modal confirm
  document.getElementById('confirm-deny')?.addEventListener('click', async () => {
    const keyId = document.getElementById('deny-key-id').value;
    const scope = document.getElementById('deny-scope').value;
    const reason = document.getElementById('deny-reason').value.trim();
    try {
      await api('/console/admin/requests/deny' + qs({ key_id: keyId, scope, admin_reason: reason || null }));
      toast('Request denied.', 'success');
      closeModal('modal-deny');
      loadAdminRequests();
      loadAdminBadge();
    } catch (e) { toast(e.message, 'error'); }
  });

  // Admin add scope modal confirm
  document.getElementById('confirm-admin-add-scope')?.addEventListener('click', async () => {
    const keyId = document.getElementById('admin-add-scope-key-id').value;
    const scope = document.getElementById('admin-add-scope-select').value;
    const quota = document.getElementById('admin-add-quota').value;
    const time = document.getElementById('admin-add-quota-time').value;
    const reason = document.getElementById('admin-add-reason').value.trim();

    if (!scope || !quota || !time) return toast('All fields required.', 'error');
    try {
      await api('/console/keys/scopes/set' + qs({
        key_id: keyId,
        scope,
        quota_limit: quota,
        quota_time: time,
        admin_approved: 'true',
        admin_reason: reason || null
      }));
      toast('Scope added successfully.', 'success');
      closeModal('modal-admin-add-scope');
      loadAdminKeys(document.getElementById('admin-keys-filter').value.trim());
    } catch (e) { toast(e.message, 'error'); }
  });

  // Close modals via backdrop / close btn
  document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', e => {
      if (e.target === backdrop) backdrop.classList.add('hidden');
    });
  });
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.close));
  });

  // Stats page
  setupStatsPage();
}

// ── Boot ─────────────────────────────────────────
wireEvents();
init();
