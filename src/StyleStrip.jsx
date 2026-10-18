import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon.jsx';
import { useReactFlow, useViewport, useStore as useFlowStore } from '@xyflow/react';
import { useStore, setUi, beginTyping } from './store.js';
import { addMoodItems, deleteMoodItem, moveMedia, rotateMedia, setSetting, setStripRows } from './actions.js';
import { cornerDrag, useMoodDrag } from './useMoodDrag.js';
import XButton, { RotateButton } from './XButton.jsx';
import { DistBar, startColorDrag } from './Palette.jsx';
import { STRIP_ROW_MIN, STRIP_ROW_STEP, computeLayout, itemRatio, stripOrder, stripRowH, stripRows } from './layout.js';
import { api } from './api.js';
import Media, { canRotate } from './Media.jsx';
import { mediaKindOf } from './media.js';
import { DRAG_TYPE, draggedMedia, hasFilesOrUrl, importDroppedImages } from './util.js';
import { richOf } from './richtext.js';
import Caption from './Caption.jsx';

// Moving it and the big view go through StripCells (pointer drags).
function StripItem({ item, zoneId }) {
  const remove = <XButton onClick={() => deleteMoodItem(zoneId, item.id)} />;
  if (item.kind === 'word') {
    return (
      <div className="sitem word" style={item.bg ? { background: item.bg, color: '#2c2c2a' } : undefined}>
        <span dangerouslySetInnerHTML={{ __html: item.text?.trim() ? richOf(item.html, item.text) : '—' }} />
        {remove}
      </div>
    );
  }
  if (item.kind === 'color') {
    return (
      <div className="sitem color" style={{ background: item.text }} title={item.text}>
        <span>{item.text}</span>
        {remove}
      </div>
    );
  }
  return (
    <div className="sitem media">
      <Media src={item.asset} fit="cover" auto rot={item.rot} />
      {item.caption && <Caption text={item.caption} editable={false} />}
      {canRotate(item.asset) && <RotateButton onClick={() => rotateMedia({ kind: 'mood', zoneId, itemId: item.id })} />}
      {remove}
    </div>
  );
}

// What the pointer may press on a strip item without moving it.
const INTERACTIVE = 'button, a, input, .x, .rotb, .sound, .caption, .caption-mark, .span-handle';
const GAP = 6;

// What a dragged item looks like in the hand.
function GhostContent({ item }) {
  if (item.kind === 'word') return <div className="word-ghost" style={item.bg ? { background: item.bg, color: '#2c2c2a' } : undefined} dangerouslySetInnerHTML={{ __html: richOf(item.html, item.text) }} />;
  if (item.kind === 'color') return <div className="swatch" style={{ background: item.text }} />;
  return <Media src={item.asset} fit="cover" rot={item.rot} />;
}

