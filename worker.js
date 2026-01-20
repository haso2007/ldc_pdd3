/**
 * PDD Group Buy Hub - Linux DO Connect + LDC EasyPay
 */

let CONFIG = null;

const DEFAULT_CONFIG = {
    MERCHANT_ID: '',
    MERCHANT_KEY: '',
    PAY_URL: 'https://credit.linux.do/epay/pay/submit.php',
    REFUND_URL: 'https://credit.linux.do/epay/api.php',
    SITE_NAME: 'PDD Group Hub',
    SITE_FOOTER_LINK: 'https://linux.do',
    GROUP_FEE: 4,
    GROUP_REWARD: 2,
    GROUP_EXPIRY_HOURS: 24,
    OAUTH: {
        CLIENT_ID: '',
        CLIENT_SECRET: '',
        REDIRECT_URI: 'https://example.com/authcallback',
        AUTH_URL: 'https://connect.linux.do/oauth2/authorize',
        TOKEN_URL: 'https://connect.linux.do/oauth2/token',
        USER_URL: 'https://connect.linux.do/api/user',
    },
    ADMIN_USERS: ['admin'],
    COOKIE_SESSION: 'ldc_session',
};

const HTML_HEADER = { 'Content-Type': 'text/html; charset=utf-8' };
const FAVICON_SVG = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='22' fill='%23f05a28'/><path d='M20 55 L50 20 L80 55 L50 85 Z' fill='white'/></svg>";

function toNumber(value, fallback) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function initConfig(env) {
    if (CONFIG) return;
    CONFIG = { ...DEFAULT_CONFIG, OAUTH: { ...DEFAULT_CONFIG.OAUTH } };

    if (env.MERCHANT_ID) CONFIG.MERCHANT_ID = env.MERCHANT_ID;
    if (env.MERCHANT_KEY) CONFIG.MERCHANT_KEY = env.MERCHANT_KEY;
    if (env.SITE_NAME) CONFIG.SITE_NAME = env.SITE_NAME;
    if (env.SITE_FOOTER_LINK) CONFIG.SITE_FOOTER_LINK = env.SITE_FOOTER_LINK;

    if (env.OAUTH_CLIENT_ID) CONFIG.OAUTH.CLIENT_ID = env.OAUTH_CLIENT_ID;
    if (env.OAUTH_CLIENT_SECRET) CONFIG.OAUTH.CLIENT_SECRET = env.OAUTH_CLIENT_SECRET;
    if (env.OAUTH_REDIRECT_URI) CONFIG.OAUTH.REDIRECT_URI = env.OAUTH_REDIRECT_URI;

    if (env.ADMIN_USERS) {
        const admins = env.ADMIN_USERS.split(',').map(v => v.trim()).filter(Boolean);
        if (admins.length > 0) CONFIG.ADMIN_USERS = admins;
    }

    if (env.GROUP_FEE !== undefined) CONFIG.GROUP_FEE = toNumber(env.GROUP_FEE, CONFIG.GROUP_FEE);
    if (env.GROUP_REWARD !== undefined) CONFIG.GROUP_REWARD = toNumber(env.GROUP_REWARD, CONFIG.GROUP_REWARD);
    if (env.GROUP_EXPIRY_HOURS !== undefined) {
        CONFIG.GROUP_EXPIRY_HOURS = toNumber(env.GROUP_EXPIRY_HOURS, CONFIG.GROUP_EXPIRY_HOURS);
    }
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function parseDbTime(value) {
    if (!value) return null;
    const iso = String(value).replace(' ', 'T') + 'Z';
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value) {
    const date = parseDbTime(value);
    if (!date) return '-';
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}

function formatTimeLeft(value) {
    const date = parseDbTime(value);
    if (!date) return 'n/a';
    const diff = date.getTime() - Date.now();
    if (diff <= 0) return '0h 0m';
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
}

function formatStatus(status) {
    const map = {
        pending_payment: 'Pending payment',
        active: 'Active',
        completed: 'Completed',
        expired: 'Expired',
        refunded: 'Refunded',
        cancelled: 'Cancelled',
    };
    return map[status] || status || 'Unknown';
}

function isValidUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

function generateGroupId() {
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 6);
    return `GRP${ts}${rand}`.toUpperCase();
}

function generateOrderId() {
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 8);
    return `ORD${ts}${rand}`.toUpperCase();
}

