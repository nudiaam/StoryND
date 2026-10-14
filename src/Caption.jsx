import { useEffect, useRef, useState } from 'react';
import { beginTyping } from './store.js';

export const CAPTION_MAX = 60;

// Text over a picture. The picture stays clean: a small "T" says it has
// text, and the text shows on a frosted-glass band when the pointer is over
// the picture (the glass blurs and darkens what is behind, so it reads on
// any picture). Empty means no text.
export default function Caption({ text, onChange, editable = true }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text || '');
  const input = useRef(null);
  useEffect(() => { if (!editing) setDraft(text || ''); }, [text, editing]);
  useEffect(() => { if (editing) input.current?.focus(); }, [editing]);

  const save = () => {
    setEditing(false);
    const t = draft.trim().slice(0, CAPTION_MAX);
    if (t !== (text || '')) onChange(t || undefined);
  };

  if (editing) {
    return (
      <div className="caption editing" onPointerDown={(e) => e.stopPropagation()}>
        <input
          ref={input}
          value={draft}
          maxLength={CAPTION_MAX}
          placeholder="Texto de la imagen"
          onFocus={beginTyping}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') { setDraft(text || ''); setEditing(false); }
          }}
        />
        <span className="caption-count">{draft.length}/{CAPTION_MAX}</span>
      </div>
    );
  }
  if (text) {
    return (
      <>
        <span className="caption-mark" aria-hidden="true">T</span>
        <div
          className={`caption ${editable ? 'can-edit' : ''}`}
          title={editable ? 'Clic para cambiar el texto' : undefined}
          onPointerDown={editable ? (e) => e.stopPropagation() : undefined}
          onClick={editable ? () => setEditing(true) : undefined}
        >
          <span>{text}</span>
        </div>
      </>
    );
  }
  if (!editable) return null;
  return (
    <button className="caption-add" onPointerDown={(e) => e.stopPropagation()} onClick={() => setEditing(true)}>
      + añadir texto
    </button>
  );
}
