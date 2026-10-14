import { useStore, setUi } from './store.js';

// Font families installed on this computer (asked once, then cached). If the
// system list isn't available, a short list of common fonts is offered.

const COMMON = [
  'Arial', 'Bahnschrift', 'Calibri', 'Cambria', 'Candara', 'Consolas', 'Constantia', 'Corbel',
  'Courier New', 'Franklin Gothic Medium', 'Georgia', 'Impact', 'Lucida Sans Unicode', 'Palatino Linotype',
  'Segoe UI', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana',
];

let cache = null;

export async function listFonts() {
  if (cache) return cache;
  try {
    if (window.queryLocalFonts) {
      // Never wait forever for the system: after 3 s, use the common list.
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000));
      const fonts = await Promise.race([window.queryLocalFonts(), timeout]);
      const families = [...new Set(fonts.map((f) => f.family))].sort((a, b) => a.localeCompare(b));
      if (families.length) {
        cache = families;
        return cache;
      }
    }
  } catch {
    // Permission refused or not supported: fall back to the common list.
  }
  cache = COMMON;
  return cache;
}

export const MAX_FONTS = 3;

// Fills the font suggestions the first time a font field is used (asking the
// system for its fonts needs a click from the person).
export function loadFontList() {
  if (useStore.getState().ui.fontList?.length) return;
  listFonts().then((fontList) => setUi({ fontList }));
}