async function md5(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('MD5', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function generateSign(params, merchantKey) {
    const filtered = Object.entries(params)
        .filter(([key, value]) => value !== '' && value !== null && value !== undefined && key !== 'sign' && key !== 'sign_type')
        .sort(([a], [b]) => a.localeCompare(b));
    const str = filtered.map(([key, value]) => `${key}=${value}`).join('&');
    return await md5(str + merchantKey);
}

async function verifySign(params, merchantKey) {
    const receivedSign = params.sign;
    const calculatedSign = await generateSign(params, merchantKey);
    return receivedSign === calculatedSign;
}

function isAdminUser(user) {
    if (!user || !user.username) return false;
    const adminSet = CONFIG.ADMIN_USERS.map(u => u.toLowerCase());
    return adminSet.includes(String(user.username).toLowerCase());
}

function getHead(title) {
    return `
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>
    <link rel="icon" href="${FAVICON_SVG}">
    <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Noto+Sans+SC:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        * { box-sizing: border-box; }
        body {
            margin: 0;
            font-family: 'Space Grotesk', 'Noto Sans SC', sans-serif;
            color: #1a1a1a;
            background: radial-gradient(circle at top left, #fff1d6 0%, #f7f1ea 45%, #f3f7f4 100%);
            min-height: 100vh;
            display: flex;
            flex-direction: column;
        }
        a { color: inherit; text-decoration: none; }
        header {
            position: sticky;
            top: 0;
            z-index: 10;
            background: rgba(247, 241, 234, 0.9);
            backdrop-filter: blur(8px);
            border-bottom: 1px solid #e5dccb;
        }
        .container { width: min(1100px, 92vw); margin: 0 auto; }
        .nav {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 1rem 0;
            gap: 1.5rem;
        }
        .nav-links { display: flex; gap: 1rem; font-weight: 600; font-size: 0.95rem; }
        .brand { font-size: 1.2rem; font-weight: 700; letter-spacing: 0.02em; }
        .hero {
            margin-top: 1.2rem;
            padding: 1.4rem;
            border-radius: 18px;
            border: 1px solid #f0d6b8;
            background: linear-gradient(135deg, #ffe7d6, #fff0c9);
            box-shadow: 0 14px 28px rgba(0, 0, 0, 0.1);
        }
        .hero h1 { margin: 0 0 0.5rem; font-size: 1.8rem; }
        .grid { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
        .card {
            background: #fff;
            border-radius: 16px;
            border: 1px solid #eadfce;
            padding: 1rem;
            box-shadow: 0 12px 24px rgba(0, 0, 0, 0.08);
            display: flex;
            flex-direction: column;
            gap: 0.8rem;
        }
        .card h3 { margin: 0; font-size: 1.1rem; }
        .card p { margin: 0; color: #5c5346; font-size: 0.92rem; line-height: 1.5; }
        .badge {
            display: inline-flex;
            align-items: center;
            padding: 0.2rem 0.7rem;
            border-radius: 999px;
            font-size: 0.75rem;
            font-weight: 600;
            background: #1a1a1a;
            color: #fff;
        }
        .badge.secondary { background: #f05a28; }
        .btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 0.6rem 1rem;
            border-radius: 10px;
            border: 1px solid #1a1a1a;
            font-weight: 600;
            font-size: 0.9rem;
            gap: 0.4rem;
            background: #fff;
        }
        .btn-primary { background: #f05a28; border-color: #f05a28; color: #fff; }
        .btn-muted { background: #f4efe7; border-color: #d9cbb6; color: #5c5346; }
        .btn-row { display: flex; gap: 0.6rem; flex-wrap: wrap; }
        main { flex: 1; padding-bottom: 2rem; }
        .section-title { margin: 2rem 0 0.8rem; font-size: 1.3rem; }
        label { font-size: 0.85rem; color: #5c5346; display: block; margin-bottom: 0.3rem; }
        input, textarea {
            width: 100%;
            border-radius: 10px;
            border: 1px solid #d9cbb6;
            padding: 0.6rem;
            font: inherit;
            background: #fff;
        }
        textarea { min-height: 110px; resize: vertical; }
        .form-grid { display: grid; gap: 1rem; }
        .muted { color: #5c5346; font-size: 0.9rem; }
        .meta { font-size: 0.8rem; color: #6a5e50; }
        .pill-row { display: flex; gap: 0.6rem; flex-wrap: wrap; }
        .pill { padding: 0.3rem 0.7rem; border-radius: 999px; background: #f4efe7; border: 1px solid #e0d2bd; font-size: 0.8rem; color: #5c5346; }
        table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
        th, td { text-align: left; padding: 0.6rem 0.4rem; border-bottom: 1px solid #eee; vertical-align: top; }
        footer { border-top: 1px solid #e5dccb; padding: 1.2rem 0; margin-top: auto; }
        .empty { padding: 2rem; text-align: center; color: #5c5346; }
        @media (max-width: 720px) {
            .nav { flex-direction: column; align-items: flex-start; }
            .nav-links { flex-wrap: wrap; }
            .hero h1 { font-size: 1.5rem; }
        }
    </style>
    `;
}

function renderHeader(user) {
    const adminLink = isAdminUser(user) ? `<a href="/admin">Admin</a>` : '';
    const authBlock = user
        ? `<div class="btn-row">
             <span class="meta">${escapeHtml(user.username)}</span>
             <a class="btn btn-muted" href="/auth/logout">Logout</a>
           </div>`
        : `<a class="btn btn-primary" href="/auth/login">Login with Linux DO</a>`;
    return `
    <header>
        <div class="container nav">
            <div class="brand">${escapeHtml(CONFIG.SITE_NAME)}</div>
            <nav class="nav-links">
                <a href="/">Groups</a>
                <a href="/group/new">Post</a>
                <a href="/me">My</a>
                ${adminLink}
            </nav>
            ${authBlock}
        </div>
    </header>`;
}

function renderFooter() {
    return `
    <footer>
        <div class="container muted">
            Powered by <a href="${escapeHtml(CONFIG.SITE_FOOTER_LINK)}" target="_blank" rel="noreferrer">LDC</a>.
            PDD actions are completed on the official PDD link.
        </div>
    </footer>`;
}

function renderLayout(title, body, user) {
    return `<!DOCTYPE html><html><head>${getHead(title)}</head><body>
        ${renderHeader(user)}
        <main class="container">
            ${body}
        </main>
        ${renderFooter()}
    </body></html>`;
}

function renderMessagePage(title, message, user, actionsHtml = '') {
    const body = `
        <section class="hero">
            <h1>${escapeHtml(title)}</h1>
            <p class="muted">${escapeHtml(message)}</p>
            ${actionsHtml ? `<div class="btn-row" style="margin-top: 1rem;">${actionsHtml}</div>` : ''}
        </section>`;
    return renderLayout(title, body, user);
}

function renderHomePage(groups, user) {
    const listHtml = groups.length === 0
        ? `<div class="empty">No active groups yet. Be the first to post one.</div>`
        : `<div class="grid">
            ${groups.map(group => {
                const status = formatStatus(group.status);
                const desc = group.description ? escapeHtml(group.description) : 'No description';
                const timeLeft = group.status === 'active' ? formatTimeLeft(group.expires_at) : 'n/a';
                return `
                <article class="card">
                    <div class="pill-row">
                        <span class="badge">${escapeHtml(status)}</span>
                        <span class="pill">Approved: ${group.approved_count || 0}/3</span>
                        <span class="pill">Time left: ${timeLeft}</span>
                    </div>
                    <h3>${escapeHtml(group.title)}</h3>
                    <p>${desc}</p>
                    <div class="meta">Leader: ${escapeHtml(group.leader_username || 'unknown')}</div>
                    <div class="btn-row">
                        <a class="btn btn-primary" href="/group/${group.id}">View group</a>
                    </div>
                </article>`;
            }).join('')}
        </div>`;

    const body = `
        <section class="hero">
            <h1>Share PDD group links. Earn LDC together.</h1>
            <p class="muted">
                Post a group link for ${CONFIG.GROUP_FEE} LDC, invite two members, and submit proofs.
                When all three are approved, each member earns ${CONFIG.GROUP_REWARD} LDC.
            </p>
            <div class="btn-row" style="margin-top: 1rem;">
                <a class="btn btn-primary" href="/group/new">Post a group</a>
                <a class="btn" href="/me">View my groups</a>
            </div>
        </section>
        <h2 class="section-title">Active groups</h2>
        ${listHtml}`;

    return renderLayout(CONFIG.SITE_NAME, body, user);
}

function renderNewGroupPage(user) {
    const body = `
        <section class="hero">
            <h1>Post a new group</h1>
            <p class="muted">Posting costs ${CONFIG.GROUP_FEE} LDC. Group must complete within ${CONFIG.GROUP_EXPIRY_HOURS} hours.</p>
        </section>
        <form class="card form-grid" method="POST" action="/group/create">
            <input type="hidden" name="csrf_token" value="${escapeHtml(user.csrf_token || '')}">
            <div>
                <label for="title">Group title</label>
                <input id="title" name="title" maxlength="80" required>
            </div>
            <div>
                <label for="description">Short description (optional)</label>
                <textarea id="description" name="description" maxlength="300"></textarea>
            </div>
            <div>
                <label for="pdd_url">PDD group link</label>
                <input id="pdd_url" name="pdd_url" type="url" required>
            </div>
            <button class="btn btn-primary" type="submit">Pay and publish</button>
        </form>`;
    return renderLayout('Post a group', body, user);
}

function renderGroupPage(group, members, user) {
    const approvedCount = members.filter(m => m.status === 'approved').length;
    const joinerCount = members.filter(m => m.role === 'member').length;
    const joinerApproved = members.filter(m => m.role === 'member' && m.status === 'approved').length;
    const isLeader = user && group.leader_user_id === user.user_id;
    const currentMember = user ? members.find(m => m.user_id === user.user_id) : null;
    const expired = parseDbTime(group.expires_at) && parseDbTime(group.expires_at).getTime() <= Date.now();

    const proofStatus = currentMember ? `Your proof status: ${escapeHtml(currentMember.status)}` : 'You have not submitted proof yet.';
    let actionBlock = '';

    if (group.status !== 'active' || expired) {
        actionBlock = `<div class="card"><strong>Group is not active.</strong><p class="muted">Status: ${escapeHtml(formatStatus(group.status))}</p></div>`;
    } else if (!user) {
        actionBlock = `<div class="card"><p class="muted">Login required to submit proof.</p><a class="btn btn-primary" href="/auth/login">Login with Linux DO</a></div>`;
    } else if (!isLeader && !currentMember && joinerCount >= 2) {
        actionBlock = `<div class="card"><strong>Group is full.</strong><p class="muted">Two joiners already submitted.</p></div>`;
    } else {
        actionBlock = `
            <form class="card form-grid" method="POST" action="/group/proof">
                <input type="hidden" name="csrf_token" value="${escapeHtml(user.csrf_token || '')}">
                <input type="hidden" name="group_id" value="${escapeHtml(group.id)}">
                <div>
                    <label for="proof_text">Order ID or proof note</label>
                    <input id="proof_text" name="proof_text" maxlength="200" value="${escapeHtml(currentMember?.proof_text || '')}">
                </div>
                <div>
                    <label for="proof_url">Screenshot URL (optional)</label>
                    <input id="proof_url" name="proof_url" type="url" maxlength="500" value="${escapeHtml(currentMember?.proof_url || '')}">
                </div>
                <button class="btn btn-primary" type="submit">Submit proof</button>
                <p class="muted">${proofStatus}</p>
            </form>`;
    }

    const memberRows = members.map(member => {
        const canSeeProof = isAdminUser(user) || (user && user.user_id === member.user_id);
        const proofText = canSeeProof ? escapeHtml(member.proof_text || '-') : '-';
        const proofUrl = canSeeProof && member.proof_url && isValidUrl(member.proof_url)
            ? `<a href="${escapeHtml(member.proof_url)}" target="_blank" rel="noreferrer">Link</a>`
            : '-';
        return `
            <tr>
                <td>${escapeHtml(member.username)}</td>
                <td>${escapeHtml(member.role)}</td>
                <td>${escapeHtml(member.status)}</td>
                <td>${proofText}</td>
                <td>${proofUrl}</td>
            </tr>`;
    }).join('');

    const body = `
        <section class="hero">
            <div class="pill-row">
                <span class="badge secondary">${escapeHtml(formatStatus(group.status))}</span>
                <span class="pill">Approved: ${approvedCount}/3</span>
                <span class="pill">Joiners approved: ${joinerApproved}/2</span>
                <span class="pill">Time left: ${formatTimeLeft(group.expires_at)}</span>
            </div>
            <h1>${escapeHtml(group.title)}</h1>
            <p class="muted">${escapeHtml(group.description || 'No description')}</p>
            <div class="btn-row" style="margin-top: 1rem;">
                <a class="btn btn-primary" href="${escapeHtml(group.pdd_url)}" target="_blank" rel="noreferrer">Open PDD link</a>
                <a class="btn" href="/">Back to list</a>
            </div>
            <p class="meta">Leader: ${escapeHtml(group.leader_username)} | Created: ${formatDate(group.created_at)}</p>
        </section>
        <h2 class="section-title">Submit proof</h2>
        ${actionBlock}
        <h2 class="section-title">Members</h2>
        <div class="card">
            <table>
                <thead>
                    <tr>
                        <th>User</th>
                        <th>Role</th>
                        <th>Status</th>
                        <th>Proof note</th>
                        <th>Proof link</th>
                    </tr>
                </thead>
                <tbody>
                    ${memberRows || '<tr><td colspan="5">No members yet.</td></tr>'}
                </tbody>
            </table>
        </div>`;

    return renderLayout(group.title, body, user);
}

function renderMyPage(data, user) {
    const renderList = (items) => items.length === 0
        ? '<div class="empty">No items yet.</div>'
        : `<div class="grid">${items.map(group => `
            <article class="card">
                <span class="badge">${escapeHtml(formatStatus(group.status))}</span>
                <h3>${escapeHtml(group.title)}</h3>
                <p>${escapeHtml(group.description || 'No description')}</p>
                <div class="meta">Created: ${formatDate(group.created_at)}</div>
                <a class="btn btn-primary" href="/group/${group.id}">View group</a>
            </article>
        `).join('')}</div>`;

    const body = `
        <section class="hero">
            <h1>My groups</h1>
            <p class="muted">Track what you posted and joined.</p>
        </section>
        <h2 class="section-title">Posted by me</h2>
        ${renderList(data.posted)}
        <h2 class="section-title">Joined by me</h2>
        ${renderList(data.joined)}`;

    return renderLayout('My groups', body, user);
}

function renderAdminDashboard(stats, user) {
    const body = `
        <section class="hero">
            <h1>Admin dashboard</h1>
            <p class="muted">Review proofs and issue rewards.</p>
        </section>
        <div class="grid">
            <div class="card"><h3>Total groups</h3><p class="meta">${stats.totalGroups}</p></div>
            <div class="card"><h3>Active groups</h3><p class="meta">${stats.activeGroups}</p></div>
            <div class="card"><h3>Pending proofs</h3><p class="meta">${stats.pendingProofs}</p></div>
            <div class="card"><h3>Pending rewards</h3><p class="meta">${stats.pendingRewards}</p></div>
        </div>
        <div class="btn-row" style="margin-top: 1.5rem;">
            <a class="btn btn-primary" href="/admin/proofs">Review proofs</a>
            <a class="btn" href="/admin/rewards">Review rewards</a>
            <a class="btn" href="/admin/groups">All groups</a>
        </div>`;
    return renderLayout('Admin dashboard', body, user);
}

function renderAdminGroups(groups, user) {
    const rows = groups.map(group => {
        const action = group.status === 'active'
            ? `<form method="POST" action="/admin/group/expire">
                   <input type="hidden" name="csrf_token" value="${escapeHtml(user.csrf_token || '')}">
                   <input type="hidden" name="group_id" value="${escapeHtml(group.id)}">
                   <button class="btn btn-muted" type="submit">Expire + refund</button>
               </form>`
            : '-';
        return `
            <tr>
                <td><a href="/group/${group.id}">${escapeHtml(group.title)}</a></td>
                <td>${escapeHtml(formatStatus(group.status))}</td>
                <td>${escapeHtml(group.leader_username)}</td>
                <td>${group.approved_count || 0}/3</td>
                <td>${formatDate(group.created_at)}</td>
                <td>${action}</td>
            </tr>`;
    }).join('');

    const body = `
        <section class="hero">
            <h1>All groups</h1>
            <p class="muted">Use manual expire when needed.</p>
        </section>
        <div class="card">
            <table>
                <thead>
                    <tr>
                        <th>Title</th>
                        <th>Status</th>
                        <th>Leader</th>
                        <th>Approved</th>
                        <th>Created</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>${rows || '<tr><td colspan="6">No groups found.</td></tr>'}</tbody>
            </table>
        </div>`;
    return renderLayout('Admin groups', body, user);
}

function renderAdminProofs(proofs, user) {
    const rows = proofs.map(item => {
        const proofUrl = item.proof_url && isValidUrl(item.proof_url)
            ? `<a href="${escapeHtml(item.proof_url)}" target="_blank" rel="noreferrer">Link</a>`
            : '-';
        return `
            <tr>
                <td><a href="/group/${item.group_id}">${escapeHtml(item.group_title || item.group_id)}</a></td>
                <td>${escapeHtml(item.username)}</td>
                <td>${escapeHtml(item.role)}</td>
                <td>${escapeHtml(item.proof_text || '-')}</td>
                <td>${proofUrl}</td>
                <td class="btn-row">
                    <form method="POST" action="/admin/proof/action">
                        <input type="hidden" name="csrf_token" value="${escapeHtml(user.csrf_token || '')}">
                        <input type="hidden" name="member_id" value="${item.id}">
                        <input type="hidden" name="action" value="approve">
                        <button class="btn btn-primary" type="submit">Approve</button>
                    </form>
                    <form method="POST" action="/admin/proof/action">
                        <input type="hidden" name="csrf_token" value="${escapeHtml(user.csrf_token || '')}">
                        <input type="hidden" name="member_id" value="${item.id}">
                        <input type="hidden" name="action" value="reject">
                        <button class="btn btn-muted" type="submit">Reject</button>
                    </form>
                </td>
            </tr>`;
    }).join('');

    const body = `
        <section class="hero">
            <h1>Pending proofs</h1>
            <p class="muted">Approve once the PDD participation is confirmed.</p>
        </section>
        <div class="card">
            <table>
                <thead>
                    <tr>
                        <th>Group</th>
                        <th>User</th>
                        <th>Role</th>
                        <th>Proof note</th>
                        <th>Proof link</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>${rows || '<tr><td colspan="6">No pending proofs.</td></tr>'}</tbody>
            </table>
        </div>`;
    return renderLayout('Admin proofs', body, user);
}

function renderAdminRewards(rewards, user) {
    const rows = rewards.map(item => `
        <tr>
            <td><a href="/group/${item.group_id}">${escapeHtml(item.group_title || item.group_id)}</a></td>
            <td>${escapeHtml(item.username)}</td>
            <td>${item.amount}</td>
            <td>${escapeHtml(item.status)}</td>
            <td>
                <form method="POST" action="/admin/reward/paid">
                    <input type="hidden" name="csrf_token" value="${escapeHtml(user.csrf_token || '')}">
                    <input type="hidden" name="reward_id" value="${item.id}">
                    <button class="btn btn-primary" type="submit">Mark paid</button>
                </form>
            </td>
        </tr>`).join('');

    const body = `
        <section class="hero">
            <h1>Pending rewards</h1>
            <p class="muted">Rewards are manual unless you integrate a payout flow.</p>
        </section>
        <div class="card">
            <table>
                <thead>
                    <tr>
                        <th>Group</th>
                        <th>User</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>${rows || '<tr><td colspan="5">No pending rewards.</td></tr>'}</tbody>
            </table>
        </div>`;
    return renderLayout('Admin rewards', body, user);
}

async function getSession(request, env) {
    const cookie = request.headers.get('Cookie') || '';
    const match = cookie.match(new RegExp(`${CONFIG.COOKIE_SESSION}=([^;]+)`));
    if (!match) return null;
    const sessionId = match[1];
    return await env.DB.prepare('SELECT * FROM sessions WHERE id = ? AND expires_at > datetime("now")')
        .bind(sessionId).first();
}

async function getActiveGroups(db) {
    const { results } = await db.prepare(`
        SELECT g.*,
            SUM(CASE WHEN gm.status = 'approved' THEN 1 ELSE 0 END) AS approved_count
        FROM groups g
        LEFT JOIN group_members gm ON gm.group_id = g.id
        WHERE g.status IN ('active', 'completed')
        GROUP BY g.id
        ORDER BY g.created_at DESC
    `).all();
    return results;
}

async function getAdminGroups(db) {
    const { results } = await db.prepare(`
        SELECT g.*,
            SUM(CASE WHEN gm.status = 'approved' THEN 1 ELSE 0 END) AS approved_count
        FROM groups g
        LEFT JOIN group_members gm ON gm.group_id = g.id
        GROUP BY g.id
        ORDER BY g.created_at DESC
    `).all();
    return results;
}

async function getGroup(db, groupId) {
    return await db.prepare('SELECT * FROM groups WHERE id = ?').bind(groupId).first();
}

async function getGroupMembers(db, groupId) {
    const { results } = await db.prepare('SELECT * FROM group_members WHERE group_id = ? ORDER BY created_at ASC')
        .bind(groupId).all();
    return results;
}

async function getMyGroups(db, user) {
    const posted = await db.prepare('SELECT * FROM groups WHERE leader_user_id = ? ORDER BY created_at DESC')
        .bind(user.user_id).all();
    const joined = await db.prepare(`
        SELECT g.* FROM groups g
        JOIN group_members gm ON gm.group_id = g.id
        WHERE gm.user_id = ? AND g.leader_user_id != ?
        ORDER BY g.created_at DESC
    `).bind(user.user_id, user.user_id).all();
    return { posted: posted.results || [], joined: joined.results || [] };
}

async function getAdminStats(db) {
    const totalGroups = await db.prepare('SELECT COUNT(*) as count FROM groups').first();
    const activeGroups = await db.prepare("SELECT COUNT(*) as count FROM groups WHERE status = 'active'").first();
    const pendingProofs = await db.prepare("SELECT COUNT(*) as count FROM group_members WHERE status = 'pending'").first();
    const pendingRewards = await db.prepare("SELECT COUNT(*) as count FROM rewards WHERE status = 'pending'").first();
    return {
        totalGroups: totalGroups?.count || 0,
        activeGroups: activeGroups?.count || 0,
        pendingProofs: pendingProofs?.count || 0,
        pendingRewards: pendingRewards?.count || 0,
    };
}

async function getPendingProofs(db) {
    const { results } = await db.prepare(`
        SELECT gm.*, g.title as group_title
        FROM group_members gm
        JOIN groups g ON g.id = gm.group_id
        WHERE gm.status = 'pending'
        ORDER BY gm.created_at ASC
    `).all();
    return results;
}

async function getPendingRewards(db) {
    const { results } = await db.prepare(`
        SELECT r.*, g.title as group_title
        FROM rewards r
        JOIN groups g ON g.id = r.group_id
        WHERE r.status = 'pending'
        ORDER BY r.created_at ASC
    `).all();
    return results;
}

async function countApprovedMembers(db, groupId) {
    const row = await db.prepare("SELECT COUNT(*) as count FROM group_members WHERE group_id = ? AND status = 'approved'")
        .bind(groupId).first();
    return row?.count || 0;
}

async function handleAuthLogin() {
    const state = Math.random().toString(36).slice(2);
    const url = `${CONFIG.OAUTH.AUTH_URL}?response_type=code&client_id=${CONFIG.OAUTH.CLIENT_ID}&state=${state}&redirect_uri=${encodeURIComponent(CONFIG.OAUTH.REDIRECT_URI)}`;
    return Response.redirect(url, 302);
}

async function handleAuthCallback(request, env) {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    if (!code) return new Response('Missing code', { status: 400 });

    const tokenResp = await fetch(CONFIG.OAUTH.TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: CONFIG.OAUTH.CLIENT_ID,
            client_secret: CONFIG.OAUTH.CLIENT_SECRET,
            code,
            redirect_uri: CONFIG.OAUTH.REDIRECT_URI
        })
    });

    if (!tokenResp.ok) return new Response('Failed to get token', { status: 400 });
    const tokenData = await tokenResp.json();

    const userResp = await fetch(CONFIG.OAUTH.USER_URL, {
        headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
    });

    if (!userResp.ok) return new Response('Failed to get user info', { status: 400 });
    const userInfo = await userResp.json();

    const sessionId = crypto.randomUUID();
    const csrfToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    await env.DB.prepare('INSERT INTO sessions (id, user_id, username, avatar_url, trust_level, csrf_token, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(sessionId, userInfo.id, userInfo.username, userInfo.avatar_url, userInfo.trust_level, csrfToken, expiresAt)
        .run();

    return new Response('', {
        status: 302,
        headers: {
            'Location': '/',
            'Set-Cookie': `${CONFIG.COOKIE_SESSION}=${sessionId}; Path=/; Secure; SameSite=Lax; HttpOnly`
        }
    });
}

