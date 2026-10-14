// Rich text for notes, big texts and the texts inside zones: bold, italic
// and text colours (like Notion). Only those survive; anything else pasted in is reduced to text.

const ALLOWED = new Set(['B', 'STRONG', 'I', 'EM', 'SPAN', 'BR', 'DIV', 'P']);
const STYLE_KEEP = ['color', 'background-color', 'font-weight', 'font-style'];

const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const textToHtml = (text) => escapeHtml(text || '').replace(/\n/g, '<br>');

function clean(node, doc) {
  for (const child of [...node.childNodes]) {
    if (child.nodeType === 3) continue;
    if (child.nodeType !== 1 || !ALLOWED.has(child.tagName)) {
      // Keep the words, drop the unknown wrapper.
      const text = doc.createTextNode(child.textContent || '');
      node.replaceChild(text, child);
      continue;
    }
    const style = child.getAttribute('style') || '';
    for (const attr of [...child.attributes]) child.removeAttribute(attr.name);
    const kept = style.split(';').map((d) => d.trim()).filter((d) => STYLE_KEEP.some((k) => d.toLowerCase().startsWith(k + ':')));
    if (kept.length) child.setAttribute('style', kept.join('; '));
    clean(child, doc);
  }
}

export function sanitize(html) {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstChild;
  clean(root, doc);
  return root.innerHTML;
}

// Plain text with its line breaks (each <br> or paragraph is a new line).
export function htmlToText(html) {
  const body = new DOMParser().parseFromString(html || '', 'text/html').body;
  let out = '';
  const walk = (node) => {
    for (const c of node.childNodes) {
      if (c.nodeType === 3) out += c.nodeValue;
      else if (c.tagName === 'BR') out += '\n';
      else if (c.tagName === 'DIV' || c.tagName === 'P') {
        if (out && !out.endsWith('\n')) out += '\n';
        walk(c);
      } else walk(c);
    }
  };
  walk(body);
  return out;
}

// The formatted version of a text, if it still matches it. When the text was
// changed somewhere without formatting (the script view, an import…), the old
// formatting no longer applies and the plain text is shown.
export function richOf(html, text) {
  return html && htmlToText(html).trim() === (text || '').trim() ? html : textToHtml(text || '');
}

// Text colours (and highlights) in the spirit of Notion's palette.
export const TEXT_COLORS = [
  { name: 'Por defecto', color: 'inherit' },
  { name: 'Gris', color: '#787774' },
  { name: 'Marrón', color: '#9f6b53' },
  { name: 'Naranja', color: '#d9730d' },
  { name: 'Amarillo', color: '#cb912f' },
  { name: 'Verde', color: '#448361' },
  { name: 'Azul', color: '#337ea9' },
  { name: 'Morado', color: '#9065b0' },
  { name: 'Rosa', color: '#c14c8a' },
  { name: 'Rojo', color: '#d44c47' },
];

export const HIGHLIGHTS = [
  { name: 'Sin fondo', color: 'transparent' },
  { name: 'Gris', color: '#e3e2e0' },
  { name: 'Marrón', color: '#eee0da' },
  { name: 'Naranja', color: '#fadec9' },
  { name: 'Amarillo', color: '#fdecc8' },
  { name: 'Verde', color: '#dbeddb' },
  { name: 'Azul', color: '#d3e5ef' },
  { name: 'Morado', color: '#e8deee' },
  { name: 'Rosa', color: '#f5e0e9' },
  { name: 'Rojo', color: '#ffe2dd' },
];

// Sticky-note colours, plus any custom colour from the picker.
// Word cards: the theme's own colour (null) or one of the note colours.
export const WORD_COLORS = [null, '#fff1a8', '#ffd8a8', '#ffc9de', '#e5d4ff', '#c9e4ff', '#c8f0d8', '#ececec'];

export const NOTE_COLORS = ['#fff1a8', '#ffd8a8', '#ffc9de', '#e5d4ff', '#c9e4ff', '#c8f0d8', '#ececec', '#ffffff'];
