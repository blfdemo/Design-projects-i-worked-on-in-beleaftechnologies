// Light/dark theme (data-theme on <html>). Loaded in <head> so there is no flash.
(() => {
  const root = document.documentElement, KEY = 'theme';
  const get = () => { try { return localStorage.getItem(KEY); } catch (e) { return null; } };
  const pref = () => get() || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const paint = t => { const b = document.getElementById('themeBtn'); if (b && window.I) b.innerHTML = I(t === 'dark' ? 'sun' : 'moon'); };
  const apply = t => { root.setAttribute('data-theme', t); paint(t); dispatchEvent(new Event('themechange')); };
  apply(pref());
  addEventListener('DOMContentLoaded', () => {
    apply(pref());
    const b = document.getElementById('themeBtn');
    if (b) b.addEventListener('click', () => {
      const t = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(KEY, t); } catch (e) {}
      apply(t);
    });
  });
})();