async function handleAuthLogout(request, env) {
    const cookie = request.headers.get('Cookie') || '';
    const match = cookie.match(new RegExp(`${CONFIG.COOKIE_SESSION}=([^;]+)`));
    if (match) {
        await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(match[1]).run();
    }
    return new Response('', {
        status: 302,
        headers: {
            'Location': '/',
            'Set-Cookie': `${CONFIG.COOKIE_SESSION}=; Path=/; Max-Age=0`
        }
    });
}

async function handleGroupCreate(request, env) {
    const user = await getSession(request, env);
    if (!user) return new Response(renderMessagePage('Login required', 'Please login first.', user), { status: 401, headers: HTML_HEADER });

    const fd = await request.formData();
    if (fd.get('csrf_token') !== user.csrf_token) {
        return new Response(renderMessagePage('CSRF error', 'Please refresh and try again.', user), { status: 403, headers: HTML_HEADER });
    }

    const title = String(fd.get('title') || '').trim();
    const description = String(fd.get('description') || '').trim();
    const pddUrl = String(fd.get('pdd_url') || '').trim();

    if (!title || !pddUrl || !isValidUrl(pddUrl)) {
        return new Response(renderMessagePage('Invalid input', 'Title and a valid PDD URL are required.', user), { status: 400, headers: HTML_HEADER });
    }

    if (!CONFIG.MERCHANT_ID || !CONFIG.MERCHANT_KEY) {
        return new Response(renderMessagePage('Missing merchant config', 'MERCHANT_ID and MERCHANT_KEY are required.', user), { status: 500, headers: HTML_HEADER });
    }

    const groupId = generateGroupId();
    const orderId = generateOrderId();

    await env.DB.batch([
        env.DB.prepare(`
            INSERT INTO groups (id, title, description, pdd_url, leader_user_id, leader_username, status, payment_order_id)
            VALUES (?, ?, ?, ?, ?, ?, 'pending_payment', ?)
        `).bind(groupId, title, description || null, pddUrl, user.user_id, user.username, orderId),
        env.DB.prepare(`
            INSERT INTO group_members (group_id, user_id, username, role, status)
            VALUES (?, ?, ?, 'leader', 'pending')
        `).bind(groupId, user.user_id, user.username),
        env.DB.prepare(`
            INSERT INTO post_orders (order_id, group_id, user_id, username, amount, status)
            VALUES (?, ?, ?, ?, ?, 'pending')
        `).bind(orderId, groupId, user.user_id, user.username, CONFIG.GROUP_FEE),
    ]);

    const origin = new URL(request.url).origin;
    const payParams = {
        pid: CONFIG.MERCHANT_ID,
        type: 'epay',
        out_trade_no: orderId,
        notify_url: `${origin}/pay/notify`,
        return_url: `${origin}/pay/return`,
        name: `Group post fee: ${title}`,
        money: Number(CONFIG.GROUP_FEE).toFixed(2),
        sign_type: 'MD5'
    };
    payParams.sign = await generateSign(payParams, CONFIG.MERCHANT_KEY);

    const html = `<!DOCTYPE html><html><body onload="document.forms[0].submit()">
        <form action="${CONFIG.PAY_URL}" method="POST">
            ${Object.entries(payParams).map(([k, v]) => `<input type="hidden" name="${k}" value="${escapeHtml(v)}">`).join('')}
        </form>
    </body></html>`;

    return new Response(html, { headers: HTML_HEADER });
}

