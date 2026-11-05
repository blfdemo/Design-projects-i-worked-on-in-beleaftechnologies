// Header "Admin" button. Signing in turns on admin mode (edit buttons, new project, settings) on this same site.
(() => {
  const $ = s => document.querySelector(s);
  const sha = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('');
  const on = sessionStorage.getItem('ok') === '1';
  window.ADMIN = on;
  const btn = $('#adminBtn'), dlg = $('#adminModal');
  const paint = () => {
    btn.innerHTML = on ? `${I('logout')}<span class="btn-label-lg">Sign out</span>` : `${I('shield')}<span class="btn-label-lg">Admin</span>`;
    btn.classList.toggle('btn-danger', on);
  };
  addEventListener('DOMContentLoaded', paint); if (document.readyState !== 'loading') paint();
  btn.addEventListener('click', () => {
    if (on) { sessionStorage.removeItem('ok'); location.reload(); }
    else { dlg.showModal(); $('#au').focus(); }
  });
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
  $('#adminClose').addEventListener('click', () => dlg.close());
  $('#adminForm').addEventListener('submit', async e => {
    e.preventDefault();
    if (!AUTH_HASH) { $('#ae').textContent = 'Admin login is not set up yet.'; return; }
    if (await sha('v1|' + $('#au').value.trim() + '|' + $('#ap').value) === AUTH_HASH) { sessionStorage.setItem('ok', '1'); location.reload(); }
    else $('#ae').textContent = 'Wrong username or password.';
  });
})();
