import { useLayoutEffect, useRef, useState } from 'react';
import { useStore, setUi, beginTyping } from '../store.js';
import { addRefs, moveMedia, setMomentDuration, setMomentText } from '../actions.js';
import { momentDuration } from '../timeline.js';
import { formatSeconds } from '../util.js';
import { useFocusOnCreate } from '../hooks.js';
import RichText from '../RichText.jsx';
import { DRAG_TYPE, draggedMedia, hasFilesOrUrl, importDroppedImages } from '../util.js';

const acceptsMedia = (dt) => hasFilesOrUrl(dt) || dt.types.includes(DRAG_TYPE);

// Lets a row accept dropped media. A picture from the project is moved here
// (copied with Alt); files from outside are imported and given to
// `onMedia(assets)`. `target` is the slot name ("boceto:<id>", …), which
// pointer drags (moodboard tiles, loose images) also find.
export function useMediaDrop(target, onMedia) {
  const [over, setOver] = useState(false);
  const hovered = useStore((s) => s.ui.dropHover === target);
  return {
    over: over || hovered,
    props: {
      'data-drop': target,
      onDragOver: (e) => {
        if (!acceptsMedia(e.dataTransfer)) return;
        e.preventDefault();
        e.stopPropagation();
        setOver(true);
      },
      onDragLeave: () => setOver(false),
      onDrop: async (e) => {
        if (!acceptsMedia(e.dataTransfer)) return;
        e.preventDefault();
        e.stopPropagation();
        setOver(false);
        const item = draggedMedia(e.dataTransfer);
        if (item) moveMedia(item, target, e.altKey);
        else {
          const assets = await importDroppedImages(e.dataTransfer, { video: true });
          if (assets.length) onMedia(assets);
        }
      },
    },
  };
}

// Narration: when the text is longer than the box it fades out at the
// bottom; while editing, the box grows to show all of it. Select words to
// make them bold, italic or coloured.
export function Narration({ moment, height, big = false }) {
  const ref = useFocusOnCreate(moment.id);
  const [editing, setEditing] = useState(false);
  const [overflow, setOverflow] = useState(false);
  const [grown, setGrown] = useState(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (editing) {
      el.style.height = 'auto';
      const h = Math.max(height, el.scrollHeight + 2);
      el.style.height = '';
      setGrown(h);
    } else {
      setGrown(null);
      setOverflow(el.scrollHeight > el.clientHeight + 2);
    }
  }, [moment.text, editing, height]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <RichText
      ref={ref}
      className={`edit narr ${overflow && !editing ? 'overflow' : ''} ${editing && !big ? 'grown' : ''}`}
      style={grown && !big ? { height: grown } : undefined}
      html={moment.html}
      text={moment.text}
      placeholder="Narración…"
      onFocus={() => setEditing(true)}
      onBlur={() => setEditing(false)}
      onChange={({ text, html }) => setMomentText(moment.id, text, html)}
    />
  );
}

// A moment's seconds: estimated from its text ("~6.9 s") until you type your
// own. Leaving it empty goes back to the estimate.
export function DurationField({ moment, wpm }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const estimate = momentDuration({ ...moment, duration: null }, wpm);
  const value = moment.duration ?? estimate;

  const commit = () => {
    setEditing(false);
    const t = draft.trim().replace(',', '.');
    if (!t) { setMomentDuration(moment.id, null); return; }
    const v = Number(t);
    if (Number.isFinite(v) && v > 0) setMomentDuration(moment.id, Math.round(v * 10) / 10);
  };

  if (editing) {
    return (
      <span className="dur-edit nodrag nopan">
        <input
          autoFocus
          value={draft}
          placeholder={estimate.toFixed(1)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') { setDraft(String(value)); setEditing(false); }
          }}
        />
        s
      </span>
    );
  }
  return (
    <span className="dur-wrap nodrag nopan">
      <button
        className={`dur ${moment.duration ? 'manual' : ''}`}
        title={moment.duration
          ? `Duración fijada a mano (por el texto serían ${estimate.toFixed(1)} s). Clic para cambiarla`
          : 'Duración estimada por el texto. Clic para fijar los segundos a mano'}
        onClick={() => { setDraft(moment.duration ? value.toFixed(1) : ''); setEditing(true); }}
      >
        {moment.duration ? '' : '~'}{formatSeconds(value)}
      </button>
      {moment.duration && (
        <button className="dur-reset" title="Volver a la duración estimada por el texto" onClick={() => setMomentDuration(moment.id, null)}>↺</button>
      )}
    </span>
  );
}

// Drop target and file picker for a moment's sources.
// Pictures dropped on the sources go to the moment's reference images.
export function useSourceDrop(moment) {
  const drop = useMediaDrop('src:' + moment.id, (assets) => addRefs(moment.id, assets));
  return { drop };
}
