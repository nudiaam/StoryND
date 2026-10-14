import { memo, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { NodeResizer, ViewportPortal, useReactFlow } from '@xyflow/react';
import { useStore, setUi, beginTyping, endDrag, notify } from '../store.js';
import {
  addMoment, addZoneAfter, renameZone, setZoneColor, deleteZone, moveZoneTo, moveMomentTo, setZoneBox,
  addMoodItems, updateMoodItem, deleteMoodItem, setMoodRatio, setMoodSpan, setWordShape, toggleTypeScale, reorderMood, placeMoodItem, moveMoodItem, moveMedia, mediaToBoard,
  addColor, setColor, deleteColor, moveColor, addFont, updateFont, deleteFont, updateScale,
} from '../actions.js';
import { G, GRID, L, ZONE_MOOD_W, masonry, momentHeightOf, rowsOf, scaleRowH } from '../layout.js';
import { DistBar, TIERS, startColorDrag } from '../Palette.jsx';
import { useMediaDrop } from './momentParts.jsx';
import { MAX_FONTS } from '../fonts.js';
import { momentDuration } from '../timeline.js';
import XButton from '../XButton.jsx';
import { openPopover } from '../Popovers.jsx';
import Icon from '../Icon.jsx';
import RichText from '../RichText.jsx';
import Caption from '../Caption.jsx';
import SoundControl from '../Sound.jsx';
import { WORD_COLORS, richOf } from '../richtext.js';
import { useCloseOnClickOutside, useFocusOnCreate } from '../hooks.js';
import { api } from '../api.js';
import Media from '../Media.jsx';
import { hasSound, mediaKindOf } from '../media.js';
import { DRAG_TYPE, MOMENT_TYPE, ZONE_TYPE, draggedMedia, dropTargetAt, formatSeconds, hasFilesOrUrl, importDroppedImages, onEmptyBoard } from '../util.js';

const NAME_MAX = 40;
const snap = (v) => Math.round(v / GRID) * GRID;
// Clicks on these never start a drag or open the isolated view.
const INTERACTIVE = 'button, input, textarea, select, a, .x, .span-handle, .swatch-hit, .gswatch-hit, .caption, .sound, [contenteditable="true"]';

// Each label sits level with the first line of what it names: the top of
// the pictures, the transition's +, the first line of the narration…
const LABEL_TOP = { boceto: 12, tr: 21, style: 12, narr: 16, src: 14 };

function RowLabels({ d }) {
  let top = L.header + d.momentHead;
  return rowsOf(d).map((r) => {
    const pictures = r.key === 'boceto' || r.key === 'style';
    const el = (
      <div
        key={r.key}
        className="row-label"
        style={{ top, height: r.h, left: L.pad, width: L.laneLabel - 12, paddingTop: pictures ? Math.round((r.h - d.shotH) / 2) : LABEL_TOP[r.key] }}
      >
        {r.label}
      </div>
    );
    top += r.h;
    return el;
  });
}

// The dashed line between moments: click to add a moment there, or drop a
// dragged moment on it.
function AddLine({ zoneId, gap, height }) {
  const target = useStore((s) => s.ui.dropTarget);
  const isTarget = target?.zoneId === zoneId && target.index === gap.index;

  const add = () => setUi({ focusId: addMoment(zoneId, gap.index) });
  const onDragOver = (e) => {
    if (!e.dataTransfer.types.includes(MOMENT_TYPE)) return;
    e.preventDefault();
    e.stopPropagation();
    if (!isTarget) setUi({ dropTarget: { zoneId, index: gap.index } });
  };
  const onDrop = (e) => {
    const id = e.dataTransfer.getData(MOMENT_TYPE);
    if (!id) return;
    e.preventDefault();
    e.stopPropagation();
    moveMomentTo(id, zoneId, gap.index);
    endDrag();
  };

  return (
    <div
      className={`add-line nodrag nopan ${isTarget ? 'target' : ''}`}
      style={{ left: gap.x - L.gapW / 2, top: L.header, width: L.gapW, height }}
      title="Añadir un momento aquí"
      onClick={add}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <span className="add-dot"><Icon name="plus" size={12} /></span>
    </div>
  );
}

// ----- moodboard -----

// Drag the corner of a tile to make it take more (or fewer) columns.
function SpanHandle({ zoneId, item, rect, mood }) {
  const drag = useRef(null);
  const down = (e) => {
    e.stopPropagation();
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
    const tile = e.currentTarget.parentElement.getBoundingClientRect();
    drag.current = { x0: e.clientX, y0: e.clientY, w0: rect.w, h0: rect.h, scale: tile.width / rect.w, span: rect.span };
    beginTyping();
  };
  const move = (e) => {
    const d = drag.current;
    if (!d) return;
    const w = d.w0 + (e.clientX - d.x0) / d.scale;
    const span = Math.max(1, Math.min(mood.cols, Math.round((w + L.moodGap) / (mood.colW + L.moodGap))));
    if (span !== d.span) {
      d.span = span;
      setMoodSpan(zoneId, item.id, span);
    }
    // Word cards can also be made shorter or taller (pictures keep their proportions).
    if (item.kind === 'word') {
      const w = span * mood.colW + (span - 1) * L.moodGap;
      const h = Math.max(32, d.h0 + (e.clientY - d.y0) / d.scale);
      const ar = Math.round(Math.min(5, Math.max(0.8, w / h)) * 100) / 100;
      if (ar !== item.ar) setWordShape(zoneId, item.id, { ar });
    }
  };
  return (
    <span
      className="span-handle"
      title={item.kind === 'word' ? 'Arrastra para cambiar su tamaño (ancho por columnas, alto libre)' : 'Arrastra para hacerla más grande o más pequeña'}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={() => { drag.current = null; }}
      onPointerCancel={() => { drag.current = null; }}
    />
  );
}

function TileContent({ zoneId, item, editable = true, sound = false }) {
  const textRef = useFocusOnCreate(item.id);
  if (item.kind === 'image' || item.kind === 'video') {
    return <Media src={item.asset} hover={editable} sound={sound} onRatio={editable ? (ar) => setMoodRatio(zoneId, item.id, ar) : undefined} />;
  }
  if (item.kind === 'word') {
    const bg = item.bg ? { background: item.bg, color: '#2c2c2a' } : undefined;
    return editable ? (
      <div className={`word-box ${item.bg ? 'tinted' : ''}`} style={bg}>
        <RichText
          ref={textRef}
          className="word-text"
          html={item.html}
          text={item.text}
          placeholder="palabra"
          onChange={({ text, html }) => updateMoodItem(zoneId, item.id, { text, html })}
        />
      </div>
    ) : <div className="word-ghost" style={bg} dangerouslySetInnerHTML={{ __html: richOf(item.html, item.text) }} />;
  }
  return (
    <div className="swatch" style={{ background: item.text }}>
      {editable && (
        <button
          className="swatch-hit"
          title="Cambiar el color"
          onClick={(e) => openPopover('color', e.currentTarget, item.text, (hex) => updateMoodItem(zoneId, item.id, { text: hex }))}
        />
      )}
      <span>{item.text}</span>
    </div>
  );
}

function MoodTile({ zoneId, item, rect, mood, placeholder, onPointerDown }) {
  const media = item.kind === 'image' || item.kind === 'video';
  const [sound, setSound] = useState(false);
  return (
    <div
      // Narrow or short tiles keep only the essential controls.
      className={`tile tile-${item.kind} nodrag nopan ${placeholder ? 'placeholder' : ''} ${rect.w < 130 ? 'narrow' : ''} ${rect.h < 60 ? 'short' : ''}`}
      data-anchor={item.id}
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
      onPointerDown={onPointerDown}
      onDoubleClick={media ? () => setUi({ lightbox: item.asset }) : undefined}
    >
      {!placeholder && (
        <>
          <TileContent zoneId={zoneId} item={item} sound={sound} />
          {media && hasSound(item.asset) && <SoundControl on={sound} onToggle={setSound} />}
          {media && <Caption text={item.caption} onChange={(caption) => updateMoodItem(zoneId, item.id, { caption })} />}
          {/* Words and colours are clicked to edit, so they're dragged from here. */}
          {!media && <span className="tile-grip" title="Arrastra para mover"><Icon name="grip" size={14} /></span>}
          {item.kind === 'word' && (
            <button
              className="tile-color"
              title="Color de la ficha"
              style={item.bg ? { background: item.bg } : undefined}
              onClick={(e) => openPopover('swatches', e.currentTarget, item.bg || null, (c) => setWordShape(zoneId, item.id, { bg: c }), WORD_COLORS)}
            />
          )}
          <XButton onClick={() => deleteMoodItem(zoneId, item.id)} />
          {item.kind !== 'color' && <SpanHandle zoneId={zoneId} item={item} rect={rect} mood={mood} />}
        </>
      )}
    </div>
  );
}

// Drag a tile: the others make room live to show where it will land. Drop it
// outside, on a slot or another moodboard, and it moves there (Alt copies).
function useMoodDrag(zone, mood, gridRef) {
  const { screenToFlowPosition } = useReactFlow();
  const [drag, setDrag] = useState(null);
  const latest = useRef(null);

  const start = (item) => (e) => {
    if (e.button !== 0 || e.target.closest(INTERACTIVE)) return;
    e.stopPropagation();
    const tile = e.currentTarget.getBoundingClientRect();
    const grab = { x: e.clientX - tile.left, y: e.clientY - tile.top };
    const origin = { x: e.clientX, y: e.clientY };
    // Everything else stays in the column it is in now.
    const cols = Object.fromEntries(zone.moodboard.map((i) => [i.id, mood.rects[i.id]?.col ?? 0]));
    const others = zone.moodboard.filter((i) => i.id !== item.id).map((i) => ({ ...i, col: cols[i.id] }));
    const base = masonry(others, mood.width);
    const span = mood.rects[item.id]?.span ?? 2;
    let active = false;

    const move = (ev) => {
      if (!active && Math.hypot(ev.clientX - origin.x, ev.clientY - origin.y) < 5) return;
      active = true;
      const g = gridRef.current.getBoundingClientRect();
      const scale = g.width / mood.width;
      const inside = ev.clientX >= g.left - 10 && ev.clientX <= g.right + 10 && ev.clientY >= g.top - 30 && ev.clientY <= g.bottom + 60;
      let over = null;
      let col = null;
      let target = null;
      if (inside) {
        // The column under the tile's centre; it goes into that column, above
        // the first item there whose middle is below the pointer.
        const px = (ev.clientX - grab.x + tile.width / 2 - g.left) / scale;
        const py = (ev.clientY - g.top) / scale;
        const step = mood.colW + L.moodGap;
        col = Math.max(0, Math.min(mood.cols - span, Math.round(px / step - span / 2)));
        over = others.length;
        for (let i = 0; i < others.length; i++) {
          const r = base.rects[others[i].id];
          const shares = r.col < col + span && col < r.col + r.span;
          if (shares && r.y + r.h / 2 > py) { over = i; break; }
        }
      } else {
        target = dropTargetAt(ev.clientX, ev.clientY, '.mood-ghost');
        if (target === 'mood:' + zone.id) target = null;
      }
      // Pictures dropped on the empty board stay there, loose.
      const media = item.kind === 'image' || item.kind === 'video';
      const board = media && !inside && !target && onEmptyBoard(ev.clientX, ev.clientY);
      if (useStore.getState().ui.dropHover !== target) setUi({ dropHover: target });
      latest.current = { item, over, col, cols, target, alt: ev.altKey, board, at: { x: ev.clientX - grab.x, y: ev.clientY - grab.y } };
      setDrag({ item, over, col, cols, ghost: { x: ev.clientX - grab.x, y: ev.clientY - grab.y, w: tile.width, h: tile.height } });
    };

    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setUi({ dropHover: null });
      setDrag(null);
      const l = latest.current;
      latest.current = null;
      if (!active || !l) return;
      const from = { kind: 'mood', zoneId: zone.id, itemId: item.id };
      if (l.over != null) placeMoodItem(zone.id, item.id, l.over, l.col, l.cols);
      else if (l.target?.startsWith('mood:')) moveMoodItem(zone.id, item.id, l.target.slice(5), l.alt);
      else if (l.target && (item.kind === 'image' || item.kind === 'video')) moveMedia({ asset: item.asset, from }, l.target, l.alt);
      else if (l.board) {
        const p = screenToFlowPosition(l.at);
        mediaToBoard({ asset: item.asset, from }, p.x, p.y, l.alt);
      }
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // While dragging inside, lay the board out as it would end up.
  let view = mood;
  let order = zone.moodboard;
  if (drag && drag.over != null) {
    order = zone.moodboard.filter((i) => i.id !== drag.item.id).map((i) => ({ ...i, col: drag.cols[i.id] }));
    order.splice(drag.over, 0, { ...drag.item, col: drag.col });
    view = masonry(order, mood.width);
  }
  return { drag, start, view, order };
}

function Moodboard({ zone, top, mood, general, main, panel }) {
  const [over, setOver] = useState(false);
  const target = 'mood:' + zone.id;
  const hovered = useStore((s) => s.ui.dropHover === target);
  const gridRef = useRef(null);
  const { drag, start, view, order } = useMoodDrag(zone, mood, gridRef);

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
      moveMedia(item, target, e.altKey);
      return;
    }
    const assets = await importDroppedImages(e.dataTransfer, { video: true });
    if (assets.length) addMoodItems(zone.id, assets.map((asset) => ({ kind: mediaKindOf(asset), asset })));
  };

  const pick = async () => {
    const paths = await api.pickMedia();
    if (!paths.length) return;
    const res = await api.importPaths(paths);
    addMoodItems(zone.id, res.map((r) => ({ kind: mediaKindOf(r.asset), asset: r.asset })));
  };

  const dragging = drag?.item.id;
  return (
    <div
      className={`mood ${panel ? 'in-panel' : ''} ${over || hovered ? 'drop-over' : ''} ${drag ? 'is-sorting' : ''}`}
      data-drop={target}
      style={panel ? undefined : { top, left: L.pad, right: L.pad }}
      onDragOver={onDragOver}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <div className="mood-head" style={{ height: L.moodHead }}>
        <span className="row-title">{main ? 'Fotos' : general ? 'Moodboard' : 'Moodboard de la zona'}</span>
        <span className="link-btn nodrag nopan" onClick={pick}>+ imágenes o vídeos</span>
        <span className="link-btn nodrag nopan" onClick={() => setUi({ focusId: addMoodItems(zone.id, [{ kind: 'word', text: '' }])[0] })}>
          + palabra
        </span>
        {/* Colours only in the extra general windows; a zone's moodboard is pictures and words. */}
        {!main && general && (
          <span className="link-btn nodrag nopan" onClick={() => addMoodItems(zone.id, [{ kind: 'color', text: '#7f77dd' }])}>
            + color
          </span>
        )}
      </div>
      <div ref={gridRef} className="mood-grid" style={{ height: Math.max(view.height, L.moodEmptyH) }}>
        {order.map((item) => view.rects[item.id] && (
          <MoodTile
            key={item.id}
            zoneId={zone.id}
            item={item}
            rect={view.rects[item.id]}
            mood={view}
            placeholder={dragging === item.id && drag.over != null}
            onPointerDown={start(item)}
          />
        ))}
        {!zone.moodboard.length && (
          <div className="mood-empty">Arrastra aquí imágenes, vídeos o enlaces, o añade palabras y colores.</div>
        )}
      </div>
      {drag && createPortal(
        <div className="mood-ghost" style={{ left: drag.ghost.x, top: drag.ghost.y, width: drag.ghost.w, height: drag.ghost.h }}>
          <TileContent zoneId={zone.id} item={drag.item} editable={false} />
        </div>,
        document.body,
      )}
    </div>
  );
}

