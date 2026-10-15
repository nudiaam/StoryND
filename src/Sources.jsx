import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { create } from 'zustand';
import { useStore as useFlowStore } from '@xyflow/react';
import { useStore, beginTyping } from './store.js';
import { addSource, deleteSource, moveSource, updateSource } from './actions.js';
import { api } from './api.js';
import { useCloseOnClickOutside } from './hooks.js';

// A moment's sources: one line each, numbered, no boxes. A pencil on the
// right opens a card beside the line to write its text and its link; the
// little arrow after the text opens the link. Lines are dragged to reorder
// them or to take them to another moment.
//
// `where` tells the board ("board") from the detail view ("focus"): the same
// moment can be on both at once.

// What is being edited ({ where, momentId, sourceId }) and dragged.
const useSrc = create(() => ({ editing: null, drag: null }));
const lineKey = (where, id) => `${where}:${id}`;

const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };
const shortUrl = (url) => url.replace(/^https?:\/\/(www\.)?/, '');
const openLink = (url) => {
  const u = /^[a-z]+:\/\//i.test(url) ? url : 'https://' + url;
  api.openExternal(u);
};

// The open-link arrow, on a 6 px grid (it is snapped to screen pixels too).
const GO = <svg viewBox="0 0 6 6" aria-hidden="true"><path d="M1 5L5 1M1.6 1H5v3.4" /></svg>;
const PEN = <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 4.5l3 3L7 16H4v-3zM11 6l3 3" /></svg>;
const QUOTE = <svg className="q" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 12V9.2c0-2.6 1.2-4.3 3.6-5.2l.6 1.2C5.3 5.8 4.7 6.7 4.6 8h2.1v4zM9.3 12V9.2c0-2.6 1.2-4.3 3.6-5.2l.6 1.2c-1.4.6-2 1.5-2.1 2.8h2.1v4z" /></svg>;
const LINK = <svg className="l" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>;
const TRASH = <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" /></svg>;
const CLOSE = <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" /></svg>;

function SourceLine({ where, moment, source, n }) {
  const editing = useSrc((s) => s.editing?.where === where && s.editing.sourceId === source.id);
  const label = source.text || shortUrl(source.url);
  return (
    <div
      className={`sline nodrag nopan ${source.url ? '' : 'cita'} ${editing ? 'editing' : ''}`}
      data-src-line={lineKey(where, source.id)}
      data-anchor={where === 'board' ? source.id : undefined}
      onPointerDown={(e) => startDrag(e, where, moment.id, source)}
      onDoubleClick={(e) => { e.stopPropagation(); edit(where, moment.id, source.id); }}
    >
      <span className="sline-n">{n}</span>
      <span className="sline-t">{label || <span className="sline-empty">Fuente nueva</span>}</span>
      {source.url && <span className="src-go" onPointerDown={(e) => e.stopPropagation()} onClick={() => openLink(source.url)}>{GO}</span>}
      <button className="sline-pen" data-src-pen onPointerDown={(e) => e.stopPropagation()} onClick={() => edit(where, moment.id, source.id)}>{PEN}</button>
    </div>
  );
}

function edit(where, momentId, sourceId) {
  const cur = useSrc.getState().editing;
  if (cur?.sourceId === sourceId && cur.where === where) return;
  finishEditing();
  useSrc.setState({ editing: { where, momentId, sourceId } });
}

// Closing the card: a source left empty goes away by itself.
function finishEditing() {
  const cur = useSrc.getState().editing;
  if (!cur) return;
  useSrc.setState({ editing: null });
  const m = useStore.getState().project?.moments[cur.momentId];
  const s = m?.sources.find((x) => x.id === cur.sourceId);
  if (s && !s.text.trim() && !s.url.trim()) deleteSource(cur.momentId, cur.sourceId);
}

export function SourceList({ moment, where }) {
  const drag = useSrc((s) => s.drag);
  const dragging = drag?.moving ? drag : null;
  const items = moment.sources.filter((s) => !(dragging && s.id === dragging.id));
  const gapAt = dragging?.to?.where === where && dragging.to.momentId === moment.id ? dragging.to.index : -1;
  const lines = items.map((s, i) => <SourceLine key={s.id} where={where} moment={moment} source={s} n={i + 1} />);
  // While a line is dragged, the others leave a gap of its size where it would land.
  if (gapAt >= 0) lines.splice(gapAt, 0, <div key="gap" className="sline-gap" style={{ height: dragging.h }} />);
  return (
    <>
      <div className="src-lines" data-src-list={moment.id} data-src-where={where}>{lines}</div>
      <div className="src-add nodrag nopan">
        <span className="link-btn" onClick={() => edit(where, moment.id, addSource(moment.id))}>+ fuente</span>
      </div>
    </>
  );
}

