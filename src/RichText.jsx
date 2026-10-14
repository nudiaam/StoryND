import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { beginTyping } from './store.js';
import { HIGHLIGHTS, TEXT_COLORS, htmlToText, richOf, sanitize } from './richtext.js';
import Icon from './Icon.jsx';

// Applies a format to the selected words of the focused rich field.
export function applyFormat(cmd, value) {
  document.execCommand('styleWithCSS', false, true);
  document.execCommand(cmd, false, value);
}

// Preset text colours and highlights (no free picker, on purpose): two tabs,
// Texto and Fondo, and one grid of equal circles. The name of each colour
// shows on hover. The tab chosen last is remembered.
let lastTab = 'text';
const INK = '#2c2c2a'; // the notes' own text colour, for "Por defecto"

export function ColorPalette({ onPick }) {
  const [tab, setTab] = useState(lastTab);
  const choose = (t) => { lastTab = t; setTab(t); };
  const list = tab === 'text' ? TEXT_COLORS : HIGHLIGHTS;
  return (
    <div className="nt-palette" onMouseDown={(e) => e.preventDefault()}>
      <div className="nt-tabs">
        <button className={tab === 'text' ? 'on' : ''} onClick={() => choose('text')}>Texto</button>
        <button className={tab === 'bg' ? 'on' : ''} onClick={() => choose('bg')}>Fondo</button>
      </div>
      <div className="nt-circles">
        {list.map((c) => {
          const none = tab === 'bg' && c.color === 'transparent';
          const fill = tab === 'text' ? (c.color === 'inherit' ? INK : c.color) : c.color;
          return (
            <button
              key={c.name}
              className={`nt-circle ${none ? 'none' : ''}`}
              title={c.name}
              style={none ? undefined : { background: fill }}
              onClick={() => {
                if (tab === 'bg') onPick('hiliteColor', c.color);
                else if (c.color === 'inherit') onPick('removeFormat');
                else onPick('foreColor', c.color);
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

// A text field that keeps bold, italic and colours. Behaves like the plain
// fields it replaces: click and type. Select words to format them.
const RichText = forwardRef(function RichText(
  { html, text, onChange, placeholder, className = '', autoFocus, singleLine, onFocus, onBlur, style },
  outer,
) {
  const ref = useRef(null);
  useImperativeHandle(outer, () => ref.current);
  const focused = useRef(false);
  const value = useMemo(() => richOf(html, text), [html, text]);

  // Fill from the project, except while the person is typing in it.
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && !focused.current && el.innerHTML !== value) el.innerHTML = value;
  }, [value]);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = () => {
    const clean = sanitize(ref.current.innerHTML);
    onChange({ html: clean, text: htmlToText(clean) });
  };

  return (
    <div
      ref={ref}
      className={`rich nodrag nopan ${className} ${!(text || '').trim() ? 'empty' : ''}`}
      style={style}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      data-rich=""
      data-placeholder={placeholder}
      onFocus={(e) => { focused.current = true; beginTyping(); onFocus?.(e); }}
      onBlur={(e) => { focused.current = false; onBlur?.(e); }}
      onInput={save}
      onPaste={(e) => {
        // Pasted text comes in clean; formatting is done here.
        e.preventDefault();
        document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
      }}
      onKeyDown={(e) => {
        const k = e.key.toLowerCase();
        if (e.key === 'Escape') { e.preventDefault(); e.currentTarget.blur(); }
        if (singleLine && e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
        if ((e.ctrlKey || e.metaKey) && (k === 'b' || k === 'i')) {
          e.preventDefault();
          applyFormat(k === 'b' ? 'bold' : 'italic');
        }
      }}
    />
  );
});

export default RichText;

// Whether the selected words (or the word with the cursor) are bold and
// italic, as Word shows it on its buttons. With no field being edited,
// `whole` (an element) says whether all of its text is.
export function useFormatState(whole) {
  const [state, setState] = useState({ bold: false, italic: false });
  useEffect(() => {
    const check = () => {
      const sel = window.getSelection();
      const node = sel.rangeCount ? sel.getRangeAt(0).commonAncestorContainer : null;
      const field = node && (node.nodeType === 1 ? node : node.parentElement)?.closest('[contenteditable="true"]');
      let next;
      if (field && field === document.activeElement) {
        next = { bold: document.queryCommandState('bold'), italic: document.queryCommandState('italic') };
      } else if (whole?.current) {
        const texts = [];
        const walk = document.createTreeWalker(whole.current, NodeFilter.SHOW_TEXT);
        while (walk.nextNode()) if (walk.currentNode.textContent.trim()) texts.push(walk.currentNode.parentElement);
        const all = (test) => texts.length > 0 && texts.every((el) => test(getComputedStyle(el)));
        next = { bold: all((cs) => Number(cs.fontWeight) >= 600), italic: all((cs) => cs.fontStyle === 'italic') };
      } else next = { bold: false, italic: false };
      setState((s) => (s.bold === next.bold && s.italic === next.italic ? s : next));
    };
    check();
    document.addEventListener('selectionchange', check);
    document.addEventListener('input', check, true);
    return () => {
      document.removeEventListener('selectionchange', check);
      document.removeEventListener('input', check, true);
    };
  });
  return state;
}

// Floating bar over the selected words of any rich field in a zone.
export function FormatBar() {
  const [box, setBox] = useState(null);
  const fmt = useFormatState();
  const [palette, setPalette] = useState(false);

  useEffect(() => {
    const update = () => {
      const sel = window.getSelection();
      const node = sel.rangeCount ? sel.getRangeAt(0).commonAncestorContainer : null;
      const field = node && (node.nodeType === 1 ? node : node.parentElement)?.closest('[data-rich]');
      if (!field || sel.isCollapsed || document.activeElement !== field) {
        setBox(null);
        setPalette(false);
        return;
      }
      const r = sel.getRangeAt(0).getBoundingClientRect();
      setBox({ x: r.left + r.width / 2, top: r.top, bottom: r.bottom });
    };
    const hide = () => { setBox(null); setPalette(false); };
    // Leaving the field keeps the selection, so check again after the blur.
    const left = () => setTimeout(update, 0);
    document.addEventListener('selectionchange', update);
    document.addEventListener('focusout', left);
    window.addEventListener('wheel', hide, true);
    return () => {
      document.removeEventListener('selectionchange', update);
      document.removeEventListener('focusout', left);
      window.removeEventListener('wheel', hide, true);
    };
  }, []);

  if (!box) return null;
  // Above the words, or below them when there is no room.
  const above = box.top > 60;
  const style = {
    left: Math.max(8, Math.min(window.innerWidth - 200, box.x)),
    top: above ? box.top - 8 : box.bottom + 8,
    transform: `translate(-50%, ${above ? '-100%' : '0'})`,
  };
  const pick = (cmd, value) => { applyFormat(cmd, value); setPalette(false); };

  return (
    <div className="format-bar node-toolbar" style={style} onMouseDown={(e) => e.preventDefault()}>
      <button className={fmt.bold ? 'on' : ''} title="Negrita (Ctrl+B)" onClick={() => applyFormat('bold')}><Icon name="bold" size={15} /></button>
      <button className={fmt.italic ? 'on' : ''} title="Cursiva (Ctrl+I)" onClick={() => applyFormat('italic')}><Icon name="italic" size={15} /></button>
      <div className="nt-menu">
        <button className={`nt-color ${palette ? 'on' : ''}`} title="Color del texto" onClick={() => setPalette((p) => !p)}>
          <span>A</span>
        </button>
        {palette && <ColorPalette onPick={pick} />}
      </div>
    </div>
  );
}