// ----- main general window: Colores, Tipografía -----

function ColorsSection({ zone, top }) {
  // Press on a colour and move: over the 60/30/10 bar it goes into that
  // group; elsewhere it changes place in the palette (the others make room
  // live). Without moving, it's a click (change the colour).
  const box = useRef(null);
  const moved = useRef(false);
  const [drag, setDrag] = useState(null); // { id, index }
  const startDrag = (c, e) => {
    if (e.target.closest('.x')) return;
    const from = zone.colors.findIndex((x) => x.id === c.id);
    let index = from;
    const at = (ev) => {
      // Which cell of the grid the pointer is over (the swatches wrap in rows).
      const el = box.current;
      const r = el.getBoundingClientRect();
      const zoom = r.width / el.offsetWidth || 1;
      const cell = (G.swatch + G.swatchGap) * zoom;
      const perRow = Math.max(1, Math.floor((el.offsetWidth + G.swatchGap) / (G.swatch + G.swatchGap)));
      const col = Math.max(0, Math.min(perRow - 1, Math.floor((ev.clientX - r.left) / cell)));
      const row = Math.max(0, Math.floor((ev.clientY - r.top) / cell));
      return Math.min(zone.colors.length - 1, row * perRow + col);
    };
    startColorDrag(e, c, {
      onMove: (ev, overBar) => {
        index = overBar ? from : at(ev);
        setDrag({ id: c.id, index });
      },
      onDrop: () => moveColor(zone.id, c.id, index),
      onEnd: () => {
        moved.current = true;
        setTimeout(() => { moved.current = false; }, 0);
        setDrag(null);
      },
    });
  };
  let shown = zone.colors;
  if (drag) {
    const rest = zone.colors.filter((x) => x.id !== drag.id);
    shown = [...rest.slice(0, drag.index), zone.colors.find((x) => x.id === drag.id), ...rest.slice(drag.index)];
  }
  const used = new Set(TIERS.flatMap((t) => zone.dist?.[t] || []));
  return (
    <div className="gsec" style={{ top, left: L.pad, right: L.pad }}>
      <div className="gsec-head" style={{ height: G.secHead }}>
        <span className="row-title">Colores</span>
        <span className="link-btn nodrag nopan" onClick={() => addColor(zone.id, '#7f77dd')}>+ color</span>
      </div>
      <div className="gdist" style={{ height: G.distH }}>
        <DistBar owner={{ zone: zone.id }} dist={zone.dist} colors={zone.colors} height={36} />
      </div>
      <div className={`swatches ${drag ? 'sorting' : ''}`} ref={box} style={{ gap: G.swatchGap }}>
        {shown.map((c) => (
          <div
            key={c.id}
            className={`gswatch nodrag nopan ${drag?.id === c.id ? 'dragging' : ''} ${used.has(c.id) ? 'used' : ''}`}
            style={{ width: G.swatch, height: G.swatch, background: c.hex }}
            data-anchor={c.id}
            onPointerDown={(e) => startDrag(c, e)}
          >
            <button
              className="gswatch-hit"
              title="Cambiar el color"
              onClick={(e) => { if (!moved.current) openPopover('color', e.currentTarget, c.hex, (hex) => setColor(zone.id, c.id, hex)); }}
            />
            <span>{c.hex}</span>
            <XButton onClick={() => deleteColor(zone.id, c.id)} />
          </div>
        ))}
        {!zone.colors.length && <span className="gsec-empty">La paleta del vídeo: pulsa «+ color».</span>}
      </div>
    </div>
  );
}