async function parseNotifyParams(request) {
    const params = {};
    if (request.method === 'POST') {
        const contentType = request.headers.get('content-type') || '';
        if (contentType.includes('form')) {
            (await request.formData()).forEach((v, k) => { params[k] = v; });
        } else {
            new URLSearchParams(await request.text()).forEach((v, k) => { params[k] = v; });
        }
    } else {
        new URL(request.url).searchParams.forEach((v, k) => { params[k] = v; });
    }
    return params;
}

async function handleNotify(request, env) {
    const params = await parseNotifyParams(request);
    if (!await verifySign(params, CONFIG.MERCHANT_KEY)) return new Response('fail', { status: 400 });

    if (params.trade_status === 'TRADE_SUCCESS') {
        const orderId = params.out_trade_no;
        const order = await env.DB.prepare('SELECT * FROM post_orders WHERE order_id = ?').bind(orderId).first();
        if (order && order.status === 'pending') {
            const expiryInterval = `+${CONFIG.GROUP_EXPIRY_HOURS} hours`;
            await env.DB.batch([
                env.DB.prepare(`
                    UPDATE post_orders
                    SET status = 'paid', trade_no = ?, paid_at = datetime('now')
                    WHERE order_id = ?
                `).bind(params.trade_no, orderId),
                env.DB.prepare(`
                    UPDATE groups
                    SET status = 'active',
                        activated_at = datetime('now'),
                        expires_at = datetime('now', ?),
                        payment_trade_no = ?
                    WHERE id = ?
                `).bind(expiryInterval, params.trade_no, order.group_id)
            ]);
        }
    }
    return new Response('success');
}