// ---------- dragging a line ----------
function startDrag(e, where, momentId, source) {
  if (e.button !== 0 || useSrc.getState().editing) return;
  e.stopPropagation();
  const el = e.currentTarget;
  const x0 = e.clientX;
  const y0 = e.clientY;
  let started = false;
  const move = (ev) => {
    if (!started) {
      if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return;
      started = true;
      const r = el.getBoundingClientRect();
      // The copy is the line itself: same size, same look, straight.
      useSrc.setState({ drag: {
        moving: true, id: source.id, from: momentId, source, n: [...el.parentElement.children].indexOf(el) + 1,
        w: el.offsetWidth, h: el.offsetHeight, k: r.width / el.offsetWidth, dx: ev.clientX - r.left, dy: ev.clientY - r.top,
        x: ev.clientX, y: ev.clientY, to: { where, momentId, index: [...el.parentElement.children].indexOf(el) },
      } });
      document.body.classList.add('src-dragging');
      return;
    }
    const d = useSrc.getState().drag;
    // The whole sources row (its margins and «+ fuente» too) takes the drop.
    const under = document.elementFromPoint(ev.clientX, ev.clientY);
    const list = under?.closest('[data-src-list]') || under?.closest('.row-src, .focus-src')?.querySelector('[data-src-list]');
    let to = d.to;
    if (list) {
      const lines = [...list.querySelectorAll(':scope > .sline')];
      const next = lines.findIndex((l) => { const r = l.getBoundingClientRect(); return ev.clientY < r.top + r.height / 2; });
      to = { where: list.dataset.srcWhere, momentId: list.dataset.srcList, index: next < 0 ? lines.length : next };
    }
    useSrc.setState({ drag: { ...d, x: ev.clientX, y: ev.clientY, to } });
  };
  const up = () => {
    window.removeEventListener('pointermove', move, true);
    window.removeEventListener('pointerup', up, true);
    const d = useSrc.getState().drag;
    useSrc.setState({ drag: null });
    document.body.classList.remove('src-dragging');
    // Dropped where it was: nothing changes (and nothing to undo).
    const same = d && d.to.momentId === d.from && d.to.index === d.n - 1;
    if (started && d && !same) moveSource(d.from, d.id, d.to.momentId, d.to.index);
  };
  window.addEventListener('pointermove', move, true);
  window.addEventListener('pointerup', up, true);
}

function DragCopy() {
  const d = useSrc((s) => s.drag);
  if (!d?.moving) return null;
  const s = d.source;
  return createPortal(
    <div
      className={`sline src-copy ${s.url ? '' : 'cita'}`}
      style={{ width: d.w, transform: `translate(${d.x - d.dx}px, ${d.y - d.dy}px) scale(${d.k})` }}
    >
      <span className="sline-n">{d.n}</span>
      <span className="sline-t">{s.text || shortUrl(s.url) || 'Fuente nueva'}</span>
      {s.url && <span className="src-go">{GO}</span>}
    </div>,
    document.body,
  );
}