const WEIGHTS = [[300, 'Light'], [400, 'Regular'], [500, 'Medium'], [700, 'Bold']];

function FontCard({ zoneId, font }) {
  const family = `"${font.family}", sans-serif`;
  const pick = (e) => openPopover('font', e.currentTarget, font.family, (f) => updateFont(zoneId, font.id, { family: f }));
  return (
    <div className="font-card nodrag nopan" style={{ height: G.fontCardH }} data-anchor={font.id}>
      <span className="font-aa" style={{ fontFamily: family }}>Aa</span>
      <div className="font-body">
        <div className="font-headline">
          <button className="font-pick" title="Cambiar la tipografía" onClick={pick}>
            <span style={{ fontFamily: family }}>{font.family}</span>
            <Icon name="chevron" size={14} />
          </button>
          <input
            className="font-role edit"
            value={font.role}
            placeholder="uso: títulos, texto…"
            onFocus={beginTyping}
            onChange={(e) => updateFont(zoneId, font.id, { role: e.target.value })}
          />
        </div>
        <div className="font-weights" style={{ fontFamily: family }}>
          {WEIGHTS.map(([w, label]) => <span key={w} style={{ fontWeight: w }}>{label}</span>)}
        </div>
        <div className="font-sample" style={{ fontFamily: family }}>El veloz murciélago hindú comía feliz cardillo y kiwi · 0123456789</div>
      </div>
      <XButton onClick={() => deleteFont(zoneId, font.id)} />
    </div>
  );
}