async function handleReturn(request, env) {
    const url = new URL(request.url);
    const orderId = url.searchParams.get('out_trade_no');
    if (!orderId) {
        return new Response(renderMessagePage('Missing order', 'No order ID found in the callback.', null), { status: 400, headers: HTML_HEADER });
    }
    const order = await env.DB.prepare('SELECT * FROM post_orders WHERE order_id = ?').bind(orderId).first();
    if (!order) {
        return new Response(renderMessagePage('Order not found', 'No matching order exists.', null), { status: 404, headers: HTML_HEADER });
    }
    const group = await env.DB.prepare('SELECT * FROM groups WHERE id = ?').bind(order.group_id).first();
    const status = order.status === 'paid' ? 'Payment confirmed. Group is active.' : 'Payment received. Please wait for confirmation.';
    const actions = group ? `<a class="btn btn-primary" href="/group/${group.id}">Open group</a>` : '';
    return new Response(renderMessagePage('Payment status', status, await getSession(request, env), actions), { headers: HTML_HEADER });
}

async function handleProofSubmit(request, env) {
    const user = await getSession(request, env);
    if (!user) return new Response('Login required', { status: 401 });

    const fd = await request.formData();
    if (fd.get('csrf_token') !== user.csrf_token) return new Response('CSRF token mismatch', { status: 403 });

    const groupId = String(fd.get('group_id') || '').trim();
    const proofText = String(fd.get('proof_text') || '').trim();
    const proofUrl = String(fd.get('proof_url') || '').trim();

    if (!groupId) return new Response('Missing group', { status: 400 });
    if (!proofText && !proofUrl) return new Response('Provide proof text or URL', { status: 400 });
    if (proofUrl && !isValidUrl(proofUrl)) return new Response('Invalid proof URL', { status: 400 });

    const group = await getGroup(env.DB, groupId);
    if (!group) return new Response('Group not found', { status: 404 });
    if (group.status !== 'active') return new Response('Group not active', { status: 400 });

    const expiresAt = parseDbTime(group.expires_at);
    if (expiresAt && Date.now() > expiresAt.getTime()) return new Response('Group expired', { status: 400 });

    const existing = await env.DB.prepare('SELECT * FROM group_members WHERE group_id = ? AND user_id = ?')
        .bind(groupId, user.user_id).first();

    if (existing) {
        await env.DB.prepare(`
            UPDATE group_members
            SET proof_text = ?, proof_url = ?, status = 'pending', reviewed_at = NULL
            WHERE id = ?
        `).bind(proofText || null, proofUrl || null, existing.id).run();
    } else {
        if (group.leader_user_id === user.user_id) {
            await env.DB.prepare(`
                INSERT INTO group_members (group_id, user_id, username, role, status, proof_text, proof_url)
                VALUES (?, ?, ?, 'leader', 'pending', ?, ?)
            `).bind(groupId, user.user_id, user.username, proofText || null, proofUrl || null).run();
        } else {
            const joinerCount = await env.DB.prepare("SELECT COUNT(*) as count FROM group_members WHERE group_id = ? AND role = 'member'")
                .bind(groupId).first();
            if ((joinerCount?.count || 0) >= 2) return new Response('Group is full', { status: 400 });
            await env.DB.prepare(`
                INSERT INTO group_members (group_id, user_id, username, role, status, proof_text, proof_url)
                VALUES (?, ?, ?, 'member', 'pending', ?, ?)
            `).bind(groupId, user.user_id, user.username, proofText || null, proofUrl || null).run();
        }
    }

    return Response.redirect(`/group/${groupId}`, 302);
}

