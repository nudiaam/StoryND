import { memo, useEffect, useRef, useState } from 'react';
import { NodeResizer, NodeToolbar, Position, useStore as useFlowStore } from '@xyflow/react';
import Icon from '../Icon.jsx';
import { useStore, setUi, beginTyping } from '../store.js';
import { updateFree } from '../actions.js';
import Media from '../Media.jsx';
import { NOTE_COLORS, htmlToText, sanitize, textToHtml } from '../richtext.js';
import { ColorPalette, useFormatState } from '../RichText.jsx';

const commitResize = (id) => (_e, p) => updateFree(id, { x: p.x, y: p.y, w: p.width, h: p.height });

// Keeps the text selection while a toolbar button is pressed.
const keepSelection = (e) => e.preventDefault();

const ALIGNS = [['left', 'textLeft', 'Texto a la izquierda'], ['center', 'textCenter', 'Texto centrado'], ['right', 'textRight', 'Texto a la derecha']];

// Single click selects and drags; double click edits the text (like Miro).
// Notes and big texts take bold, italic and preset text colours.
function TextNode({ data, selected }) {
  const f = useStore((s) => s.project.free.find((x) => x.id === data.id));
  const [editing, setEditing] = useState(false);
  const [palette, setPalette] = useState(false);
  const ref = useRef(null);
  const justCreated = useStore((s) => s.ui.focusId === data.id);
  const multi = useFlowStore((s) => {
    let n = 0;
    for (const node of s.nodeLookup.values()) if (node.selected) n += 1;
    return n > 1;
  });
  const html = f ? f.html ?? textToHtml(f.text) : '';
  const fmt = useFormatState(ref);

  // Fill the editable box from the project, except while typing in it.
  useEffect(() => {
    if (ref.current && !editing && ref.current.innerHTML !== html) ref.current.innerHTML = html;
  }, [html, editing]);

  useEffect(() => {
    if (!editing || !ref.current) return;
    ref.current.focus();
    const sel = window.getSelection();
    sel.selectAllChildren(ref.current);
    sel.collapseToEnd();
  }, [editing]);

  // A note made with a tool opens ready to type.
  useEffect(() => {
    if (justCreated) {
      setEditing(true);
      setUi({ focusId: null });
    }
  }, [justCreated]);

  useEffect(() => { if (!selected) setPalette(false); }, [selected]);

  if (!f) return null;
  const big = f.type === 'bigtext';
  // Text size: notes from 10 to 48 (2 by 2), big texts from 14 to 96 (4 by 4).
  const fs = f.fs || (big ? 28 : 14);
  const [step, minFs, maxFs] = big ? [4, 14, 96] : [2, 10, 48];
  const align = f.align || (big ? 'center' : 'left');

  const save = () => {
    const clean = sanitize(ref.current.innerHTML);
    updateFree(f.id, { html: clean, text: htmlToText(clean) }, { typing: true });
  };

  // Formats the selected words; if nothing is being edited, the whole text.
  const format = (cmd, value) => {
    const el = ref.current;
    if (!editing) {
      el.contentEditable = 'true';
      el.focus();
      window.getSelection().selectAllChildren(el);
    }
    document.execCommand('styleWithCSS', false, true);
    document.execCommand(cmd, false, value);
    save();
    if (!editing) {
      el.contentEditable = 'false';
      window.getSelection().removeAllRanges();
    }
  };

  return (
    <div
      className={`free-text ${big ? 'bigtext' : 'note'} ${selected ? 'sel' : ''}`}
      style={big ? undefined : { background: f.color || NOTE_COLORS[0] }}
      data-anchor={f.id}
      onDoubleClick={() => setEditing(true)}
    >
      <NodeResizer isVisible={selected} minWidth={80} minHeight={40} onResizeEnd={commitResize(f.id)} />
      {/* Only when it's the one thing selected; with several, the align bar shows instead. */}
      <NodeToolbar isVisible={selected && !multi} position={Position.Top} offset={10}>
        <div className="node-toolbar" onMouseDown={keepSelection}>
          {!big && (
            <>
              {NOTE_COLORS.map((c) => (
                <button
                  key={c}
                  className={`nt-swatch ${(f.color || NOTE_COLORS[0]) === c ? 'on' : ''}`}
                  style={{ background: c }}
                  title="Color de la nota"
                  onClick={() => updateFree(f.id, { color: c })}
                />
              ))}
              <span className="nt-sep" />
            </>
          )}
          {ALIGNS.map(([a, icon, title]) => (
            <button key={a} className={align === a ? 'on' : ''} title={title} onClick={() => updateFree(f.id, { align: a })}>
              <Icon name={icon} size={15} />
            </button>
          ))}
          <span className="nt-sep" />
          <button className={fmt.bold ? 'on' : ''} title="Negrita (Ctrl+B)" onClick={() => format('bold')}><Icon name="bold" size={15} /></button>
          <button className={fmt.italic ? 'on' : ''} title="Cursiva (Ctrl+I)" onClick={() => format('italic')}><Icon name="italic" size={15} /></button>
          <div className="nt-menu">
            <button className={`nt-color ${palette ? 'on' : ''}`} title="Color del texto" onClick={() => setPalette((p) => !p)}>
              <span>A</span>
            </button>
            {palette && <ColorPalette onPick={(cmd, value) => { format(cmd, value); setPalette(false); }} />}
          </div>
          <span className="nt-sep" />
          <button title="Letra más pequeña" disabled={fs <= minFs} onClick={() => updateFree(f.id, { fs: Math.max(minFs, fs - step) })}>A−</button>
          <span className="nt-size">{fs}</span>
          <button title="Letra más grande" disabled={fs >= maxFs} onClick={() => updateFree(f.id, { fs: Math.min(maxFs, fs + step) })}>A+</button>
        </div>
      </NodeToolbar>
      <div
        ref={ref}
        className={`rt ${editing ? 'nodrag nopan nowheel editing' : ''} ${!f.text?.trim() ? 'empty' : ''}`}
        contentEditable={editing}
        suppressContentEditableWarning
        data-placeholder={big ? 'Idea, tema, frase…' : 'Nota (doble clic para escribir)'}
        style={{ fontSize: fs, textAlign: align }}
        onFocus={beginTyping}
        onInput={save}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') e.currentTarget.blur();
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); format('bold'); }
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') { e.preventDefault(); format('italic'); }
        }}
      />
    </div>
  );
}

// A loose image, video or video link on the canvas. Drag it onto any slot
// (boceto, style frame, fuente, moodboard) to put it there; Alt keeps a copy.
function ImageNode({ data, selected }) {
  const f = useStore((s) => s.project.free.find((x) => x.id === data.id));
  if (!f) return null;

  // Match the node to the media's proportions the first time it loads.
  const onRatio = (ar) => {
    if (f.fitted) return;
    updateFree(f.id, { h: Math.round(f.w / ar), fitted: true }, { history: false });
  };

  return (
    <div className={`free-image ${selected ? 'sel' : ''}`} data-anchor={f.id} onDoubleClick={() => setUi({ lightbox: f.asset })}>
      <NodeResizer isVisible={selected} keepAspectRatio minWidth={60} minHeight={40} onResizeEnd={commitResize(f.id)} />
      <Media src={f.asset} fit="cover" hover onRatio={onRatio} />
    </div>
  );
}

export const NoteNode = memo(TextNode);
export const BigTextNode = memo(TextNode);
export const FreeImageNode = memo(ImageNode);
