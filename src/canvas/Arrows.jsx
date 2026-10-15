import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ViewportPortal, useNodes, useReactFlow, useViewport } from '@xyflow/react';
import { useStore, setUi, beginTyping } from '../store.js';
import { addArrow, addArrowImages, addArrowLabel, deleteArrows, freeT, moveMedia, removeArrowImage, removeArrowLabel, updateArrow, updateArrowLabel } from '../actions.js';
import { api } from '../api.js';
import Media from '../Media.jsx';
import XButton from '../XButton.jsx';
import { DRAG_TYPE, draggedMedia, hasFilesOrUrl, importDroppedImages, startMediaDrag } from '../util.js';
import { anchorsOf, arrowHead, trimEnd, chaikin, nearestT, pointAt, refit, simplify, strokeLength, through, toPath } from './geometry.js';

// Finds the element an arrow end is glued to: the innermost thing under the
// point that carries a data-anchor (a boceto, a source, a note, a zone…).
function anchorAt(clientX, clientY) {
  for (const el of document.elementsFromPoint(clientX, clientY)) {
    if (el.closest?.('.draw-overlay, .arrow-label, .arrow-handle')) continue;
    const a = el.closest?.('[data-anchor]');
    if (a) {
      const r = a.getBoundingClientRect();
      return { id: a.dataset.anchor, fx: (clientX - r.left) / r.width, fy: (clientY - r.top) / r.height };
    }
  }
  return null;
}