async function handleAdminProofAction(request, env, user) {
    const fd = await request.formData();
    if (fd.get('csrf_token') !== user.csrf_token) return new Response('CSRF token mismatch', { status: 403 });

    const memberId = fd.get('member_id');
    const action = fd.get('action');
    if (!memberId || !action) return new Response('Missing data', { status: 400 });

    const member = await env.DB.prepare('SELECT * FROM group_members WHERE id = ?').bind(memberId).first();
    if (!member) return new Response('Member not found', { status: 404 });

    const status = action === 'approve' ? 'approved' : 'rejected';
    await env.DB.prepare('UPDATE group_members SET status = ?, reviewed_at = datetime("now") WHERE id = ?')
        .bind(status, memberId).run();

    if (status === 'approved') {
        await maybeCompleteGroup(env, member.group_id);
    }

    return Response.redirect('/admin/proofs', 302);
}

async function handleRewardPaid(request, env, user) {
    const fd = await request.formData();
    if (fd.get('csrf_token') !== user.csrf_token) return new Response('CSRF token mismatch', { status: 403 });
    const rewardId = fd.get('reward_id');
    if (!rewardId) return new Response('Missing reward', { status: 400 });

    await env.DB.prepare("UPDATE rewards SET status = 'paid', paid_at = datetime('now') WHERE id = ?")
        .bind(rewardId).run();
    return Response.redirect('/admin/rewards', 302);
}