function FontsSection({ zone, top }) {
  const add = (e) => {
    const el = e.currentTarget;
    const id = addFont(zone.id, 'Segoe UI');
    openPopover('font', el, 'Segoe UI', (f) => updateFont(zone.id, id, { family: f }));
  };
  return (
    <div className="gsec" style={{ top, left: L.pad, right: L.pad }}>
      <div className="gsec-head" style={{ height: G.secHead }}>
        <span className="row-title">Tipografía</span>
        {zone.fonts.length < MAX_FONTS && <span className="link-btn nodrag nopan" onClick={add}>+ tipografía</span>}
        {zone.fonts.length > 0 && (
          <button
            className={`scale-toggle nodrag nopan ${zone.scaleOpen ? 'on' : ''}`}
            title={zone.scaleOpen ? 'Ocultar la escala tipográfica' : 'Ver la escala tipográfica (tamaños y pesos)'}
            onClick={() => toggleTypeScale(zone.id)}
          >
            <Icon name="textSize" size={15} />
            <Icon name="chevron" size={12} />
          </button>
        )}
      </div>
      <div className="fonts" style={{ gap: G.fontGap }}>
        {zone.fonts.map((f) => <FontCard key={f.id} zoneId={zone.id} font={f} />)}
        {!zone.fonts.length && <span className="gsec-empty">Hasta 3 tipografías, elegidas entre las instaladas en el ordenador.</span>}
      </div>
    </div>
  );
}

