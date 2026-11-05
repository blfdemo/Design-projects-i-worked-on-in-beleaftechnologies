// Dashboard app: reads data/data.js and renders pages with hash routing (#/dashboard, #/projects ...)
// Admin mode (js/admin.js) hooks in through window.adminNav / window.onRendered.
const STATUS = {
  live:      { label: 'Live',          icon: 'live',  cls: 'st-live',      c: '#34c76f' },
  converted: { label: 'Converted',     icon: 'check', cls: 'st-converted', c: '#5b83ff' },
  progress:  { label: 'In conversion', icon: 'clock', cls: 'st-progress',  c: '#ffb13d' },
  design:    { label: 'Design only',   icon: 'pen',   cls: 'st-design',    c: '#9aa0ad' },
};
const SUBTYPE = { client: 'Client', company: 'Company', demo: 'Demo', partial: 'Partial', ai: 'AI Demo' };
const ICON = { projects: 'layers', revamps: 'refresh', others: 'building', misc: 'palette' };
// Section icons may be stored as old Bootstrap names (bi-*) or as new names — map both to the line-icon set.
const LEGACY = { 'bi-kanban': 'layers', 'bi-arrow-repeat': 'refresh', 'bi-buildings': 'building', 'bi-palette': 'palette', 'bi-grid': 'grid',
  'bi-rocket-takeoff': 'rocket', 'bi-globe2': 'globe', 'bi-phone': 'phone', 'bi-cart': 'cart', 'bi-bank': 'bank', 'bi-cpu': 'cpu', 'bi-star': 'star', 'bi-folder': 'folder' };
const iconOf = c => LEGACY[c.icon] || (ICON_NAMES.includes(c.icon) ? c.icon : ICON[c.id] || 'folder');

const $ = s => document.querySelector(s);
const view = $('#view'), nav = $('#nav');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let data, filter = { status: 'all', sub: 'all' }, redraw = null;

const hue = s => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 0);
const initials = s => s.replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '·';