async function handleAdminGroupExpire(request, env, user) {
    const fd = await request.formData();
    if (fd.get('csrf_token') !== user.csrf_token) return new Response('CSRF token mismatch', { status: 403 });
    const groupId = fd.get('group_id');
    if (!groupId) return new Response('Missing group', { status: 400 });
    await expireGroupAndRefund(env, groupId);
    return Response.redirect('/admin/groups', 302);
}

async function maybeCompleteGroup(env, groupId) {
    const group = await env.DB.prepare('SELECT * FROM groups WHERE id = ?').bind(groupId).first();
    if (!group || group.status !== 'active') return;

    const { results } = await env.DB.prepare(`
        SELECT user_id, username
        FROM group_members
        WHERE group_id = ? AND status = 'approved'
        ORDER BY created_at ASC
    `).bind(groupId).all();

    if (results.length >= 3) {
        await env.DB.prepare("UPDATE groups SET status = 'completed', completed_at = datetime('now') WHERE id = ?")
            .bind(groupId).run();

        for (const member of results.slice(0, 3)) {
            await env.DB.prepare(`
                INSERT OR IGNORE INTO rewards (group_id, user_id, username, amount, status)
                VALUES (?, ?, ?, ?, 'pending')
            `).bind(groupId, member.user_id, member.username, CONFIG.GROUP_REWARD).run();
        }
    }
}

