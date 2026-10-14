import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ViewportPortal, useNodes, useReactFlow, useViewport } from '@xyflow/react';
import { useStore, setUi, beginTyping } from '../store.js';
import { addArrow, addArrowImages, deleteArrows, moveMedia, removeArrowImage, updateArrow } from '../actions.js';
import { api } from '../api.js';
import Media from '../Media.jsx';
import XButton from '../XButton.jsx';
import { DRAG_TYPE, draggedMedia, hasFilesOrUrl, importDroppedImages, startMediaDrag } from '../util.js';
import { arrowHead, chaikin, deform, indexAt, nearestT, pointAt, refit, simplify, strokeLength, through, toPath } from './geometry.js';

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

// The arrow's text and images; drag the box to slide it along the arrow.
function ArrowLabel({ arrow, pts, selected }) {
  const editing = useStore((s) => s.ui.editingArrow === arrow.id);
  const { screenToFlowPosition } = useReactFlow();
  const [over, setOver] = useState(false);
  const sliding = useRef(false);
  const show = selected || editing || arrow.text || arrow.images.length;
  if (!show) return null;
  const at = pointAt(pts, arrow.labelT ?? 0.5);

  const onPointerDown = (e) => {
    e.stopPropagation();
    if (e.button !== 0 || e.target.closest('button, textarea, .link-btn, .arrow-img')) return;
    sliding.current = true;
    beginTyping();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
  };
  const onPointerMove = (e) => {
    if (!sliding.current) return;
    const p = screenToFlowPosition({ x: e.clientX, y: e.clientY }, { snapToGrid: false });
    updateArrow(arrow.id, { labelT: Math.round(nearestT(pts, [p.x, p.y]) * 1000) / 1000 }, { typing: true });
  };
  const onPointerUp = () => { sliding.current = false; };

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
      moveMedia(item, 'arrow:' + arrow.id, e.altKey);
      return;
    }
    const assets = await importDroppedImages(e.dataTransfer, { video: true });
    if (assets.length) addArrowImages(arrow.id, assets);
  };
  const pick = async () => {
    const paths = await api.pickMedia();
    const res = await api.importPaths(paths);
    if (res.length) addArrowImages(arrow.id, res.map((r) => r.asset));
  };

  return (
    <div
      className={`arrow-label nodrag nopan nowheel ${selected ? 'sel' : ''} ${over ? 'drop-over' : ''}`}
      style={{ transform: `translate(${at[0]}px, ${at[1]}px) translate(-50%, -50%)` }}
      title="Arrastra para moverlo a lo largo de la flecha"
      data-drop={'arrow:' + arrow.id}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClick={() => setUi({ selectedArrow: arrow.id })}
      onDoubleClick={() => setUi({ editingArrow: arrow.id, selectedArrow: arrow.id })}
      onDragOver={onDragOver}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      {editing ? (
        <textarea
          autoFocus
          rows={2}
          value={arrow.text}
          placeholder="¿Qué relación es?"
          onFocus={beginTyping}
          onChange={(e) => updateArrow(arrow.id, { text: e.target.value }, { typing: true })}
          onBlur={() => setUi({ editingArrow: null })}
          onKeyDown={(e) => e.key === 'Escape' && e.currentTarget.blur()}
        />
      ) : (
        arrow.text && <div className="arrow-text">{arrow.text}</div>
      )}
      {arrow.images.length > 0 && (
        <div className="arrow-images">
          {arrow.images.map((asset, i) => (
            <div
              className="arrow-img"
              key={asset + i}
              draggable
              onDragStart={(e) => startMediaDrag(e, asset, { kind: 'arrow', id: arrow.id, index: i })}
            >
              <div className="arrow-img-media" onDoubleClick={(e) => { e.stopPropagation(); setUi({ lightbox: asset }); }}><Media src={asset} fit="cover" /></div>
              {selected && <XButton onClick={() => removeArrowImage(arrow.id, i)} />}
            </div>
          ))}
        </div>
      )}
      {selected && !editing && (
        <div className="arrow-tools">
          <span className="link-btn" onClick={() => setUi({ editingArrow: arrow.id })}>{arrow.text ? 'editar texto' : '+ texto'}</span>
          <span className="link-btn" onClick={pick}>+ imagen</span>
          <span className="link-btn danger" onClick={() => deleteArrows([arrow.id])}>borrar</span>
        </div>
      )}
    </div>
  );
}