// Display, Título, Cuerpo… each with its font, weight and size.
function ScaleSection({ zone, top }) {
  const fontOf = (id) => zone.fonts.find((f) => f.id === id) || zone.fonts[0];
  return (
    <div className="gsec" style={{ top, left: L.pad, right: L.pad }}>
      <div className="gsec-head" style={{ height: G.secHead }}>
        <span className="row-title">Escala tipográfica</span>
      </div>
      {zone.typeScale.map((row) => {
        const f = fontOf(row.fontId);
        return (
          <div key={row.id} className="tscale-row nodrag nopan" style={{ height: scaleRowH(row) }}>
            <span className="ts-sample" style={{ fontFamily: `"${f?.family}", sans-serif`, fontWeight: row.weight, fontSize: row.size }}>
              {row.name}
            </span>
            {/* With a single font there's nothing to choose: just its name. */}
            {zone.fonts.length > 1 ? (
              <select className="ts-fontsel" value={f?.id} title="Tipografía" onChange={(e) => updateScale(zone.id, row.id, { fontId: e.target.value })}>
                {zone.fonts.map((x) => <option key={x.id} value={x.id}>{x.family}</option>)}
              </select>
            ) : <span className="ts-font">{f?.family}</span>}
            <select className="ts-weight" value={row.weight} title="Peso" onChange={(e) => updateScale(zone.id, row.id, { weight: Number(e.target.value) })}>
              {WEIGHTS.map(([w, label]) => <option key={w} value={w}>{label}</option>)}
              <option value={600}>Semibold</option>
            </select>
            <label className="ts-size" title="Tamaño">
              <input
                type="number"
                min={8}
                max={120}
                value={row.size}
                onFocus={beginTyping}
                onChange={(e) => { const v = Number(e.target.value); if (v >= 8 && v <= 120) updateScale(zone.id, row.id, { size: v }); }}
              />
              px
            </label>
          </div>
        );
      })}
    </div>
  );
}