async function refundOrder(order) {
    if (!CONFIG.MERCHANT_ID || !CONFIG.MERCHANT_KEY) {
        return { ok: false, error: 'Missing merchant config' };
    }
    if (!order.trade_no) return { ok: false, error: 'Missing trade_no' };

    const params = {
        pid: CONFIG.MERCHANT_ID,
        key: CONFIG.MERCHANT_KEY,
        trade_no: order.trade_no,
        money: order.amount,
    };

    const resp = await fetch(CONFIG.REFUND_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'PDD-Group-Worker/1.0',
            'Accept': 'application/json'
        },
        body: new URLSearchParams(params)
    });

    const contentType = resp.headers.get('content-type') || '';
    const text = await resp.text();
    let result = null;
    try {
        if (contentType.includes('application/json')) {
            result = JSON.parse(text);
        } else {
            result = JSON.parse(text);
        }
    } catch {
        return { ok: false, error: 'non_json_response' };
    }

    if (result && result.code === 1) return { ok: true };
    return { ok: false, error: result?.msg || 'refund_failed' };
}

async function expireGroupAndRefund(env, groupId) {
    const group = await env.DB.prepare('SELECT * FROM groups WHERE id = ?').bind(groupId).first();
    if (!group) return;

    await env.DB.prepare("UPDATE groups SET status = 'expired', expired_at = datetime('now') WHERE id = ?")
        .bind(groupId).run();

    const order = await env.DB.prepare('SELECT * FROM post_orders WHERE group_id = ?').bind(groupId).first();
    if (!order || order.status !== 'paid') return;

    const refund = await refundOrder(order);
    if (refund.ok) {
        await env.DB.batch([
            env.DB.prepare("UPDATE post_orders SET status = 'refunded', refunded_at = datetime('now'), refund_error = NULL WHERE order_id = ?")
                .bind(order.order_id),
            env.DB.prepare("UPDATE groups SET status = 'refunded' WHERE id = ?").bind(groupId)
        ]);
    } else {
        await env.DB.prepare('UPDATE post_orders SET refund_error = ? WHERE order_id = ?')
            .bind(refund.error, order.order_id).run();
    }
}

async function runExpirySweep(env) {
    const { results } = await env.DB.prepare(`
        SELECT id FROM groups
        WHERE status = 'active' AND expires_at <= datetime('now')
    `).all();

    for (const group of results) {
        const approved = await countApprovedMembers(env.DB, group.id);
        if (approved >= 3) {
            await maybeCompleteGroup(env, group.id);
        } else {
            await expireGroupAndRefund(env, group.id);
        }
    }
}

export default {
    async fetch(request, env) {
        initConfig(env);
        const url = new URL(request.url);
        const path = url.pathname;

        try {
            if (path === '/auth/login') return handleAuthLogin();
            if (path === '/authcallback') return await handleAuthCallback(request, env);
            if (path === '/auth/logout') return await handleAuthLogout(request, env);

            if (path === '/pay/notify') return await handleNotify(request, env);
            if (path === '/pay/return') return await handleReturn(request, env);

            if (path === '/group/new') {
                const user = await getSession(request, env);
                if (!user) {
                    return new Response(renderMessagePage('Login required', 'Please login first.', user, '<a class="btn btn-primary" href="/auth/login">Login</a>'), { status: 401, headers: HTML_HEADER });
                }
                return new Response(renderNewGroupPage(user), { headers: HTML_HEADER });
            }
            if (path === '/group/create' && request.method === 'POST') return await handleGroupCreate(request, env);
            if (path === '/group/proof' && request.method === 'POST') return await handleProofSubmit(request, env);

            if (path.startsWith('/group/') && request.method === 'GET') {
                const groupId = path.split('/')[2];
                const group = await getGroup(env.DB, groupId);
                if (!group) return new Response('Group not found', { status: 404 });
                const members = await getGroupMembers(env.DB, groupId);
                const user = await getSession(request, env);
                return new Response(renderGroupPage(group, members, user), { headers: HTML_HEADER });
            }

            if (path === '/me') {
                const user = await getSession(request, env);
                if (!user) {
                    return new Response(renderMessagePage('Login required', 'Please login to view your groups.', user, '<a class="btn btn-primary" href="/auth/login">Login</a>'), { status: 401, headers: HTML_HEADER });
                }
                const data = await getMyGroups(env.DB, user);
                return new Response(renderMyPage(data, user), { headers: HTML_HEADER });
            }

            if (path === '/') {
                const user = await getSession(request, env);
                const groups = await getActiveGroups(env.DB);
                return new Response(renderHomePage(groups, user), { headers: HTML_HEADER });
            }

            if (path.startsWith('/admin')) {
                const user = await getSession(request, env);
                if (!user || !isAdminUser(user)) {
                    return new Response(renderMessagePage('Access denied', 'Admin access required.', user), { status: 403, headers: HTML_HEADER });
                }

                if (path === '/admin') {
                    const stats = await getAdminStats(env.DB);
                    return new Response(renderAdminDashboard(stats, user), { headers: HTML_HEADER });
                }
                if (path === '/admin/groups') {
                    const groups = await getAdminGroups(env.DB);
                    return new Response(renderAdminGroups(groups, user), { headers: HTML_HEADER });
                }
                if (path === '/admin/proofs') {
                    const proofs = await getPendingProofs(env.DB);
                    return new Response(renderAdminProofs(proofs, user), { headers: HTML_HEADER });
                }
                if (path === '/admin/rewards') {
                    const rewards = await getPendingRewards(env.DB);
                    return new Response(renderAdminRewards(rewards, user), { headers: HTML_HEADER });
                }
                if (path === '/admin/proof/action' && request.method === 'POST') {
                    return await handleAdminProofAction(request, env, user);
                }
                if (path === '/admin/reward/paid' && request.method === 'POST') {
                    return await handleRewardPaid(request, env, user);
                }
                if (path === '/admin/group/expire' && request.method === 'POST') {
                    return await handleAdminGroupExpire(request, env, user);
                }
            }

            return new Response('Not Found', { status: 404 });
        } catch (e) {
            return new Response(renderMessagePage('Error', e.message || 'Unexpected error', null), { status: 500, headers: HTML_HEADER });
        }
    },
    async scheduled(event, env, ctx) {
        initConfig(env);
        ctx.waitUntil(runExpirySweep(env));
    }
};
