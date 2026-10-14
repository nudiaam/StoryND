import { useStore, setUi } from './store.js';

// Light / dark appearance. Follows Windows until the person picks one; the
// choice is remembered on this computer.
const KEY = 'sb-theme';
const media = window.matchMedia('(prefers-color-scheme: dark)');

function readPref() {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

function apply(theme) {
  document.documentElement.dataset.theme = theme;
  if (useStore.getState().ui.theme !== theme) setUi({ theme });
}

export function initTheme() {
  const pref = readPref();
  apply(pref === 'light' || pref === 'dark' ? pref : media.matches ? 'dark' : 'light');
  media.addEventListener('change', (e) => {
    if (!readPref()) apply(e.matches ? 'dark' : 'light');
  });
}

export function toggleTheme() {
  const next = useStore.getState().ui.theme === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem(KEY, next); } catch { /* not remembered, still applied */ }
  apply(next);
}
