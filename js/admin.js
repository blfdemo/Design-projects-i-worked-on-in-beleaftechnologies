// Admin mode: runs only after signing in. Adds Edit buttons, New project, sections and Site settings.
// Every change is committed to your GitHub repo (data/data.js, thumbs/, assets/) through the GitHub API.
(() => {
  if (!window.ADMIN) return;
  const PICK = ['layers', 'refresh', 'building', 'palette', 'grid', 'rocket', 'globe', 'phone', 'cart', 'bank', 'cpu', 'star', 'folder'];
  const SWATCHES = ['#0e8a4e', '#16a34a', '#0d9488', '#2563eb', '#1d4ed8', '#0284c7', '#7c3aed', '#e11d48'];
  const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const b64 = s => btoa(unescape(encodeURIComponent(s)));
  const wrap = o => '// Site content. Edited automatically by the admin tool.\nwindow.SITE_DATA = ' + JSON.stringify(o, null, 1) + ';\n';
  const GH = () => JSON.parse(localStorage.getItem('gh') || '{}');
  const modal = id => { const d = document.getElementById(id); return { show: () => d.showModal(), hide: () => d.close() }; };
  window.localThumbs = {};
  let thumb = null, editing = null, editingSec = null, curRoute = 'dashboard', saved = false, orig = '';

  // ---------- GitHub API ----------
  async function gh(path, opt = {}) {
    const g = GH();
    if (!g.t || !g.o || !g.r) { const e = Error('Connect GitHub first (Site settings → GitHub connection).'); e.nogh = true; throw e; }
    const r = await fetch(`https://api.github.com/repos/${g.o}/${g.r}/contents/${path}${opt.method ? '' : '?ref=' + (g.b || 'main')}`,
      { ...opt, headers: { Authorization: 'Bearer ' + g.t, Accept: 'application/vnd.github+json' } });
    if (!r.ok && r.status !== 404) throw Error('GitHub ' + r.status + ': ' + (await r.json()).message);
    return r;
  }
  async function putFile(path, content, message, sha) {
    if (sha === undefined) { const r = await gh(path); sha = r.status === 404 ? undefined : (await r.json()).sha; }
    const body = { message, content, branch: GH().b || 'main' }; if (sha) body.sha = sha;
    const r = await gh(path, { method: 'PUT', body: JSON.stringify(body) });
    if (!r.ok) throw Error('Could not save ' + path + ' (' + r.status + ')');
  }
  async function delFile(path, message) {
    try { const r = await gh(path); if (r.status === 404) return; await gh(path, { method: 'DELETE', body: JSON.stringify({ message, sha: (await r.json()).sha, branch: GH().b || 'main' }) }); } catch { /* best effort */ }
  }
  async function fetchRemote() {
    const r = await gh('data/data.js'); if (r.status === 404) throw Error('data/data.js not found in the repo.');
    const j = await r.json(), t = decodeURIComponent(escape(atob(j.content.replace(/\n/g, ''))));
    return { obj: JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)), sha: j.sha };
  }
  // Apply a change to the latest remote data, upload extra files, commit data.js, refresh the page view.
  async function publish(fn, message, files = []) {
    const rem = await fetchRemote(); fn(rem.obj);
    for (const f of (typeof files === 'function' ? files() : files)) await putFile(f.path, f.b64, message);
    await putFile('data/data.js', b64(wrap(rem.obj)), message, rem.sha);
    data = rem.obj; route();
  }

  // ---------- UI helpers ----------
  const toastBox = document.createElement('div'); document.body.appendChild(toastBox);
  function toast(t, kind = 'success') {
    toastBox.innerHTML = `<div class="toast ${kind}">${I(kind === 'danger' ? 'x' : 'check')}<span>${esc(t)}</span></div>`;
    clearTimeout(toast.t); toast.t = setTimeout(() => toastBox.innerHTML = '', kind === 'danger' ? 8000 : 3500);
  }
  async function busy(btn, errId, fn) {
    const html = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spin"></span>Working…'; $('#' + errId).textContent = '';
    try { await fn(); }
    catch (e) {
      $('#' + errId).textContent = e.message;
      if (e.nogh) { document.querySelectorAll('dialog[open]').forEach(m => m.close()); setTimeout(openSettings, 350); }
    } finally { btn.disabled = false; btn.innerHTML = html; }
  }
  function linkRow(box, l = '', u = '') {
    const d = document.createElement('div'); d.className = 'link-row';
    d.innerHTML = `<input class="input" placeholder="Label"><input class="input" placeholder="https://…"><button type="button" class="btn btn-icon btn-sm btn-danger" aria-label="Remove link">${I('x', 'i-sm')}</button>`;
    const [a, b] = d.querySelectorAll('input'); a.value = l; b.value = u; d.querySelector('button').onclick = () => d.remove(); box.appendChild(d);
  }
  const readLinks = box => [...box.querySelectorAll('.link-row')].map(r => { const [a, b] = r.querySelectorAll('input'); return { label: a.value.trim() || 'Link', url: b.value.trim() }; }).filter(l => l.url);
  function loadImg(file) {
    return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(Error('That file is not a supported image.')); i.src = URL.createObjectURL(file); });
  }
  async function toThumb(file) {   // any image -> 640x482 JPG, white behind transparency
    const i = await loadImg(file), c = document.createElement('canvas'); c.width = 640; c.height = 482;
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 640, 482);
    const w0 = i.naturalWidth || 640, h0 = i.naturalHeight || 482, s = Math.max(640 / w0, 482 / h0);
    x.drawImage(i, (640 - w0 * s) / 2, (482 - h0 * s) / 2, w0 * s, h0 * s);
    return c.toDataURL('image/jpeg', .85);
  }
  async function toAvatar(file) {  // centre-crop to a 256x256 JPG
    const i = await loadImg(file), c = document.createElement('canvas'); c.width = c.height = 256;
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 256, 256);
    const w0 = i.naturalWidth || 256, h0 = i.naturalHeight || 256, s = Math.max(256 / w0, 256 / h0);
    x.drawImage(i, (256 - w0 * s) / 2, (256 - h0 * s) / 2, w0 * s, h0 * s);
    return c.toDataURL('image/jpeg', .88);
  }
  async function toLogo(file) {    // keep transparency, max 120px tall PNG
    const i = await loadImg(file), h0 = i.naturalHeight || 120, w0 = i.naturalWidth || 120, h = Math.min(120, h0), w = Math.round(w0 * h / h0);
    const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(i, 0, 0, w, h);
    return c.toDataURL('image/png');
  }

  // ---------- Dialogs ----------
  const F = (t, inner, id = '') => `<div class="field"${id ? ` id="${id}"` : ''}><label>${t}</label>${inner}</div>`;
  const logoPv = (id, bg) => `<div class="logo-pv ${bg}"><img id="${id}Pv" class="d-none" alt=""><span id="${id}No">No logo – ${bg === 'dark' ? 'light logo is used' : 'text icon is used'}</span><label class="check d-none" id="${id}RmW"><input type="checkbox" id="${id}Rm">Remove</label></div>`;
  const head = (icon, title, tid) => `<div class="dlg-head"><div class="ic-circle">${I(icon)}</div><h2 id="${tid}">${title}</h2><button class="btn btn-icon btn-sm ml-auto" type="button" data-close aria-label="Close">${I('x')}</button></div>`;
  document.body.insertAdjacentHTML('beforeend', `
  <dialog id="projModal"><div class="card dialog-card dlg">
    ${head('plus', '', 'pTitle')}
    <div class="dlg-body">
      <div class="grid-3">
        ${F('Section', '<select id="pCat" class="input"></select>')}
        ${F('Status', '<select id="pSt" class="input"><option value="live">Live</option><option value="converted">Converted</option><option value="progress">In conversion</option><option value="design">Design only</option></select>')}
        ${F('Type', '<select id="pSub" class="input"><option value="">—</option><option value="client">Client</option><option value="company">Company</option><option value="demo">Demo</option><option value="partial">Partial</option><option value="ai">AI Demo</option></select>', 'pSubWrap')}
      </div>
      ${F('Project name', '<input id="pName" class="input" placeholder="e.g. Crypto Wallet App">')}
      ${F('Links', '<div id="pLinks" class="stack" style="gap:10px"></div><button type="button" id="pAddLink" class="btn btn-sm btn-ghost" style="align-self:flex-start;margin-top:4px">' + I('plus', 'i-sm') + 'Add link</button>')}
      ${F('Thumbnail <span id="pReq" class="req"></span> <span class="muted" style="font-weight:400">– any image, auto-resized to 640×482</span>', '<input id="pFile" type="file" accept="image/*" class="input"><div class="thumbs-row"><img id="pCur" class="d-none" alt=""><img id="pNew" class="d-none" alt=""></div>')}
      <div id="pErr" class="err"></div>
    </div>
    <div class="dlg-foot"><button id="pDel" class="btn btn-danger del d-none">${I('trash', 'i-sm')}Delete</button><button class="btn ml-auto" data-close>Cancel</button><button id="pSave" class="btn btn-primary">Publish</button></div>
  </div></dialog>

  <dialog id="secModal"><div class="card dialog-card dlg sm">
    ${head('folder-plus', '', 'sTitleH')}
    <div class="dlg-body">
      ${F('Section name (shown in the sidebar)', '<input id="sName" class="input" placeholder="e.g. Mobile Apps">')}
      ${F('Short description', '<input id="sDesc" class="input" placeholder="One line about this section">')}
      ${F('Icon', '<select id="sIcon" class="input"></select>')}
      <div id="sErr" class="err"></div>
    </div>
    <div class="dlg-foot"><button id="sDel" class="btn btn-danger del d-none">${I('trash', 'i-sm')}Delete section</button><button class="btn ml-auto" data-close>Cancel</button><button id="sSave" class="btn btn-primary">Save section</button></div>
  </div></dialog>

  <dialog id="setModal"><div class="card dialog-card dlg">
    ${head('sliders', 'Site settings', 'stTitle')}
    <div class="dlg-body">
      <section class="section-box"><h3 class="sec-title">Branding</h3>
        <div class="grid-2">${F('Site / your name', '<input id="stName" class="input">')}${F('Role', '<input id="stRole" class="input">')}</div>
        ${F('Tagline (dashboard banner)', '<input id="stTag" class="input">')}
        ${F('Primary colour', '<input id="stColor" type="color" class="input"><div class="swatches" id="stSw"></div>')}
        ${F('Profile photo <span class="muted" style="font-weight:400">– square crop, shown at the bottom of the sidebar (same photo in light &amp; dark)</span>',
            '<input id="stAvatar" type="file" accept="image/*" class="input"><div class="row" style="margin-top:6px"><img id="stAvatarPv" class="avatar-pv d-none" alt=""><span id="stAvatarNo" class="hint">Using initials</span><label class="check d-none" id="stAvatarRmW"><input type="checkbox" id="stAvatarRm">Remove photo</label></div>')}
        <div class="grid-2">
          ${F('Logo – light theme <span class="muted" style="font-weight:400">(PNG/SVG, transparent)</span>', '<input id="stLogo" type="file" accept="image/*" class="input">' + logoPv('stLogo', 'light'))}
          ${F('Logo – dark theme <span class="muted" style="font-weight:400">(optional, e.g. white version)</span>', '<input id="stLogoDk" type="file" accept="image/*" class="input">' + logoPv('stLogoDk', 'dark'))}
        </div>
      </section>
      <section class="section-box"><h3 class="sec-title">Footer</h3>
        ${F('Footer text', '<input id="stFootTxt" class="input" placeholder="© 2026 Your Name. All rights reserved.">')}
        ${F('Footer links (LinkedIn, Behance, email…)', '<div id="stFoot" class="stack" style="gap:10px"></div><button type="button" id="stAddFoot" class="btn btn-sm btn-ghost" style="align-self:flex-start;margin-top:4px">' + I('plus', 'i-sm') + 'Add link</button>')}
      </section>
      <section class="section-box"><h3 class="sec-title">GitHub connection</h3>
        <p class="hint">Needed to publish changes. Token is stored in this browser only (fine-grained token, <b>Contents: Read &amp; write</b> on this repo).</p>
        <div class="grid-2"><input id="gO" class="input" placeholder="GitHub username"><input id="gR" class="input" placeholder="Repo name"><input id="gB" class="input" placeholder="Branch (main)"><input id="gT" type="password" class="input" placeholder="github_pat_…"></div>
      </section>
      <div id="stErr" class="err"></div>
    </div>
    <div class="dlg-foot"><button class="btn ml-auto" data-close>Cancel</button><button id="stSave" class="btn btn-primary">Save &amp; publish</button></div>
  </div></dialog>`);
  document.body.insertAdjacentHTML('beforeend', `<button class="btn btn-primary fab" data-act="newProject">${I('plus')}New project</button>`);
  document.querySelectorAll('dialog[id$="Modal"]:not(#adminModal)').forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));
  document.addEventListener('click', e => { const c = e.target.closest('[data-close]'); if (c) c.closest('dialog').close(); });

  // ---------- Project ----------
  const syncSub = () => $('#pSubWrap').classList.toggle('d-none', $('#pCat').value !== 'projects');
  $('#pCat').onchange = syncSub; $('#pAddLink').onclick = () => linkRow($('#pLinks'));
  $('#pFile').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { thumb = await toThumb(f); $('#pNew').src = thumb; $('#pNew').classList.remove('d-none'); } catch (x) { $('#pErr').textContent = x.message; }
  };
  function openProject(id) {
    const it = id && data.items.find(i => i.id === id); editing = it ? it.id : null; thumb = null;
    $('#pCat').innerHTML = data.cats.map(c => `<option value="${esc(c.id)}">${esc(c.title)}</option>`).join('');
    $('#pCat').value = it ? it.cat : (data.cats.some(c => c.id === curRoute) ? curRoute : data.cats[0].id);
    $('#pTitle').textContent = it ? 'Edit project' : 'New project';
    $('#pSt').value = it ? it.status : 'design'; $('#pSub').value = (it && it.sub) || ''; $('#pName').value = it ? it.name : '';
    $('#pLinks').innerHTML = ''; (it ? it.links : [{ label: 'Figma', url: '' }]).forEach(l => linkRow($('#pLinks'), l.label, l.url));
    $('#pFile').value = ''; $('#pNew').classList.add('d-none'); $('#pCur').classList.add('d-none');
    if (it) { const c = $('#pCur'); c.onload = () => c.classList.remove('d-none'); c.onerror = () => c.classList.add('d-none'); c.src = localThumbs[it.id] || 'thumbs/' + it.id + '.jpg'; }
    $('#pReq').textContent = it ? '(optional – choose a file to replace)' : '* required'; $('#pReq').className = it ? 'muted' : 'req';
    $('#pDel').classList.toggle('d-none', !it); $('#pSave').textContent = it ? 'Save changes' : 'Publish project'; $('#pErr').textContent = ''; syncSub(); modal('projModal').show();
  }
  $('#pSave').onclick = e => busy(e.currentTarget, 'pErr', async () => {
    const name = $('#pName').value.trim(), cat = $('#pCat').value, links = readLinks($('#pLinks'));
    if (!name || !links.length) throw Error('Add a name and at least one link.');
    if (!editing && !thumb) throw Error('Please upload a thumbnail image.');
    let id = editing;
    await publish(d => {
      const f = { cat, name, sub: cat === 'projects' ? $('#pSub').value : '', status: $('#pSt').value, links };
      if (editing) { const it = d.items.find(i => i.id === editing); if (!it) throw Error('This project no longer exists.'); Object.assign(it, f); }
      else { const base = slug(name) || 'item'; id = base; let n = 2; while (d.items.some(i => i.id === id)) id = base + '-' + n++; d.items.push({ id, ...f }); }
    }, (editing ? 'Edit: ' : 'Add: ') + name, () => { if (!thumb) return []; localThumbs[id] = thumb; return [{ path: 'thumbs/' + id + '.jpg', b64: thumb.split(',')[1] }]; });
    modal('projModal').hide(); toast(editing ? 'Saved. The live site updates in about a minute.' : 'Project published. The live site updates in about a minute.');
    if (location.hash !== '#/' + cat) location.hash = '#/' + cat;
  });
  $('#pDel').onclick = e => {
    if (!confirm('Delete this project?')) return;
    busy(e.currentTarget, 'pErr', async () => {
      const id = editing; await publish(d => { d.items = d.items.filter(i => i.id !== id); }, 'Remove: ' + id);
      await delFile('thumbs/' + id + '.jpg', 'Remove thumbnail: ' + id); modal('projModal').hide(); toast('Project deleted.');
    });
  };

  // ---------- Section ----------
  $('#sIcon').innerHTML = PICK.map(i => `<option value="${i}">${i}</option>`).join('');
  function openSection(id) {
    const c = id && data.cats.find(x => x.id === id); editingSec = c ? c.id : null;
    $('#sTitleH').textContent = c ? 'Edit section' : 'Add section';
    $('#sName').value = c ? c.title : ''; $('#sDesc').value = c ? c.desc : ''; $('#sIcon').value = c ? iconOf(c) : 'folder';
    $('#sDel').classList.toggle('d-none', !c); $('#sErr').textContent = ''; modal('secModal').show();
  }
  $('#sSave').onclick = e => busy(e.currentTarget, 'sErr', async () => {
    const title = $('#sName').value.trim(); if (!title) throw Error('Give the section a name.');
    let id = editingSec; const f = { title, desc: $('#sDesc').value.trim(), icon: $('#sIcon').value };
    await publish(d => {
      if (editingSec) Object.assign(d.cats.find(c => c.id === editingSec), f);
      else { const base = slug(title) || 'section'; id = base; let n = 2; while (d.cats.some(c => c.id === id) || id === 'dashboard' || id === 'resources') id = base + '-' + n++; d.cats.push({ id, ...f }); }
    }, (editingSec ? 'Edit section: ' : 'Add section: ') + title);
    modal('secModal').hide(); toast('Section saved.'); location.hash = '#/' + id;
  });
  $('#sDel').onclick = e => {
    if (!confirm('Delete this section?')) return;
    busy(e.currentTarget, 'sErr', async () => {
      const id = editingSec;
      await publish(d => { if (d.items.some(i => i.cat === id)) throw Error('Move or delete this section\'s projects first.'); d.cats = d.cats.filter(c => c.id !== id); }, 'Remove section: ' + id);
      modal('secModal').hide(); toast('Section deleted.'); location.hash = '#/dashboard';
    });
  };

  // ---------- Site settings ----------
  const setColor = v => { $('#stColor').value = v; data.settings = { ...cfg(), brand: v }; applySettings(); };   // live preview
  $('#stSw').innerHTML = SWATCHES.map(c => `<button type="button" class="swatch" style="background:${c}" data-c="${c}" aria-label="Use ${c}"></button>`).join('');
  $('#stSw').onclick = e => { const b = e.target.closest('[data-c]'); if (b) setColor(b.dataset.c); };
  $('#stAddFoot').onclick = () => linkRow($('#stFoot'));
  $('#stColor').oninput = e => setColor(e.target.value);
  // Image slots: light logo, dark logo, avatar. val = newly chosen image (data URL), rm = remove flag.
  const SL = {
    logo:     { id: 'stLogo',   file: 'assets/logo.png',      local: 'localLogo',     conv: toLogo },
    logoDark: { id: 'stLogoDk', file: 'assets/logo-dark.png', local: 'localLogoDark', conv: toLogo },
    avatar:   { id: 'stAvatar', file: 'assets/avatar.jpg',    local: 'localAvatar',   conv: toAvatar },
  };
  const curOf = k => window[SL[k].local] !== undefined ? window[SL[k].local] : cfg()[k];
  function paintSlot(k) {
    const S = SL[k], src = S.rm ? '' : (S.val || curOf(k));
    $('#' + S.id + 'Pv').classList.toggle('d-none', !src); if (src) $('#' + S.id + 'Pv').src = src;
    $('#' + S.id + 'No').classList.toggle('d-none', !!src);
    $('#' + S.id + 'RmW').classList.toggle('d-none', !(S.val || curOf(k)));
  }
  Object.keys(SL).forEach(k => {
    const S = SL[k];
    $('#' + S.id).onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      try { S.val = await S.conv(f); S.rm = false; $('#' + S.id + 'Rm').checked = false; paintSlot(k); } catch (x) { $('#stErr').textContent = x.message; }
    };
    $('#' + S.id + 'Rm').onchange = e => { S.rm = e.target.checked; paintSlot(k); };
  });
  document.getElementById('setModal').addEventListener('close', () => { if (!saved) { data.settings = JSON.parse(orig); applySettings(); } });
  function openSettings() {
    const s = cfg(), g = GH(); saved = false; orig = JSON.stringify(data.settings || {}); Object.values(SL).forEach(S => { S.val = null; S.rm = false; });
    $('#stName').value = data.profile.name; $('#stRole').value = data.profile.role; $('#stTag').value = data.profile.tagline;
    $('#stColor').value = s.brand;
    Object.keys(SL).forEach(k => { $('#' + SL[k].id).value = ''; $('#' + SL[k].id + 'Rm').checked = false; paintSlot(k); });
    $('#stFootTxt').value = s.footerText; $('#stFoot').innerHTML = ''; s.footerLinks.forEach(l => linkRow($('#stFoot'), l.label, l.url));
    $('#gO').value = g.o || ''; $('#gR').value = g.r || ''; $('#gB').value = g.b || 'main'; $('#gT').value = g.t || '';
    $('#stErr').textContent = ''; modal('setModal').show();
  }
  $('#stSave').onclick = e => busy(e.currentTarget, 'stErr', async () => {
    localStorage.setItem('gh', JSON.stringify({ o: $('#gO').value.trim(), r: $('#gR').value.trim(), b: $('#gB').value.trim() || 'main', t: $('#gT').value.trim() }));
    const had = Object.fromEntries(Object.keys(SL).map(k => [k, !!cfg()[k]]));
    await publish(d => {
      d.profile = { ...d.profile, name: $('#stName').value.trim() || d.profile.name, role: $('#stRole').value.trim(), tagline: $('#stTag').value.trim() };
      const s = { ...(d.settings || {}), brand: $('#stColor').value, footerText: $('#stFootTxt').value.trim(), footerLinks: readLinks($('#stFoot')) };
      Object.keys(SL).forEach(k => { const S = SL[k]; if (S.rm) { s[k] = ''; window[S.local] = ''; } else if (S.val) { s[k] = S.file + '?v=' + Date.now(); window[S.local] = S.val; } });
      d.settings = s;
    }, 'Update site settings', () => Object.values(SL).filter(S => S.val && !S.rm).map(S => ({ path: S.file, b64: S.val.split(',')[1] })));
    for (const k of Object.keys(SL)) if (SL[k].rm && had[k]) await delFile(SL[k].file, 'Remove ' + k);
    saved = true; modal('setModal').hide(); toast('Settings published. The live site updates in about a minute.');
  });

  // ---------- Hooks used by app.js ----------
  const abtn = (a, i, t, c = '') => `<button class="btn btn-sm ${c}" data-act="${a}">${I(i, 'i-sm')}${t}</button>`;
  window.adminNav = () => nav.insertAdjacentHTML('beforeend', `
    <li class="nav-sep"><span class="eyebrow">Admin</span>
      <button class="nav-link nav-btn" data-act="newSection">${I('folder-plus')}Add section</button>
      <button class="nav-link nav-btn" data-act="settings">${I('sliders')}Site settings</button></li>`);
  window.onRendered = r => {
    curRoute = r; let bar = '';
    if (r === 'dashboard') bar = abtn('newProject', 'plus', 'New project', 'btn-primary') + abtn('newSection', 'folder-plus', 'Add section') + abtn('settings', 'sliders', 'Site settings');
    else if (data.cats.some(c => c.id === r)) bar = abtn('newProject', 'plus', 'New project here', 'btn-primary') + abtn('editSection', 'pen', 'Edit section');
    if (bar) view.insertAdjacentHTML('afterbegin', `<div class="admin-bar"><span class="tag">${I('shield', 'i-sm')}Admin mode</span>${bar}</div>`);
  };
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-act],[data-edit]'); if (!b) return;
    setDrawer(false);
    if (b.dataset.edit) return openProject(b.dataset.edit);
    ({ newProject: () => openProject(), newSection: () => openSection(), editSection: () => openSection(curRoute), settings: openSettings })[b.dataset.act]?.();
  });

  route();   // re-render now that admin hooks exist
  if (GH().t) fetchRemote().then(r => { data = r.obj; route(); }).catch(() => { });   // always show the latest saved data
})();
