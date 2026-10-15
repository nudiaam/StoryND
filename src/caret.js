// The text cursor, drawn by the app: the system one is as tall as the font's
// whole box (with Segoe UI, well above and below the letters) and its height
// can't be styled. This one is as tall as the letters, rounded, and fades in
// and out. The system cursor is made transparent in styles.css.
//
// It follows the focused text field every frame while there is one, so it
// stays in place when the board pans or zooms under it.

const TEXT_INPUTS = /^(text|search|url|email|tel|password|number)$/;

const editable = (el) => {
  if (!el) return null;
  if (el.tagName === 'TEXTAREA') return el;
  if (el.tagName === 'INPUT') return TEXT_INPUTS.test(el.type) ? el : null;
  return el.isContentEditable ? el : null;
};

// How much the element is scaled on screen (the board's zoom), 1 elsewhere.
const scaleOf = (el) => (el.offsetWidth ? el.getBoundingClientRect().width / el.offsetWidth : 1);

// A hidden copy of an input or textarea, to find where its cursor is.
let mirror = null;
const COPY = ['boxSizing', 'width', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight', 'textTransform', 'textIndent', 'textAlign', 'tabSize', 'wordSpacing'];

function fieldCaret(el) {
  if (el.selectionStart !== el.selectionEnd) return null;
  const cs = getComputedStyle(el);
  if (!mirror) {
    mirror = document.createElement('div');
    mirror.setAttribute('aria-hidden', 'true');
    mirror.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;overflow:hidden;border-style:solid;';
    document.body.appendChild(mirror);
  }
  for (const k of COPY) mirror.style[k] = cs[k];
  const area = el.tagName === 'TEXTAREA';
  mirror.style.whiteSpace = area ? cs.whiteSpace : 'pre';
  mirror.style.overflowWrap = area ? cs.overflowWrap : 'normal';
  mirror.style.wordBreak = area ? cs.wordBreak : 'normal';
  // The text before the cursor, then a mark on the one letter right after it,
  // then the rest, so the lines break exactly as in the field. (A mark
  // holding all the rest would span several lines and land in between.)
  const v = el.value;
  const at = el.selectionStart;
  const next = v[at];
  const real = next !== undefined && next !== '\n';
  mirror.textContent = v.slice(0, at);
  const mark = document.createElement('span');
  mark.textContent = real ? next : '\u200b';
  mirror.appendChild(mark);
  mirror.appendChild(document.createTextNode(v.slice(real ? at + 1 : at)));
  const box = mark.getClientRects()[0] || mark.getBoundingClientRect();
  const base = mirror.getBoundingClientRect();
  const k = scaleOf(el);
  const r = el.getBoundingClientRect();
  const x = r.left + (box.left - base.left - el.scrollLeft) * k;
  const fs = parseFloat(cs.fontSize);
  // One line: the text sits in the middle of the field.
  const mid = area
    ? r.top + (box.top - base.top - el.scrollTop + box.height * 0.53) * k
    : r.top + r.height / 2;
  return { x, mid, h: fs * k };
}

function editableCaret(el) {
  const sel = window.getSelection();
  if (!sel.rangeCount || !sel.isCollapsed || !el.contains(sel.anchorNode)) return null;
  const range = sel.getRangeAt(0);
  const node = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
  const fs = parseFloat(getComputedStyle(node).fontSize);
  const k = scaleOf(el);
  let r = range.getClientRects()[0];
  if (!r) {
    // On an empty line the range has no box: use what is next to it (a line
    // break or the element itself).
    const c = range.startContainer;
    const near = c.nodeType === 1 ? c.childNodes[range.startOffset] || c.childNodes[range.startOffset - 1] : null;
    const box = (near?.nodeType === 1 ? near : c.nodeType === 1 ? c : c.parentElement).getBoundingClientRect();
    const cs = getComputedStyle(el);
    const startOfEl = !near || near === el;
    const lh = parseFloat(cs.lineHeight) || fs * 1.4;
    r = startOfEl
      ? { left: box.left + parseFloat(cs.paddingLeft) * k, top: box.top + parseFloat(cs.paddingTop) * k, height: lh * k }
      : { left: box.left, top: box.top, height: box.height || lh * k };
  }
  return { x: r.left, mid: r.top + r.height * 0.53, h: fs * k };
}

export function initCaret() {
  const el = document.createElement('div');
  el.className = 'app-caret';
  document.body.appendChild(el);
  let frame = 0;
  let last = '';

  const draw = () => {
    frame = 0;
    const field = editable(document.activeElement);
    if (!field) { el.classList.remove('on'); last = ''; return; }
    const c = field.isContentEditable ? editableCaret(field) : fieldCaret(field);
    if (!c) { el.classList.remove('on'); last = ''; }
    else {
      const key = `${Math.round(c.x * 2)},${Math.round(c.mid * 2)},${Math.round(c.h * 2)}`;
      if (key !== last) {
        const w = Math.max(1.5, Math.min(3, 2 * (c.h / parseFloat(getComputedStyle(field).fontSize) || 1)));
        el.style.transform = `translate(${c.x - w / 2}px, ${c.mid - c.h / 2}px)`;
        el.style.width = w + 'px';
        el.style.height = c.h + 'px';
        // It shows fully while moving or typing, then goes back to fading.
        el.classList.remove('on');
        void el.offsetWidth;
        el.classList.add('on');
        last = key;
      }
    }
    frame = requestAnimationFrame(draw);
  };
  const wake = () => { if (!frame) frame = requestAnimationFrame(draw); };
  // Some texts become editable a moment after the click that focuses them,
  // so look again shortly after anything that may start editing.
  const soon = () => { wake(); setTimeout(wake, 60); setTimeout(wake, 200); };
  for (const type of ['focusin', 'selectionchange', 'pointerup', 'keydown', 'input', 'dblclick']) document.addEventListener(type, soon, true);
  document.addEventListener('focusout', () => setTimeout(wake, 0), true);
}