// One moodboard in the strip (on the side or on top), in rows of its own:
// the board's moodboard doesn't change. Drag an item to move it among the
// others (in the hand it already has the size it will have), or out to a
// slot, another moodboard or the board (Alt copies); a click shows it big.
// Its corner makes its whole row taller or shorter, in steps; what no longer
// fits goes down to the next row.
function StripRows({ zone, items, pos }) {
  const wrapRef = useRef(null);
  const gridRef = useRef(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = wrapRef.current;
    const measure = () => setWidth(el.clientWidth);
    measure();
    // On the next frame: measuring right away can loop with its own scrollbar.
    const ro = new ResizeObserver(() => requestAnimationFrame(measure));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const mine = zone.strip?.[pos];
  const hs = mine?.hs || [];
  const w = Math.max(width, 120);
  const ordered = useMemo(() => stripOrder(items, mine?.order), [items, mine?.order]);
  const lay = useMemo(() => stripRows(ordered, hs, w, GAP), [ordered, hs, w]);
  // Moving: among the others, in the row under the pointer, before the first
  // one whose middle is to its right (after the row's last one if none is).
  const place = (item) => {
    const others = ordered.filter((i) => i.id !== item.id);
    const base = stripRows(others, hs, w, GAP);
    return ({ px, py }) => {
      let at = others.length;
      const band = others.filter((i) => py >= base.rects[i.id].y - GAP && py <= base.rects[i.id].y + base.rects[i.id].h + GAP);
      if (band.length) {
        const next = band.find((i) => base.rects[i.id].x + base.rects[i.id].w / 2 > px);
        at = next ? others.indexOf(next) : others.indexOf(band[band.length - 1]) + 1;
      } else if (py < 0) at = 0;
      const order = others.slice();
      order.splice(at, 0, item);
      return {
        lay: stripRows(order, hs, w, GAP),
        apply: () => { if (order.some((i, n) => i.id !== ordered[n].id)) setStripRows(zone.id, pos, { order: order.map((i) => i.id) }); },
      };
    };
  };
  const { drag, view, startMove } = useMoodDrag({
    zoneId: zone.id,
    lay,
    gridRef,
    interactive: INTERACTIVE,
    place,
    onClick: (item) => { if (item.kind === 'image' || item.kind === 'video') setUi({ lightbox: { asset: item.asset, rot: item.rot } }); },
  });
  // The corner: the whole row, taller or shorter, in steps.
  const [sizing, setSizing] = useState(null);
  const startSize = (item) => (e) => {
    const r0 = lay.rects[item.id];
    if (!r0) return;
    const h0 = hs[r0.row] ?? stripRowH(w);
    const max = w / itemRatio(item);
    let h = h0;
    beginTyping();
    setSizing(item.id);
    cornerDrag(e, 1, (dx) => {
      const want = (r0.h * (r0.w + dx)) / r0.w;
      const next = Math.max(STRIP_ROW_MIN, Math.min(max, h0 + Math.round((want - h0) / STRIP_ROW_STEP) * STRIP_ROW_STEP));
      if (next === h) return;
      h = next;
      const list = [...hs];
      for (let k = 0; k < r0.row; k++) list[k] ??= stripRowH(w);
      list[r0.row] = Math.round(h);
      setStripRows(zone.id, pos, { hs: list }, { typing: true });
    });
    window.addEventListener('pointerup', () => setSizing(null), { once: true });
  };
  const moving = drag ? items.find((i) => i.id === drag.id) : null;
  return (
    <div ref={wrapRef} className="scells-wrap">
      {width > 0 && (
        <div ref={gridRef} className={`sitems-just ${moving ? 'is-sorting' : ''}`} style={{ height: view.height }}>
          {ordered.map((it) => {
            const r = view.rects[it.id];
            if (!r) return null;
            return (
              <div
                key={it.id}
                className={`sjust ${moving?.id === it.id && drag.lay ? 'placeholder' : ''} ${sizing === it.id ? 'sizing' : ''} ${r.w < 80 ? 'narrow' : ''}`}
                style={{ left: r.x, top: r.y, width: r.w, height: r.h }}
                onPointerDown={startMove(it)}
              >
                <StripItem item={it} zoneId={zone.id} />
                <span className="span-handle" onPointerDown={startSize(it)} />
              </div>
            );
          })}
        </div>
      )}
      {moving && drag.ghost && createPortal(
        <div className="mood-ghost" style={{ left: drag.ghost.x, top: drag.ghost.y, width: drag.ghost.w, height: drag.ghost.h }}>
          <GhostContent item={moving} />
        </div>,
        document.body,
      )}
    </div>
  );
}

// The side strip's width: chosen by dragging its edge, between these.
export const STRIP_W = 260;
const STRIP_MIN = 240;
const STRIP_MAX = 640;
const clampW = (w) => Math.round(Math.max(STRIP_MIN, Math.min(STRIP_MAX, w, window.innerWidth * 0.5)));

// One moodboard in the strip. Images dropped here go into that moodboard.
function Group({ zone, title, color, onTitle, side }) {
  const [over, setOver] = useState(false);
  const hovered = useStore((s) => s.ui.dropHover === 'mood:' + zone.id);
  // A zone's moodboard is pictures and words (colours only in general windows).
  const items = zone.kind === 'normal' ? zone.moodboard.filter((i) => i.kind !== 'color') : zone.moodboard;

  const add = (assets) => {
    if (assets.length) addMoodItems(zone.id, assets.map((asset) => ({ kind: mediaKindOf(asset), asset })));
  };
  const pick = async () => {
    const res = await api.importPaths(await api.pickMedia());
    add(res.map((r) => r.asset));
  };

  return (
    <section
      className={`sgroup ${over || hovered ? 'drop-over' : ''}`}
      style={{ '--zc': color }}
      data-drop={'mood:' + zone.id}
      onDragOver={(e) => { if (hasFilesOrUrl(e.dataTransfer) || e.dataTransfer.types.includes(DRAG_TYPE)) { e.preventDefault(); setOver(true); } }}
      onDragLeave={() => setOver(false)}
      onDrop={async (e) => {
        e.preventDefault();
        setOver(false);
        const item = draggedMedia(e.dataTransfer);
        if (item) moveMedia(item, 'mood:' + zone.id, e.altKey);
        else add(await importDroppedImages(e.dataTransfer, { video: true }));
      }}
    >
      <header>
        <span className="sdot" />
        <span className={`stitle ${onTitle ? 'clickable' : ''}`} onClick={onTitle} title={onTitle ? 'Ir a esta zona' : undefined}>{title}</span>
        <span className="link-btn sadd" onClick={pick}>+ imágenes</span>
      </header>
      {zone.colors?.length > 0 && (
        <>
          {/* Its 60/30/10 distribution: drag a colour onto it, × to take one out. */}
          <div className="sdist"><DistBar owner={{ zone: zone.id }} dist={zone.dist} colors={zone.colors} height={20} /></div>
          <div className="scolors">
            {zone.colors.map((c) => (
              <span key={c.id} className="scolor" style={{ background: c.hex }} title={c.hex} onPointerDown={(e) => startColorDrag(e, c, { ghost: true })} />
            ))}
          </div>
        </>
      )}
      {zone.fonts?.length > 0 && (
        <div className="sfonts">
          {zone.fonts.map((f) => (
            <div key={f.id} className="sfont" title={f.role}>
              <span className="sfont-aa" style={{ fontFamily: `"${f.family}", sans-serif` }}>Aa</span>
              <span className="sfont-name" style={{ fontFamily: `"${f.family}", sans-serif` }}>{f.family}</span>
            </div>
          ))}
        </div>
      )}
      {items.length ? (
        <StripRows zone={zone} items={items} pos={side ? 'side' : 'top'} />
      ) : (
        <p className="sempty">Arrastra aquí imágenes o vídeos para el moodboard {zone.kind === 'general' ? 'general' : 'de esta zona'}.</p>
      )}
    </section>
  );
}

// "Mostrar": which windows and zone the strip shows.
function ShowMenu({ children }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const down = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    window.addEventListener('pointerdown', down, true);
    return () => window.removeEventListener('pointerdown', down, true);
  }, [open]);
  return (
    <div className="show-menu" ref={box}>
      <button className={`ghost show-btn ${open ? 'on' : ''}`} title="Qué mostrar en la franja" onClick={() => setOpen((o) => !o)}>
        <Icon name="eye" size={15} />
      </button>
      {open && (
        <div className="show-pop">
          <span className="show-title">Mostrar</span>
          {children}
        </div>
      )}
    </div>
  );
}