// The zone's moodboard, from its header: a few thumbnails and how many
// pictures it has. Pictures can also be dropped straight on it.
function ZoneMoodButton({ zone, open, drop }) {
  const pictures = zone.moodboard.filter((i) => i.kind !== 'color');
  const pics = pictures.filter((i) => i.kind === 'image' || i.kind === 'video').slice(0, 3);
  return (
    <button
      className={`zmood-btn nodrag nopan ${open ? 'on' : ''} ${drop.over ? 'drop-over' : ''}`}
      data-zone-mood-btn={zone.id}
      onClick={() => setUi({ zoneMood: open ? null : zone.id })}
      {...drop.props}
    >
      {pics.length > 0 && <span className="zmood-thumbs">{pics.map((i) => <span key={i.id}><Media src={i.asset} fit="cover" /></span>)}</span>}
      <span>Moodboard{pictures.length ? ` · ${pictures.length}` : ''}</span>
      <Icon name="chevron" size={12} />
    </button>
  );
}

function ZoneNode({ data, selected, positionAbsoluteX, positionAbsoluteY }) {
  const moodOpen = useStore((s) => s.ui.zoneMood === data.zoneId);
  const moodDrop = useMediaDrop('mood:' + data.zoneId, (assets) => addMoodItems(data.zoneId, assets.map((asset) => ({ kind: mediaKindOf(asset), asset }))));
  // A click outside (or Esc) closes the moodboard dropdown; dragging a
  // picture into it doesn't.
  useCloseOnClickOutside(moodOpen, `[data-zone-mood="${data.zoneId}"], [data-zone-mood-btn="${data.zoneId}"], .popover, .cp, .mood-ghost, .lightbox`, () => setUi({ zoneMood: null }));
  const zone = useStore((s) => s.project.zones.find((z) => z.id === data.zoneId));
  const moments = useStore((s) => s.project.moments);
  const wpm = useStore((s) => s.project.settings.wpm);
  const draggingZone = useStore((s) => s.ui.dragging === 'zone');
  const [dropSide, setDropSide] = useState(null);

  if (!zone) return null;
  const general = zone.kind === 'general';
  const d = data.d;
  const secs = zone.momentIds.reduce((acc, id) => acc + (moments[id] ? momentDuration(moments[id], wpm) : 0), 0);
  const n = zone.momentIds.length;

  const remove = () => {
    deleteZone(zone.id);
    const what = general ? 'Ventana' : 'Zona';
    notify(n ? `${what} "${zone.name}" borrada con sus ${n} momentos` : `${what} "${zone.name}" borrada`, true);
  };

  // Dragging a zone's number over another zone changes the chronological order.
  const onZoneDragOver = (e) => {
    if (general || !e.dataTransfer.types.includes(ZONE_TYPE)) return;
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    setDropSide(e.clientX < r.left + r.width / 2 ? 'left' : 'right');
  };
  const onZoneDrop = (e) => {
    const id = e.dataTransfer.getData(ZONE_TYPE);
    setDropSide(null);
    if (!id || general) return;
    e.preventDefault();
    moveZoneTo(id, dropSide === 'left' ? zone.id : data.nextZoneId);
    endDrag();
  };

  // Resizing is shown live and kept as one undo step. Only the left and top
  // handles move the zone; with the others it keeps following the previous one.
  const movedBy = (p) => Math.abs(p.x - positionAbsoluteX) > 0.5 || Math.abs(p.y - positionAbsoluteY) > 0.5;
  const resize = (_e, p) => setZoneBox(zone.id, {
    pos: movedBy(p) ? { x: p.x, y: p.y } : undefined,
    size: { w: p.width, h: p.height },
  }, { typing: true });

  return (
    <div
      className={`zone ${general ? 'zone-general' : ''} ${dropSide ? 'zone-drop-' + dropSide : ''} ${selected ? 'sel' : ''}`}
      style={{ '--zc': zone.color }}
      data-anchor={zone.id}
      onDragOver={draggingZone ? onZoneDragOver : undefined}
      onDragLeave={() => setDropSide(null)}
      onDrop={draggingZone ? onZoneDrop : undefined}
      onDoubleClick={general ? (e) => { if (!e.target.closest(INTERACTIVE + ', .tile')) setUi({ isolate: 'zone-' + zone.id }); } : undefined}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={data.contentW}
        minHeight={Math.min(data.contentH, 200)}
        lineClassName="zone-resize-line"
        handleClassName="zone-resize-handle"
        onResizeStart={beginTyping}
        onResize={resize}
        onResizeEnd={(_e, p) => setZoneBox(zone.id, {
          pos: zone.pos ? { x: snap(p.x), y: snap(p.y) } : undefined,
          size: { w: snap(p.width), h: snap(p.height) },
        }, { typing: true })}
      />
      <div className="zone-head zone-drag" style={{ height: L.header }} title={general ? 'Arrastra para moverla · doble clic dentro para trabajar en ella aislada' : 'Arrastra la cabecera para colocarla en otro sitio'}>
        {!general && (
          <span
            className="order nodrag nopan"
            title="Orden cronológico. Arrástralo sobre otra zona para cambiar el orden"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(ZONE_TYPE, zone.id);
              e.dataTransfer.effectAllowed = 'move';
              setUi({ dragging: 'zone' });
            }}
            onDragEnd={endDrag}
          >
            {data.order}
          </span>
        )}
        <input
          className="zone-name nodrag nopan"
          maxLength={NAME_MAX}
          value={zone.name}
          onFocus={beginTyping}
          onChange={(e) => renameZone(zone.id, e.target.value)}
        />
        {!general && <span className="fixed-meta">{n} {n === 1 ? 'momento' : 'momentos'} · {formatSeconds(secs)}</span>}
        <div className="zone-actions nodrag nopan">
          {!general && (
            <button
              className="color-btn"
              title="Color de la zona"
              style={{ background: zone.color }}
              onClick={(e) => openPopover('color', e.currentTarget, zone.color, (hex) => setZoneColor(zone.id, hex))}
            />
          )}
          {!data.main && <button className="icon-btn" title={general ? 'Borrar la ventana' : 'Borrar la zona'} onClick={remove}><Icon name="close" size={14} /></button>}
        </div>
        {/* Last in the header, so its dropdown lines up with the zone's edge. */}
        {!general && <ZoneMoodButton zone={zone} open={moodOpen} drop={moodDrop} />}
      </div>

      {!general && (
        // A new zone right after this one, from the space between zones.
        <button
          className="zone-add-after nodrag nopan"
          style={{ left: '100%', marginLeft: L.zoneGap / 2 - 15, top: L.header / 2 - 15 }}
          onClick={() => addZoneAfter(zone.id)}
        >
          <Icon name="plus" size={14} />
        </button>
      )}
      {!general && <RowLabels d={d} />}
      {!general && data.gaps.map((g) => <AddLine key={g.index} zoneId={zone.id} gap={g} height={momentHeightOf(d)} />)}
      {!general && !n && (
        <div className="zone-empty" style={{ top: L.header + 60, left: L.pad + L.laneLabel + L.gapW + 10 }}>
          Zona vacía. Haz clic en la línea discontinua para añadir un momento,
          o pega el guion en la vista <b>Guion</b>.
        </div>
      )}

      {data.incoming && (
        // How this zone is entered: the transition after the previous zone's last picture.
        <div
          className="tr-in"
          style={{ left: L.pad + L.laneLabel + L.gapW + (data.d?.colPad ?? 12), top: L.header + (data.d?.momentHead ?? 34) + (data.d?.rowBoceto ?? 150) + 6, '--from': data.incoming.color }}
          title={`Transición desde el final de «${data.incoming.from}» (se cambia allí)`}
        >
          <span className="tr-in-from">← {data.incoming.from}</span>
          <span className="tr-in-text" dangerouslySetInnerHTML={{ __html: richOf(data.incoming.html, data.incoming.text) }} />
        </div>
      )}
      {data.sections && zone.colors && (
        <>
          <ColorsSection zone={zone} top={data.sections.colorsY} />
          <FontsSection zone={zone} top={data.sections.fontsY} />
          {data.sections.hasScale && <ScaleSection zone={zone} top={data.sections.scaleY} />}
        </>
      )}
      {general && <Moodboard zone={zone} top={data.moodY} mood={data.mood} general={general} main={!!data.sections} />}
      {!general && moodOpen && (
        <ViewportPortal>
          <div
            className="zmood-pop nodrag nopan nowheel"
            data-zone-mood={zone.id}
            style={{ left: positionAbsoluteX + data.width - L.pad - ZONE_MOOD_W, top: positionAbsoluteY + L.header + 4, width: ZONE_MOOD_W }}
          >
            <Moodboard zone={zone} mood={data.mood} panel />
          </div>
        </ViewportPortal>
      )}
    </div>
  );
}

export default memo(ZoneNode);