// ---- Site settings (colour, logo, footer) stored in data.settings ----
const DEFAULTS = { brand: '#0e8a4e', logo: '', logoDark: '', avatar: '', footerText: '', footerLinks: [] };
const cfg = () => ({ ...DEFAULTS, ...(data.settings || {}) });
function applySettings() {
  const s = cfg();
  document.documentElement.style.setProperty('--brand', /^#[0-9a-f]{6}$/i.test(s.brand) ? s.brand : DEFAULTS.brand);
  $('#brandName').textContent = data.profile.name; document.title = data.profile.name + ' · Design Work';
  $('#sbName').textContent = data.profile.name; $('#sbRole').textContent = data.profile.role;
  // Logo: separate light/dark versions (dark falls back to light and vice-versa). Avatar: one photo, else initials.
  const pick = (k, loc) => window[loc] !== undefined ? window[loc] : s[k];
  const L = pick('logo', 'localLogo'), D = pick('logoDark', 'localLogoDark'), dark = document.documentElement.getAttribute('data-theme') === 'dark';
  const logo = dark ? (D || L) : (L || D), bi = $('#brandIcon'), av = pick('avatar', 'localAvatar');
  $('#sbAvatar').classList.toggle('has-img', !!av);
  $('#sbAvatar').innerHTML = av ? `<img src="${esc(av)}" alt="${esc(data.profile.name)}">` : esc(initials(data.profile.name));
  bi.classList.toggle('has-logo', !!logo);
  $('#brandName').classList.toggle('d-none', !!logo);   // logo already carries the name
  bi.innerHTML = logo ? `<img src="${esc(logo)}" alt="Logo">` : I('sparkle');
  const fav = L || D; if (fav) { let f = document.querySelector('link[rel=icon]'); if (!f) { f = document.createElement('link'); f.rel = 'icon'; document.head.appendChild(f); } f.href = fav; }
  $('#siteFooter').innerHTML = `<span>${esc(s.footerText || '© ' + new Date().getFullYear() + ' ' + data.profile.name)}</span>` +
    `<span class="links">${s.footerLinks.map(l => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}${I('arrow-ur', 'i-sm')}</a>`).join('')}</span>`;
}

// Fallback when thumbs/<id>.jpg doesn't exist yet: soft gradient tile with initials
document.addEventListener('error', e => {
  const img = e.target;
  if (img.tagName !== 'IMG' || !img.dataset.name) return;
  const h = hue(img.dataset.name);
  const ph = document.createElement('div');
  ph.className = 'ph';
  ph.style.background = `linear-gradient(140deg,hsl(${h} 62% 62%),hsl(${(h + 48) % 360} 60% 44%))`;
  ph.textContent = initials(img.dataset.name);
  img.replaceWith(ph);
}, true);

function card(item, i = 0) {
  const s = STATUS[item.status] || STATUS.design;
  const cat = (data.cats.find(c => c.id === item.cat) || {}).title || '';
  const sub = item.sub ? (SUBTYPE[item.sub] || item.sub) : '';
  const links = item.links.map((l, n) =>
    `<a class="btn btn-sm ${n ? '' : 'btn-primary'}" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)} ${I('arrow-ur', 'i-sm i-go')}</a>`).join('');
  return `<article class="card work reveal" style="--i:${Math.min(i, 10)}">
    <div class="thumb">
      <img src="${esc((window.localThumbs || {})[item.id] || 'thumbs/' + item.id + '.jpg')}" data-name="${esc(item.name)}" alt="${esc(item.name)}" loading="lazy">
      <span class="badge" style="--status-c:${s.c}">${I(s.icon)}${s.label}</span>
    </div>
    <div class="work-body">
      <div><h3 class="work-title">${esc(item.name)}</h3><div class="work-sub">${esc(cat)}</div></div>
      <div class="work-meta">${sub ? `<span>${I('tag')}${esc(sub)}</span>` : ''}<span>${I('link')}${item.links.length} link${item.links.length > 1 ? 's' : ''}</span></div>
      <div class="work-actions">${links}${window.ADMIN ? `<button class="btn btn-sm btn-icon btn-ghost" data-edit="${esc(item.id)}" aria-label="Edit ${esc(item.name)}" title="Edit">${I('pen', 'i-sm')}</button>` : ''}</div>
    </div></article>`;
}
const grid = items => `<div class="grid">${items.map(card).join('') ||
  `<div class="empty"><div class="ic-circle">${I('inbox', 'i-lg')}</div><b>Nothing matches</b><span>Try a different filter or search term.</span></div>`}</div>`;

function renderNav(route) {
  const count = id => data.items.filter(i => i.cat === id).length;
  const link = (href, icon, text, badge = '') =>
    `<li><a class="nav-link ${route === href ? 'active' : ''}" href="#/${href}">${I(icon)}<span>${esc(text)}</span>${badge}</a></li>`;
  nav.innerHTML = link('dashboard', 'grid', 'Dashboard') +
    data.cats.map(c => link(c.id, iconOf(c), c.title, `<span class="count">${count(c.id)}</span>`)).join('') +
    link('resources', 'tools', 'Resources');
  if (window.adminNav) adminNav();
  document.body.classList.remove('sb-open');
}

// Animated number count-up + bar growth
function animate() {
  document.querySelectorAll('[data-count]').forEach(el => {
    const to = +el.dataset.count, t0 = performance.now(), d = 900;
    const step = t => { const p = Math.min((t - t0) / d, 1); el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
  requestAnimationFrame(() => requestAnimationFrame(() =>
    document.querySelectorAll('.fill[data-w]').forEach(f => f.style.width = f.dataset.w + '%')));
}
const page = html => { view.innerHTML = html; view.classList.remove('view-in'); void view.offsetWidth; view.classList.add('view-in'); };

function dashboard() {
  const items = data.items, n = k => items.filter(i => i.status === k).length, total = items.length || 1;
  const stats = [['Total designs', items.length, 'layers'], ['Live', n('live'), 'live'], ['Converted', n('converted'), 'check'], ['In conversion', n('progress'), 'clock']];
  page(`
    <section class="hero reveal">
      <div class="hero-grid"></div>
      <span class="eyebrow">${esc(data.profile.role)}</span>
      <h1>${esc(data.profile.name)}</h1>
      <p>${esc(data.profile.tagline)}</p>
      <a class="btn" href="#/${esc(data.cats[0] ? data.cats[0].id : 'resources')}">Explore work ${I('arrow-r', 'i-sm')}</a>
    </section>
    <div class="stats">${stats.map(([l, v, ic], k) => `
      <div class="card stat reveal ${k === 0 ? 'feature' : ''}" style="--i:${k + 1}">
        <div class="stat-top"><span>${l}</span><div class="ic-circle">${I(ic)}</div></div>
        <div class="stat-num" data-count="${v}">0</div></div>`).join('')}</div>
    <div class="split">
      <div class="card card-pad reveal" style="--i:5">
        <h2 class="card-title">Work status</h2>
        <div class="bars">${Object.entries(STATUS).map(([k, s]) => `<div class="bar-row">
          <span class="lbl"><i class="dot" style="color:${s.c}"></i>${s.label}</span>
          <div class="track"><div class="fill ${s.cls}" data-w="${n(k) / total * 100}"></div></div>
          <span class="val">${n(k)}</span></div>`).join('')}</div>
      </div>
      <div class="card card-pad reveal" style="--i:6">
        <h2 class="card-title">Sections</h2>
        <div class="list">${data.cats.map(c => `
          <a href="#/${c.id}" class="list-row">
            <div class="ic-circle">${I(iconOf(c))}</div>
            <div class="grow"><b>${esc(c.title)}</b><small>${esc(c.desc)}</small></div>
            <span class="num">${items.filter(i => i.cat === c.id).length}</span>
            <span class="go">${I('arrow-ur', 'i-sm')}</span></a>`).join('')}</div>
      </div>
    </div>
    <div class="section-head"><h2>Latest added</h2></div>${grid(items.slice(-8).reverse())}`);
  animate();
}

function section(id) {
  const cat = data.cats.find(c => c.id === id), list = data.items.filter(i => i.cat === id);
  const subs = [...new Set(list.map(i => i.sub).filter(Boolean))];
  page(`<div class="page-head"><h1>${esc(cat.title)}</h1>
    <p>${esc(cat.desc)} · <span id="cnt"></span></p></div>
    <div class="filters" id="chips"></div><div id="g"></div>`);
  redraw = () => {
    const q = $('#q').value.toLowerCase();
    const r = list.filter(i => (filter.status === 'all' || i.status === filter.status) && (filter.sub === 'all' || i.sub === filter.sub) && i.name.toLowerCase().includes(q));
    $('#g').innerHTML = grid(r); $('#cnt').textContent = r.length + ' shown';
    const chip = (k, v, l) => `<button class="chip ${filter[k] === v ? 'active' : ''}" data-k="${k}" data-v="${v}">${l}</button>`;
    $('#chips').innerHTML = chip('status', 'all', 'All status') + Object.entries(STATUS).map(([k, s]) => chip('status', k, s.label)).join('') +
      (subs.length ? '<span class="chip-sep"></span>' + chip('sub', 'all', 'All types') + subs.map(s => chip('sub', s, SUBTYPE[s] || s)).join('') : '');
    document.querySelectorAll('.chip').forEach(b => b.onclick = () => { filter[b.dataset.k] = b.dataset.v; redraw(); });
  };
  redraw();
}

function resources() {
  const R = data.resources;
  page(`<div class="page-head"><h1>Resources</h1><p>Portfolio GIF workflow and handy tools</p></div>
    <div class="split"><div class="card card-pad reveal">
      <h2 class="card-title">GIF making process</h2>
      <ol class="steps">${R.steps.map(s => { const st = typeof s === 'string' ? { text: s } : s;
        return `<li><div>${esc(st.text)}${st.video ? `<div><a class="btn btn-sm" href="${esc(st.video)}" target="_blank" rel="noopener">${I('play', 'i-sm')}Watch video</a></div>` : ''}</div></li>`; }).join('')}</ol></div>
    <div class="card card-pad reveal" style="--i:2"><h2 class="card-title">Tools</h2>
      <div class="list">${R.links.map(l => `<a class="list-row" href="${esc(l.u)}" target="_blank" rel="noopener">
        <div class="ic-circle">${I('link')}</div>
        <div class="grow"><b>${esc(l.t)}</b><small>${esc(l.d)}</small></div><span class="go">${I('arrow-ur', 'i-sm')}</span></a>`).join('')}</div>
    </div></div>`);
}

function route() {
  applySettings();
  const r = location.hash.replace('#/', '') || 'dashboard';
  filter = { status: 'all', sub: 'all' }; redraw = null; $('#q').value = '';
  const known = r === 'resources' || data.cats.some(c => c.id === r);
  renderNav(known ? r : 'dashboard'); scrollTo(0, 0);
  if (r === 'resources') resources(); else if (known) section(r); else dashboard();
  if (window.onRendered) onRendered(known ? r : 'dashboard');
}

$('#q').addEventListener('input', () => {
  if (redraw) return redraw();
  const q = $('#q').value.toLowerCase().trim();
  if (!q) return route();
  page(`<div class="page-head"><h1>Search</h1><p>Results for “${esc(q)}”</p></div>` +
    grid(data.items.filter(i => i.name.toLowerCase().includes(q))));
});

// Drawer (mobile) + "/" to focus search
window.setDrawer = open => document.body.classList.toggle('sb-open', open);
$('#menuBtn').onclick = () => setDrawer(true);
$('#sbClose').onclick = $('#scrim').onclick = () => setDrawer(false);
addEventListener('keydown', e => {
  if (e.key === 'Escape') setDrawer(false);
  if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); $('#q').focus(); }
});

if (!window.SITE_DATA) {
  view.innerHTML = '<div class="card card-pad" style="color:var(--danger-fg)">Could not load data/data.js. Keep the folder structure intact: index.html must sit next to the css, js and data folders.</div>';
} else {
  data = window.SITE_DATA;
  $('#brandName').textContent = data.profile.name; $('#sbName').textContent = data.profile.name;
  $('#sbRole').textContent = data.profile.role;
  addEventListener('hashchange', route); addEventListener('themechange', applySettings); route();
}