// The zone under the centre of the screen (or the nearest one), so the strip
// follows you as you move around the board, also when zones sit in rows.
function useZoneOnScreen(project) {
  const { x, y, zoom } = useViewport();
  const width = useFlowStore((s) => s.width);
  const height = useFlowStore((s) => s.height);
  const layout = useMemo(() => computeLayout(project), [project.zones, project.moments]);
  const cx = (width / 2 - x) / zoom;
  const cy = (height / 2 - y) / zoom;
  const gap = (v, a, b) => (v < a ? a - v : v > b ? v - b : 0);
  let best = null;
  let bestDist = Infinity;
  for (const z of project.zones) {
    if (z.kind !== 'normal') continue;
    const l = layout.zones[z.id];
    const d = Math.hypot(gap(cx, l.x, l.x + l.w), gap(cy, l.y, l.y + l.h));
    if (d < bestDist) { best = z; bestDist = d; }
  }
  return { zone: best, layout };
}

// Always-visible style reference: the starred items of the general
// moodboard and of the zone currently on screen.
export default function StyleStrip() {
  const project = useStore((s) => s.project);
  const { stripPos: pos, stripOpen: open } = project.settings;
  // While its edge is dragged the width lives here; it is saved on release.
  const [dragW, setDragW] = useState(null);
  const width = dragW ?? clampW(project.settings.stripW || STRIP_W);
  const resize = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const x0 = e.clientX;
    const w0 = width;
    let w = w0;
    const move = (ev) => { w = clampW(w0 + x0 - ev.clientX); setDragW(w); };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.classList.remove('strip-resizing');
      setDragW(null);
      if (w !== w0) setSetting('stripW', w);
    };
    document.body.classList.add('strip-resizing');
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  // What to show: each general window (the first one by default) and the
  // zone on screen (on by default).
  const windows = project.zones.filter((z) => z.kind === 'general');
  const chosen = project.settings.stripShow || {};
  const shows = (id, byDefault) => chosen[id] ?? byDefault;
  const toggle = (id, byDefault) => setSetting('stripShow', { ...chosen, [id]: !shows(id, byDefault) });
  const { setCenter, getZoom } = useReactFlow();
  const { zone, layout } = useZoneOnScreen(project);

  const goToZone = () => {
    const l = layout.zones[zone.id];
    setCenter(l.x + l.w / 2, l.y + 300, { zoom: getZoom() });
  };

  const controls = (
    <div className="strip-controls">
      <ShowMenu>
        {windows.map((w, i) => (
          <label key={w.id} className="show-item">
            <input type="checkbox" checked={shows(w.id, i === 0)} onChange={() => toggle(w.id, i === 0)} />
            <span>{w.name}</span>
          </label>
        ))}
        <div className="show-sep" />
        <label className="show-item">
          <input type="checkbox" checked={shows('zone', true)} onChange={() => toggle('zone', true)} />
          <span>La zona en pantalla</span>
        </label>
      </ShowMenu>
      <div className="seg">
        <button className={pos === 'top' ? 'on' : ''} onClick={() => { setSetting('stripPos', 'top'); setSetting('stripChosen', true); }}>Arriba</button>
        <button className={pos === 'side' ? 'on' : ''} onClick={() => { setSetting('stripPos', 'side'); setSetting('stripChosen', true); }}>Lateral</button>
      </div>
      <button className="ghost fold" title={open ? 'Plegar la franja' : 'Desplegar la franja'} onClick={() => setSetting('stripOpen', !open)}>
        {pos === 'top' ? (open ? '▴' : '▾') : open ? '»' : '«'}
      </button>
    </div>
  );

  if (!open) {
    return (
      <aside className={`strip ${pos} folded`}>
        <span className="strip-label">Estilo</span>
        {controls}
      </aside>
    );
  }

  return (
    <>
    <aside className={`strip ${pos}`} style={pos === 'side' ? { width } : undefined}>
      <div className="strip-head">
        <span className="strip-label">Estilo</span>
        {controls}
      </div>
      <div className="strip-body">
        {windows.map((w, i) => shows(w.id, i === 0) && <Group key={w.id} zone={w} title={w.name} color="#9a9890" side={pos === 'side'} />)}
        {zone && shows('zone', true) && <Group zone={zone} title={zone.name} color={zone.color} onTitle={goToZone} side={pos === 'side'} />}
        {!windows.some((w, i) => shows(w.id, i === 0)) && !(zone && shows('zone', true)) && (
          <p className="sempty">Elige en «Mostrar» qué quieres ver aquí.</p>
        )}
      </div>
    </aside>
      {/* The board runs right to left (row-reverse), so after the strip means to its left. */}
      {pos === 'side' && (
        // Its left edge: drag it to choose the width; double click goes back to the usual one.
        <div className="strip-edge" onPointerDown={resize} onDoubleClick={() => setSetting('stripW', STRIP_W)}><span /></div>
      )}
    </>
  );
}