// ---------- the card ----------
// Beside its line, at the board's zoom.
function SourceCard() {
  const editing = useSrc((s) => s.editing);
  const source = useStore((s) => (editing ? s.project?.moments[editing.momentId]?.sources.find((x) => x.id === editing.sourceId) : null));
  const n = useStore((s) => (editing ? (s.project?.moments[editing.momentId]?.sources.findIndex((x) => x.id === editing.sourceId) ?? -1) + 1 : 0));
  const box = useRef(null);
  const textRef = useRef(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const open = !!(editing && source);

  useCloseOnClickOutside(open, '.src-card, [data-src-pen]', finishEditing);
  useEffect(() => { if (editing && !source) useSrc.setState({ editing: null }); }, [editing, source]);

  // Beside its line, following it when the board moves.
  useLayoutEffect(() => {
    if (!open) return undefined;
    let frame = 0;
    const place = () => {
      const line = document.querySelector(`[data-src-line="${lineKey(editing.where, editing.sourceId)}"]`);
      const card = box.current;
      if (line && card) {
        // It grows and shrinks with the board's zoom, like everything on it.
        const r = line.getBoundingClientRect();
        const k = line.offsetWidth ? r.width / line.offsetWidth : 1;
        const mid = r.top + r.height / 2;
        const top = Math.max(8, Math.min(window.innerHeight - card.offsetHeight * k - 8, mid - 22 * k));
        card.style.transform = `translate(${Math.round(r.right + 14 * k)}px, ${Math.round(top)}px) scale(${k})`;
        card.style.setProperty('--point', `${(mid - top) / k - 6}px`);
      }
      frame = requestAnimationFrame(place);
    };
    place();
    return () => cancelAnimationFrame(frame);
  }, [open, editing]);

  // Opens ready to write.
  useEffect(() => {
    setLinkOpen(false);
    if (!open) return;
    const t = textRef.current;
    if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); }
  }, [editing?.sourceId]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const t = textRef.current;
    if (t) { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }
  });

  if (!open) return null;
  const set = (patch) => updateSource(editing.momentId, source.id, patch);
  const host = hostOf(source.url);
  const rest = host ? source.url.replace(/^https?:\/\/(www\.)?[^/]+/i, '') : shortUrl(source.url);
  const close = () => finishEditing();

  return createPortal(
    <div
      ref={box}
      className="src-card"
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } }}
    >
      <div className="src-card-head">
        <b>Fuente {n}</b>
        <button className="src-ib del" onClick={() => { useSrc.setState({ editing: null }); deleteSource(editing.momentId, source.id); }}>{TRASH}</button>
        <button className="src-ib" onClick={close}>{CLOSE}</button>
      </div>
      <div className="src-card-grid">
        <span className="src-gi">{QUOTE}</span>
        <textarea
          ref={textRef}
          className="src-text"
          rows={1}
          spellCheck={false}
          value={source.text}
          placeholder="Cita, dato, título del artículo…"
          onFocus={beginTyping}
          onChange={(e) => set({ text: e.target.value })}
        />
        <span className="src-gi link">{LINK}</span>
        {linkOpen ? (
          <input
            className="src-url"
            autoFocus
            spellCheck={false}
            value={source.url}
            placeholder="https://…"
            onFocus={beginTyping}
            onChange={(e) => set({ url: e.target.value.trim() })}
            onBlur={() => setLinkOpen(false)}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          />
        ) : source.url ? (
          <span className="src-link">
            <span className="src-link-u" onClick={() => setLinkOpen(true)}>
              {host ? <><b>{host}</b><span className="path">{rest}</span></> : rest}
            </span>
            <span className="src-go" onClick={() => openLink(source.url)}>{GO}</span>
          </span>
        ) : (
          <span className="src-link add" onClick={() => setLinkOpen(true)}>+ enlace</span>
        )}
      </div>
    </div>,
    document.body,
  );
}

// Small icons land between screen pixels (the text before them is a
// fractional width, and the board zooms), and each one then looks
// different. Each is nudged onto the pixel grid so they all come out alike.
function snapIcons() {
  const dpr = window.devicePixelRatio || 1;
  const icons = [...document.querySelectorAll('.src-go svg')];
  for (const svg of icons) svg.style.transform = '';
  const moves = icons.map((svg) => {
    const r = svg.getBoundingClientRect();
    const k = r.width / 6 || 1;
    return [(Math.round(r.left * dpr) / dpr - r.left) / k, (Math.round(r.top * dpr) / dpr - r.top) / k];
  });
  icons.forEach((svg, i) => { const [dx, dy] = moves[i]; if (dx || dy) svg.style.transform = `translate(${dx}px, ${dy}px)`; });
}

// Mounted once (inside the board's provider): the card, the dragged copy,
// and the snapping of the arrows whenever the board or the project changes.
export function SourcesLayer() {
  const transform = useFlowStore((s) => s.transform);
  const project = useStore((s) => s.project);
  const view = useStore((s) => s.ui.view);
  const focus = useStore((s) => s.ui.focusMoment);
  useEffect(() => {
    const f = requestAnimationFrame(snapIcons);
    return () => cancelAnimationFrame(f);
  }, [transform, project, view, focus]);
  useEffect(() => {
    window.addEventListener('resize', snapIcons);
    return () => window.removeEventListener('resize', snapIcons);
  }, []);
  // Leaving the board or the detail view closes the card.
  useEffect(() => { finishEditing(); }, [view, focus]);
  return (
    <>
      <SourceCard />
      <DragCopy />
    </>
  );
}