function useAnchorResolver() {
  const { screenToFlowPosition } = useReactFlow();
  return (end) => {
    if (!end) return null;
    const el = document.querySelector(`[data-anchor="${CSS.escape(end.id)}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const p = screenToFlowPosition({ x: r.left + r.width * end.fx, y: r.top + r.height * end.fy }, { snapToGrid: false });
    return [p.x, p.y];
  };
}

// Drags with the pointer anywhere on the window (it never loses the
// gesture, even if what was pressed is redrawn underneath). `onMove` gets the
// point in canvas coordinates.
function useFlowDrag() {
  const { screenToFlowPosition } = useReactFlow();
  return (e, onMove, onUp) => {
    e.stopPropagation();
    e.preventDefault();
    beginTyping();
    const at = (ev) => {
      const p = screenToFlowPosition({ x: ev.clientX, y: ev.clientY }, { snapToGrid: false });
      return [p.x, p.y];
    };
    const move = (ev) => onMove(at(ev), ev);
    const up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      onUp?.(at(ev), ev);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };
}

const round = (list) => list.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]);

// The line as drawn on the board. With anchors, a clean curve through both
// ends and the anchors; a stroke never edited keeps its hand-drawn shape.
// Glued ends move it along with what they are glued to.
function arrowPts(a, q0, q1) {
  const s0 = a.points[0];
  const s1 = a.points[a.points.length - 1];
  if (!a.anchors) return refit(a.points, q0 || s0, q1 || s1);
  return through(refit([s0, ...a.anchors, s1], q0 || s0, q1 || s1), 16);
}
// Its control points as shown: the two ends and the anchors in between.
function controlsOf(a, pts) {
  if (!a.anchors) return [pts[0], ...anchorsOf(pts), pts[pts.length - 1]];
  const s0 = a.points[0];
  const s1 = a.points[a.points.length - 1];
  return refit([s0, ...a.anchors, s1], pts[0], pts[pts.length - 1]);
}
// Saves new control points: the curve through them, and its anchors.
const commit = (id, ctrl, extra = {}) => updateArrow(id, {
  points: round(through(ctrl, 16)), anchors: round(ctrl.slice(1, -1)), ...extra,
}, { typing: true });

// One label on the arrow: text and/or pictures. Drag it to slide it along
// the line; double click to write; drop pictures on it to add them.
function ArrowLabel({ arrow, label, pts, selected }) {
  const editing = useStore((s) => s.ui.editingArrow === arrow.id + ':' + label.id);
  const [over, setOver] = useState(false);
  const flowDrag = useFlowDrag();
  const at = pointAt(pts, label.t ?? 0.5);

  const onPointerDown = (e) => {
    if (e.button !== 0 || e.target.closest('button, textarea, .link-btn, .arrow-img')) { e.stopPropagation(); return; }
    setUi({ selectedArrow: arrow.id });
    flowDrag(e, (p) => updateArrowLabel(arrow.id, label.id, { t: Math.round(nearestT(pts, p) * 1000) / 1000 }, { typing: true }));
  };
  const onDragOver = (e) => {
    if (hasFilesOrUrl(e.dataTransfer) || e.dataTransfer.types.includes(DRAG_TYPE)) {
      e.preventDefault();
      e.stopPropagation();
      setOver(true);
    }
  };
  const onDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setOver(false);
    const item = draggedMedia(e.dataTransfer);
    if (item) {
      moveMedia(item, `arrow:${arrow.id}:${label.id}`, e.altKey);
      return;
    }
    const assets = await importDroppedImages(e.dataTransfer, { video: true });
    if (assets.length) addArrowImages(arrow.id, assets, label.id);
  };
  const empty = !label.text?.trim() && !label.images.length;

  return (
    <div
      className={`arrow-label nodrag nopan nowheel ${selected ? 'sel' : ''} ${over ? 'drop-over' : ''}`}
      style={{ transform: `translate(${at[0]}px, ${at[1]}px) translate(-50%, -50%)` }}
      data-drop={`arrow:${arrow.id}:${label.id}`}
      onPointerDown={onPointerDown}
      onDoubleClick={() => setUi({ editingArrow: arrow.id + ':' + label.id, selectedArrow: arrow.id })}
      onDragOver={onDragOver}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      {editing ? (
        <textarea
          autoFocus
          rows={2}
          value={label.text}
          placeholder="¿Qué relación es?"
          onFocus={beginTyping}
          onChange={(e) => updateArrowLabel(arrow.id, label.id, { text: e.target.value }, { typing: true })}
          onBlur={() => {
            setUi({ editingArrow: null });
            // A label left empty goes away.
            const l = useStore.getState().project.arrows.find((x) => x.id === arrow.id)?.labels.find((x) => x.id === label.id);
            if (l && !l.text?.trim() && !l.images.length) removeArrowLabel(arrow.id, label.id);
          }}
          onKeyDown={(e) => e.key === 'Escape' && e.currentTarget.blur()}
        />
      ) : (
        label.text?.trim() && <div className="arrow-text">{label.text}</div>
      )}
      {label.images.length > 0 && (
        <div className="arrow-images">
          {label.images.map((asset, i) => (
            <div
              className="arrow-img"
              key={asset + i}
              draggable
              onDragStart={(e) => startMediaDrag(e, asset, { kind: 'arrow', id: arrow.id, labelId: label.id, index: i })}
            >
              <div className="arrow-img-media" onDoubleClick={(e) => { e.stopPropagation(); setUi({ lightbox: asset }); }}><Media src={asset} fit="cover" /></div>
              {selected && <XButton onClick={() => removeArrowImage(arrow.id, label.id, i)} />}
            </div>
          ))}
        </div>
      )}
      {selected && !editing && !empty && (
        <button className="arrow-label-x" onClick={() => removeArrowLabel(arrow.id, label.id)}>
          <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M3 3l4 4M7 3L3 7" /></svg>
        </button>
      )}
    </div>
  );
}

// The selected arrow's tools, on the freest stretch of the line: add a text,
// add pictures, delete the arrow.
// The perpendicular to the stroke at fraction t (unit length).
function normalAt(pts, t) {
  const a = pointAt(pts, t - 0.01);
  const b = pointAt(pts, t + 0.01);
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return [-(b[1] - a[1]) / l, (b[0] - a[0]) / l];
}

// Where the bar goes: off the line on one side, far enough that the whole
// bar clears it however steep it is there (half its width and height seen
// across the line, plus a gap).
function barAt(pts, t, side) {
  const o = pointAt(pts, t);
  const n = normalAt(pts, t);
  const off = 12 + Math.abs(n[0]) * 72 + Math.abs(n[1]) * 14;
  return [o[0] + n[0] * off * side, o[1] + n[1] * off * side];
}

// The selected arrow's tools show up by the pointer, beside the line and
// clear of its labels. They stay put while the pointer heads to them (they
// never chase it), and only move when the pointer goes somewhere else along
// the line; which side of the line they sit on is decided then, not on every
// move. Anything new goes on the line right there.
function ArrowTools({ arrow, pts }) {
  const { screenToFlowPosition, getZoom } = useReactFlow();
  const total = strokeLength(pts) || 1;
  const pad = 150 / total;
  // Away from the ends and from the labels already there.
  const clear = (t) => {
    let x = Math.max(0.04, Math.min(0.96, t));
    for (let pass = 0; pass < 2; pass++) {
      for (const l of arrow.labels || []) {
        if (Math.abs(x - l.t) < pad) x = x < l.t ? l.t - pad : l.t + pad;
      }
    }
    return x < 0.02 || x > 0.98 ? freeT(arrow.labels) : x;
  };
  const [near, setNear] = useState(() => ({ t: freeT(arrow.labels), side: -1 }));
  const live = useRef({});
  live.current = { pts, near, clear };

  useEffect(() => {
    const move = (e) => {
      if (e.buttons || e.target.closest?.('.arrow-tools')) return;
      const { pts: P, near: cur, clear: fit } = live.current;
      const zoom = getZoom();
      const f = screenToFlowPosition({ x: e.clientX, y: e.clientY }, { snapToGrid: false });
      const p = [f.x, f.y];
      const t = nearestT(P, p);
      const q = pointAt(P, t);
      const away = (a) => Math.hypot(p[0] - a[0], p[1] - a[1]) * zoom;
      // Far from the arrow, or near where the bar is: it stays.
      if (away(q) > 120) return;
      if (away(pointAt(P, cur.t)) < 150 || away(barAt(P, cur.t, cur.side)) < 120) return;
      const n = normalAt(P, t);
      const d = (p[0] - q[0]) * n[0] + (p[1] - q[1]) * n[1];
      setNear({ t: fit(t), side: Math.abs(d) * zoom > 4 ? Math.sign(d) : cur.side });
    };
    window.addEventListener('pointermove', move);
    return () => window.removeEventListener('pointermove', move);
  }, [screenToFlowPosition, getZoom]);

  const t = Math.round(clear(near.t) * 1000) / 1000;
  const at = barAt(pts, t, near.side);
  const pick = async () => {
    const res = await api.importPaths(await api.pickMedia());
    if (res.length) addArrowImages(arrow.id, res.map((r) => r.asset), null, t);
  };
  return (
    <div key={near.t + ':' + near.side} className="arrow-tools nodrag nopan" style={{ transform: `translate(${at[0]}px, ${at[1]}px) translate(-50%, -50%)` }} onPointerDown={(e) => e.stopPropagation()}>
      <span className="link-btn" onClick={() => setUi({ editingArrow: arrow.id + ':' + addArrowLabel(arrow.id, { t }) })}>+ texto</span>
      <span className="link-btn" onClick={pick}>+ imagen</span>
      <span className="link-btn danger" onClick={() => deleteArrows([arrow.id])}>borrar</span>
    </div>
  );
}

let justAdded = {};

// The selected arrow's points: both ends (drag one onto something to glue
// it), its anchors (drag to reshape; double click removes one) and a "+"
// between each two (click it to add an anchor there, or drag it). Like Miro or Illustrator.
function ArrowHandles({ arrow, pts }) {
  const { zoom } = useViewport();
  const flowDrag = useFlowDrag();
  const ctrl = controlsOf(arrow, pts);
  const last = ctrl.length - 1;
  const scale = `translate(-50%, -50%) scale(${1 / zoom})`;

  const dragPoint = (i, end) => (e) => {
    if (e.button !== 0) return;
    const base = ctrl.map((c) => [...c]);
    flowDrag(
      e,
      (p) => {
        const next = base.map((c) => [...c]);
        next[i] = p;
        // While an end is being dragged it is unglued, so it follows the pointer.
        commit(arrow.id, next, end ? { [end]: null } : {});
      },
      (_p, ev) => { if (end) updateArrow(arrow.id, { [end]: anchorAt(ev.clientX, ev.clientY) }, { typing: true }); },
    );
  };
  // The "+" sits on the curve halfway between two control points. A click
  // puts an anchor right there; dragging it moves the new anchor.
  const ts = ctrl.map((c) => nearestT(pts, c));
  const addAnchor = (k, g) => (e) => {
    if (e.button !== 0) return;
    const base = ctrl.map((c) => [...c]);
    commit(arrow.id, [...base.slice(0, k + 1), g, ...base.slice(k + 1)]);
    justAdded = { arrow: arrow.id, index: k + 1, time: Date.now() };
    flowDrag(e, (p) => commit(arrow.id, [...base.slice(0, k + 1), p, ...base.slice(k + 1)]));
  };
  const removeAnchor = (i) => (e) => {
    e.stopPropagation();
    // The second click of a double click on a "+" lands on the anchor it just
    // made: that one stays.
    if (justAdded.arrow === arrow.id && justAdded.index === i && Date.now() - justAdded.time < 600) return;
    commit(arrow.id, ctrl.filter((_, j) => j !== i));
  };
  return (
    <>
      {ctrl.slice(0, -1).map((c, k) => {
        const g = pointAt(pts, (ts[k] + ts[k + 1]) / 2);
        return (
          <div key={'g' + k} className="arrow-handle add nodrag nopan" style={{ transform: `translate(${g[0]}px, ${g[1]}px) ${scale}` }} onPointerDown={addAnchor(k, g)}>
            <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M5 2.5v5M2.5 5h5" /></svg>
          </div>
        );
      })}
      {ctrl.map((c, i) => {
        const end = i === 0 ? 'from' : i === last ? 'to' : null;
        return (
          <div
            key={end || 'a' + i}
            className={`arrow-handle nodrag nopan ${end ? 'end' : ''}`}
            style={{ transform: `translate(${c[0]}px, ${c[1]}px) ${scale}` }}
            onPointerDown={dragPoint(i, end)}
            onDoubleClick={end ? undefined : removeAnchor(i)}
          />
        );
      })}
    </>
  );
}

// All arrows, drawn in canvas coordinates so they pan and zoom with it.
export function ArrowLayer() {
  const arrows = useStore((s) => s.project.arrows);
  const selectedId = useStore((s) => s.ui.selectedArrow);
  const nodes = useNodes();
  const resolve = useAnchorResolver();
  const [ends, setEnds] = useState({});
  const { screenToFlowPosition } = useReactFlow();

  // Glued ends follow their element: re-measure right after anything moves,
  // and once more shortly after in case images or sizes settle late.
  useLayoutEffect(() => {
    const measure = () => {
      const next = {};
      for (const a of arrows) next[a.id] = [resolve(a.from), resolve(a.to)];
      setEnds((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    measure();
    const t = setTimeout(measure, 80);
    return () => clearTimeout(t);
  }, [arrows, nodes]); // eslint-disable-line react-hooks/exhaustive-deps

  const lines = arrows.map((a) => {
    const [q0, q1] = ends[a.id] || [];
    return { a, pts: arrowPts(a, q0, q1) };
  });
  // Pictures dropped right on the line become a new label there.
  const dropOnLine = (a, pts) => async (e) => {
    e.preventDefault();
    const p = screenToFlowPosition({ x: e.clientX, y: e.clientY }, { snapToGrid: false });
    const t = Math.round(nearestT(pts, [p.x, p.y]) * 1000) / 1000;
    const item = draggedMedia(e.dataTransfer);
    if (item) {
      const lid = addArrowLabel(a.id, { t });
      moveMedia(item, `arrow:${a.id}:${lid}`, e.altKey);
      return;
    }
    const assets = await importDroppedImages(e.dataTransfer, { video: true });
    if (assets.length) addArrowLabel(a.id, { t, images: assets });
  };

  return (
    <ViewportPortal>
      <svg className="arrow-svg">
        {lines.map(({ a, pts }) => {
          const d = toPath(pts);
          // The visible line ends inside the arrowhead (not at its tip).
          const line = toPath(trimEnd(pts, 9));
          const sel = a.id === selectedId;
          return (
            <g key={a.id} className={`arrow ${sel ? 'sel' : ''}`}>
              <path
                className="arrow-hit"
                d={d}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => setUi({ selectedArrow: a.id })}
                onDoubleClick={() => setUi({ selectedArrow: a.id, editingArrow: a.id + ':' + addArrowLabel(a.id, { t: freeT(a.labels) }) })}
                onDragOver={(e) => { if (hasFilesOrUrl(e.dataTransfer) || e.dataTransfer.types.includes(DRAG_TYPE)) e.preventDefault(); }}
                onDrop={dropOnLine(a, pts)}
              />
              <path className="arrow-line" d={line} />
              <path className="arrow-head" d={arrowHead(pts)} />
            </g>
          );
        })}
      </svg>
      {lines.map(({ a, pts }) => {
        const sel = a.id === selectedId;
        return (
          <Fragment key={a.id}>
            {(a.labels || []).map((l) => <ArrowLabel key={l.id} arrow={a} label={l} pts={pts} selected={sel} />)}
            {sel && <ArrowHandles arrow={a} pts={pts} />}
            {sel && <ArrowTools arrow={a} pts={pts} />}
          </Fragment>
        );
      })}
    </ViewportPortal>
  );
}

// Pencil tool: draw freely; on release the stroke is smoothed and each end
// glues itself to whatever is underneath.
export function DrawOverlay() {
  const { screenToFlowPosition } = useReactFlow();
  const { zoom } = useViewport();
  const [stroke, setStroke] = useState(null);
  const box = useRef(null);
  const pts = useRef([]);

  const local = (e) => {
    const r = box.current.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  // Only the left button draws. The overlay lets every other pointer event
  // through, so the middle button still pans and the wheel still zooms.
  useEffect(() => {
    const canvas = box.current?.parentElement;
    if (!canvas) return undefined;
    const down = (e) => {
      if (e.button !== 0 || e.target.closest('.toolbar-v, .react-flow__panel, .react-flow__minimap, .isolate-bar, .map-toggle')) return;
      e.preventDefault();
      e.stopPropagation();
      pts.current = [[e.clientX, e.clientY]];
      setStroke([local(e)]);
      // Every point the mouse reported (not just one per frame), so fast
      // strokes stay round.
      const move = (ev) => {
        const added = [];
        const list = ev.getCoalescedEvents?.();
        for (const p of list?.length ? list : [ev]) {
          const last = pts.current[pts.current.length - 1];
          if (Math.hypot(p.clientX - last[0], p.clientY - last[1]) < 2) continue;
          pts.current.push([p.clientX, p.clientY]);
          added.push(local(p));
        }
        if (added.length) setStroke((st) => [...(st || []), ...added]);
      };
      const up = () => {
        window.removeEventListener('pointermove', move, true);
        window.removeEventListener('pointerup', up, true);
        window.removeEventListener('pointercancel', up, true);
        finish();
      };
      window.addEventListener('pointermove', move, true);
      window.addEventListener('pointerup', up, true);
      window.addEventListener('pointercancel', up, true);
    };
    canvas.addEventListener('pointerdown', down, true);
    return () => canvas.removeEventListener('pointerdown', down, true);
  });

  const finish = () => {
    const screen = pts.current;
    pts.current = [];
    setStroke(null);
    if (screen.length < 2 || strokeLength(screen) < 18) return;
    const first = screen[0];
    const last = screen[screen.length - 1];
    const smooth = chaikin(simplify(screen, 2.5), 2);
    const points = smooth.map(([x, y]) => {
      const p = screenToFlowPosition({ x, y }, { snapToGrid: false });
      return [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10];
    });
    const id = addArrow({ points, from: anchorAt(first[0], first[1]), to: anchorAt(last[0], last[1]) });
    // Back to selection so the new arrow's text and images can be added at once.
    setUi({ selectedArrow: id, tool: 'select' });
  };

  return (
    <div ref={box} className="draw-overlay">
      {stroke && (
        <svg className="draw-preview">
          <path d={toPath(stroke)} strokeWidth={Math.max(1.6, 2 * Math.min(zoom, 1.4))} />
        </svg>
      )}
    </div>
  );
}