// Anchor points of the selected arrow. The two ends can be dragged onto
// something else (they re-glue on release); the middle ones bend the curve.
function ArrowHandles({ arrow, pts }) {
  const { screenToFlowPosition } = useReactFlow();
  const { zoom } = useViewport();
  const drag = useRef(null);
  const last = pts.length - 1;
  // The middle handles: where the last bend put them, or at a third and two
  // thirds of a freshly drawn stroke.
  const mids = arrow.ctrlIdx?.every((i) => i > 0 && i < last) ? arrow.ctrlIdx : [indexAt(pts, 0.3), indexAt(pts, 0.7)];
  const handles = [
    { idx: 0, end: 'from' },
    { idx: mids[0], mid: 0 },
    { idx: mids[1], mid: 1 },
    { idx: last, end: 'to' },
  ].filter((h, i, all) => all.findIndex((o) => o.idx === h.idx) === i);

  const down = (h) => (e) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
    const p = screenToFlowPosition({ x: e.clientX, y: e.clientY }, { snapToGrid: false });
    drag.current = { h, base: pts, start: [p.x, p.y], mids: [pts[mids[0]], pts[mids[1]]] };
    beginTyping();
  };
  const move = (e) => {
    const d = drag.current;
    if (!d) return;
    const p = screenToFlowPosition({ x: e.clientX, y: e.clientY }, { snapToGrid: false });
    const round = (list) => list.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
    if (d.h.end) {
      // An end follows the pointer (unglued while dragged); the rest bends softly.
      const points = round(deform(d.base, d.h.idx, p.x - d.start[0], p.y - d.start[1]));
      updateArrow(arrow.id, { points, [d.h.end]: null }, { typing: true });
      return;
    }
    // A middle handle: a clean curve through both ends, this handle (under
    // the pointer) and the other one, which stays where it was.
    const grab = [d.mids[0], d.mids[1]];
    grab[d.h.mid] = [d.mids[d.h.mid][0] + p.x - d.start[0], d.mids[d.h.mid][1] + p.y - d.start[1]];
    const PER = 16;
    const points = round(through([d.base[0], grab[0], grab[1], d.base[d.base.length - 1]], PER));
    updateArrow(arrow.id, { points, ctrlIdx: [PER, PER * 2] }, { typing: true });
  };
  const up = (e) => {
    const d = drag.current;
    drag.current = null;
    if (d?.h.end) updateArrow(arrow.id, { [d.h.end]: anchorAt(e.clientX, e.clientY) }, { typing: true });
  };

  return handles.map((h) => (
    <div
      key={h.idx}
      className={`arrow-handle nodrag nopan ${h.end ? 'end' : ''}`}
      title={h.end ? 'Arrastra el extremo hasta otra cosa para pegarlo' : 'Arrastra para curvar la flecha'}
      style={{ transform: `translate(${pts[h.idx][0]}px, ${pts[h.idx][1]}px) translate(-50%, -50%) scale(${1 / zoom})` }}
      onPointerDown={down(h)}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    />
  ));
}

// All arrows, drawn in canvas coordinates so they pan and zoom with it.
export function ArrowLayer() {
  const arrows = useStore((s) => s.project.arrows);
  const selectedId = useStore((s) => s.ui.selectedArrow);
  const nodes = useNodes();
  const resolve = useAnchorResolver();
  const [ends, setEnds] = useState({});

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

  return (
    <ViewportPortal>
      <svg className="arrow-svg">
        {arrows.map((a) => {
          const [q0, q1] = ends[a.id] || [];
          const pts = refit(a.points, q0 || a.points[0], q1 || a.points[a.points.length - 1]);
          const d = toPath(pts);
          const sel = a.id === selectedId;
          return (
            <g key={a.id} className={`arrow ${sel ? 'sel' : ''}`}>
              <path
                className="arrow-hit"
                d={d}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => setUi({ selectedArrow: a.id })}
                onDoubleClick={() => setUi({ selectedArrow: a.id, editingArrow: a.id })}
              />
              <path className="arrow-line" d={d} />
              <path className="arrow-head" d={arrowHead(pts)} />
            </g>
          );
        })}
      </svg>
      {arrows.map((a) => {
        const [q0, q1] = ends[a.id] || [];
        const pts = refit(a.points, q0 || a.points[0], q1 || a.points[a.points.length - 1]);
        const sel = a.id === selectedId;
        return (
          <Fragment key={a.id}>
            <ArrowLabel arrow={a} pts={pts} selected={sel} />
            {sel && <ArrowHandles arrow={a} pts={pts} />}
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
