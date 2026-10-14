import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ReactFlow, Background, BackgroundVariant, Controls, MiniMap, Panel, SelectionMode, applyNodeChanges, useReactFlow } from '@xyflow/react';
import { useStore, setUi } from '../store.js';
import { addFree, addFreeImages, copyFree, deleteFree, mediaToBoard, moveFreeItems, moveMedia, raiseFree, setZoneBox, zoneNodeId } from '../actions.js';
import { GRID, L, computeLayout } from '../layout.js';
import { DRAG_TYPE, draggedMedia, dropTargetAt, hasFilesOrUrl, importDroppedImages, onEmptyBoard } from '../util.js';
import ZoneNode from './ZoneNode.jsx';
import MomentNode from './MomentNode.jsx';
import { NoteNode, BigTextNode, FreeImageNode } from './FreeNodes.jsx';
import { ArrowLayer, DrawOverlay } from './Arrows.jsx';
import AlignBar from './AlignBar.jsx';
import Icon from '../Icon.jsx';

const nodeTypes = { zone: ZoneNode, moment: MomentNode, note: NoteNode, bigtext: BigTextNode, image: FreeImageNode };

function buildNodes(project, layout) {
  const nodes = [];
  const normals = project.zones.filter((z) => z.kind === 'normal');
  const mainGeneral = project.zones.find((z) => z.kind === 'general');
  // The cut after the last picture of a zone leads into the next zone: the
  // next zone shows it too, at its start, wherever it sits on the board.
  const lastShotOf = (zone) => {
    const m = project.moments[zone?.momentIds[zone.momentIds.length - 1]];
    return m?.shots[m.shots.length - 1] || m?.trOut || null;
  };
  for (const z of project.zones) {
    const l = layout.zones[z.id];
    const next = normals[normals.indexOf(z) + 1];
    const prev = z.kind === 'normal' ? normals[normals.indexOf(z) - 1] : null;
    const into = prev && lastShotOf(prev);
    nodes.push({
      id: zoneNodeId(z.id), type: 'zone', position: { x: l.x, y: l.y }, width: l.w, height: l.h,
      data: {
        zoneId: z.id, moodY: l.moodY, color: z.color, gaps: l.gaps, mood: l.mood, sections: l.sections, width: l.w,
        contentW: l.contentW, contentH: l.contentH, nextZoneId: next?.id ?? null, d: l.d,
        order: normals.indexOf(z) + 1, main: z === mainGeneral,
        incoming: into?.transition ? { text: into.transition, html: into.trHtml, from: prev.name, color: prev.color } : null,
      },
      // Moved by its header (the rest of the zone is full of fields).
      dragHandle: '.zone-drag', deletable: false, zIndex: 0,
    });
  }
  // Moments live inside their zone, so they travel with it.
  for (const [id, l] of Object.entries(layout.moments)) {
    const zone = project.zones.find((z) => z.id === l.zoneId);
    const zoneEnd = zone.momentIds[zone.momentIds.length - 1] === id;
    const after = zoneEnd ? normals[normals.indexOf(zone) + 1] : null;
    nodes.push({
      id, type: 'moment', parentId: zoneNodeId(l.zoneId), position: l.rel, width: l.w, height: l.h,
      data: {
        momentId: id, index: l.index, zoneId: l.zoneId, localIndex: zone.momentIds.indexOf(id), d: l.d,
        zoneEnd, nextZone: after ? { name: after.name, color: after.color } : null,
      },
      draggable: false, selectable: false, deletable: false, zIndex: 1,
    });
  }
  // Loose items above the zones, each on its own layer: the last in the list on top.
  project.free.forEach((f, i) => {
    nodes.push({ id: f.id, type: f.type, position: { x: f.x, y: f.y }, width: f.w, height: f.h, data: { id: f.id }, zIndex: 2 + i });
  });
  return nodes;
}

// Where a zone would sit if it had never been moved: right after the
// previous one (the first one at the origin).
const SNAP_BACK = 72;
function naturalSlot(project, layout, zoneId) {
  const i = project.zones.findIndex((z) => z.id === zoneId);
  if (i < 0) return null;
  if (i === 0) return { x: 0, y: 0 };
  const prev = layout.zones[project.zones[i - 1].id];
  return prev ? { x: prev.x + prev.w + L.zoneGap, y: prev.y } : null;
}

// Smooth scrolling of a text box: each notch moves the target and the box
// glides to it.
const glide = new WeakMap();
function smoothScroll(el, dy) {
  const st = glide.get(el) || { target: el.scrollTop, raf: 0 };
  st.target = Math.max(0, Math.min(el.scrollHeight - el.clientHeight, st.target + dy));
  glide.set(el, st);
  if (st.raf) return;
  const step = () => {
    const d = st.target - el.scrollTop;
    if (Math.abs(d) < 1) {
      el.scrollTop = st.target;
      glide.delete(el);
      return;
    }
    el.scrollTop += Math.sign(d) * Math.max(1, Math.abs(d) * 0.22);
    st.raf = requestAnimationFrame(step);
  };
  st.raf = requestAnimationFrame(step);
}

// Texts on the board that scroll with the wheel when they overflow.
const SCROLLS = '.rich, .edit, .tr-text, .cita-text, .word-text, .row-src, textarea';

const dropTargetFor = (x, y, draggedId) => dropTargetAt(x, y, `.react-flow__node[data-id="${draggedId}"]`);

// Store-derived nodes replace the local ones, but keep what React Flow
// measured and what the user has selected.
function mergeNodes(prev, next) {
  const old = new Map(prev.map((n) => [n.id, n]));
  return next.map((n) => {
    const p = old.get(n.id);
    if (!p) return n;
    // Something being dragged keeps following the pointer.
    return p.dragging ? { ...n, measured: p.measured, selected: p.selected, position: p.position, dragging: true } : { ...n, measured: p.measured, selected: p.selected };
  });
}

export default function Canvas() {
  const project = useStore((s) => s.project);
  const tool = useStore((s) => s.ui.tool);
  const dragging = useStore((s) => s.ui.dragging);
  const pendingCenter = useStore((s) => s.ui.pendingCenter);
  const isolate = useStore((s) => s.ui.isolate);
  const theme = useStore((s) => s.ui.theme);
  const [showMap, setShowMap] = useState(() => { try { return localStorage.getItem('sb-map') !== 'off'; } catch { return true; } });
  const toggleMap = () => setShowMap((v) => { try { localStorage.setItem('sb-map', v ? 'off' : 'on'); } catch { /* not stored */ } return !v; });
  const { screenToFlowPosition, setCenter, fitView, getViewport, setViewport } = useReactFlow();

  const layout = useMemo(() => computeLayout(project), [project.zones, project.moments]);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const derivedNodes = useMemo(() => buildNodes(project, layout), [project.free, project.zones, layout]);
  const [nodes, setNodes] = useState(derivedNodes);
  useEffect(() => setNodes((prev) => mergeNodes(prev, derivedNodes)), [derivedNodes]);

  // Coming from the script view: centre on the chosen moment.
  useEffect(() => {
    if (!pendingCenter) return;
    const l = layout.moments[pendingCenter];
    setUi({ pendingCenter: null });
    if (!l) return;
    setCenter(l.x + l.w / 2, l.y + l.h / 2, { zoom: 0.8 });
    setUi({ flash: pendingCenter });
    setTimeout(() => { if (useStore.getState().ui.flash === pendingCenter) setUi({ flash: null }); }, 1600);
  }, [pendingCenter, layout, setCenter]);

  // Working on one window in isolation: frame it and dim everything else;
  // leaving puts the view back where it was.
  const savedView = useRef(null);

  // The wheel over a text on the board scrolls it while it has more to show
  // (even a single hidden line); at its end, or over anything else, it zooms.
  const box = useRef(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      if (e.ctrlKey || !e.deltaY) return;
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
      for (let t = e.target; t && t !== el; t = t.parentElement) {
        if (!t.matches?.(SCROLLS)) continue;
        const max = t.scrollHeight - t.clientHeight;
        if (max < 1) continue;
        const at = glide.get(t)?.target ?? t.scrollTop;
        if ((dy > 0 && at < max - 0.5) || (dy < 0 && at > 0.5)) {
          // At most half the box per notch, so short texts don't jump.
          smoothScroll(t, Math.sign(dy) * Math.min(Math.abs(dy), t.clientHeight * 0.5));
          e.preventDefault();
          e.stopPropagation();
          return;
        }
      }
    };
    el.addEventListener('wheel', onWheel, { capture: true, passive: false });
    return () => el.removeEventListener('wheel', onWheel, { capture: true });
  }, []);
  useEffect(() => {
    if (isolate) {
      if (!savedView.current) savedView.current = getViewport();
      setTimeout(() => fitView({ nodes: [{ id: isolate }], padding: 0.14, maxZoom: 1.6 }), 0);
    } else if (savedView.current) {
      setViewport(savedView.current);
      savedView.current = null;
    }
  }, [isolate, fitView, getViewport, setViewport]);
  const shown = useMemo(
    () => (isolate
      ? nodes.map((n) => (n.id === isolate || n.parentId === isolate
        ? { ...n, zIndex: (n.zIndex || 0) + 1000 }
        : { ...n, className: 'dimmed', selectable: false, draggable: false }))
      : nodes),
    [nodes, isolate],
  );
  const isolatedName = isolate && project.zones.find((z) => zoneNodeId(z.id) === isolate)?.name;

  const onNodesChange = useCallback((changes) => {
    const removed = changes.filter((c) => c.type === 'remove').map((c) => c.id);
    if (removed.length) deleteFree(removed);
    setNodes((ns) => applyNodeChanges(changes.filter((c) => c.type !== 'remove'), ns));
  }, []);

  // Where dragged items started, to put them back after an Alt-copy.
  const dragStart = useRef({});
  const onNodeDragStart = useCallback((_e, _node, dragged) => {
    dragStart.current = Object.fromEntries(dragged.map((n) => [n.id, { ...n.position }]));
    const free = dragged.filter((n) => n.type !== 'zone' && n.type !== 'moment');
    // Alt: a copy stays where the item was, so the original never vanishes.
    if (free.length && _e?.altKey) copyFree(free.map((n) => ({ id: n.id, x: n.position.x, y: n.position.y })));
    if (free.length) raiseFree(free.map((n) => n.id));
  }, []);
  // A loose item that is clicked comes to the top.
  const onNodeClick = useCallback((_e, node) => {
    if (node.type !== 'zone' && node.type !== 'moment') raiseFree([node.id]);
  }, []);

  // A loose image or video dragged over a slot lights the slot up.
  // Dragging near the edge pans the board, except over the style strip
  // (it sits right at the edge): there the board stays still to drop.
  const [autoPan, setAutoPan] = useState(true);
  const onNodeDrag = useCallback((e, node, dragged) => {
    const overStrip = !!document.elementFromPoint(e.clientX, e.clientY)?.closest('.strip');
    setAutoPan((a) => (a === !overStrip ? a : !overStrip));
    const target = dragged.length === 1 && node.type === 'image' ? dropTargetFor(e.clientX, e.clientY, node.id) : null;
    if (useStore.getState().ui.dropHover !== target) setUi({ dropHover: target });
  }, []);

  const onNodeDragStop = useCallback((e, node, dragged) => {
    setAutoPan(true);
    setUi({ dropHover: null });
    const target = dragged.length === 1 && node.type === 'image' ? dropTargetFor(e.clientX, e.clientY, node.id) : null;
    if (target) {
      const f = useStore.getState().project.free.find((x) => x.id === node.id);
      moveMedia({ asset: f.asset, from: { kind: 'free', id: f.id } }, target, e.altKey);
      if (e.altKey) {
        // Alt: copy into the slot and leave the loose one where it was.
        const p = dragStart.current[node.id];
        setNodes((ns) => ns.map((n) => (n.id === node.id ? { ...n, position: p } : n)));
      }
      return;
    }
    const zoneMoves = dragged.filter((n) => n.type === 'zone');
    for (const z of zoneMoves) {
      // Dropped next to its natural place (right after the previous zone), it
      // joins the row again and follows that zone when it moves or grows.
      const slot = naturalSlot(useStore.getState().project, layoutRef.current, z.data.zoneId);
      // About 40 px on screen, whatever the zoom.
      const tol = Math.max(SNAP_BACK, 40 / getViewport().zoom);
      const near = slot && Math.abs(z.position.x - slot.x) < tol && Math.abs(z.position.y - slot.y) < tol;
      setZoneBox(z.data.zoneId, { pos: near ? null : { x: z.position.x, y: z.position.y } });
    }
    const free = dragged.filter((n) => n.type !== 'zone' && n.type !== 'moment');
    if (free.length) moveFreeItems(free.map((n) => ({ id: n.id, x: n.position.x, y: n.position.y })));
  }, []);

  const onDragOver = (e) => {
    if (hasFilesOrUrl(e.dataTransfer) || e.dataTransfer.types.includes(DRAG_TYPE)) e.preventDefault();
  };

  // Images dropped on empty canvas become free images.
  const onDrop = async (e) => {
    e.preventDefault();
    const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const item = draggedMedia(e.dataTransfer);
    if (item) {
      // A picture taken out of a zone or window stays loose on the board
      // (dropped on a zone outside any slot, it goes back where it was).
      if (item.asset && onEmptyBoard(e.clientX, e.clientY)) mediaToBoard(item, pos.x - 120, pos.y - 90, e.altKey);
      return;
    }
    const assets = await importDroppedImages(e.dataTransfer);
    if (assets.length) addFreeImages(assets, pos.x, pos.y);
  };

  const createAt = (type, e) => {
    const p = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const item = type === 'bigtext'
      ? { type, x: p.x - 200, y: p.y - 40, w: 400, h: 90 }
      : { type, x: p.x - 110, y: p.y - 75 };
    setUi({ focusId: addFree(item), tool: 'select' });
  };

  const onPaneClick = () => setUi({ selectedArrow: null, editingArrow: null });

  const onDoubleClick = (e) => {
    if (tool === 'select' && e.target.classList?.contains('react-flow__pane')) createAt('note', e);
  };

  return (
    <div
      ref={box}
      className={`canvas tool-${tool} ${dragging ? 'is-dragging' : ''} ${isolate ? 'isolating' : ''}`}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDoubleClick={onDoubleClick}
    >
      <ReactFlow
        nodes={shown}
        colorMode={theme}
        edges={[]}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStart={onNodeDragStart}
        onNodeClick={onNodeClick}
        onNodeDrag={onNodeDrag}
        autoPanOnNodeDrag={autoPan}
        onNodeDragStop={onNodeDragStop}
        snapToGrid
        snapGrid={[GRID, GRID]}
        onPaneClick={onPaneClick}
        deleteKeyCode={['Delete', 'Backspace']}
        elevateNodesOnSelect={false}
        zoomOnDoubleClick={false}
        panOnDrag={[1]}
        selectionOnDrag={tool === 'select'}
        selectionMode={SelectionMode.Partial}
        multiSelectionKeyCode={['Shift', 'Control', 'Meta']}
        panActivationKeyCode="Space"
        minZoom={0.04}
        maxZoom={4}
        fitView
        fitViewOptions={{ padding: 0.08, maxZoom: 0.9 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1.2} color={theme === 'dark' ? '#3d3d3d' : '#d0cdc3'} />
        <Controls showInteractive={false} position="bottom-right" />
        {/* The map can fold away (e.g. in split screen); it remembers the choice. */}
        <Panel position="top-right" className="map-toggle-panel">
          <button
            className={`map-toggle ${showMap ? 'on' : ''}`}
            title={showMap ? 'Ocultar el mapa' : 'Ver el mapa'}
            onClick={toggleMap}
          >
            <Icon name={showMap ? 'chevron' : 'map'} size={14} />
          </button>
        </Panel>
        {showMap && <MiniMap
          pannable
          zoomable
          style={{ width: 150, height: 100 }}
          position="top-right"
          nodeColor={(n) => (n.type === 'zone' ? n.data.color + '55' : n.type === 'moment' ? (theme === 'dark' ? '#1d1d1d' : '#ffffff') : '#f5d76e')}
          nodeStrokeColor={(n) => (n.type === 'zone' ? n.data.color : '#c9c7bd')}
          maskColor={theme === 'dark' ? 'rgba(48,48,48,0.6)' : 'rgba(236,235,229,0.65)'}
        />}
        <Panel position="bottom-left" className="board-logo-panel">
          <span className="board-logo" role="img" aria-label="StoryND" title="StoryND" />
        </Panel>
        <ArrowLayer />
        <AlignBar />
      </ReactFlow>
      {tool === 'arrow' && <DrawOverlay />}
      {isolate && (
        <div className="isolate-bar">
          <span>Trabajando en <b>{isolatedName}</b></span>
          <button className="ghost" onClick={() => setUi({ isolate: null })}>Salir <kbd>Esc</kbd></button>
        </div>
      )}
      {(tool === 'note' || tool === 'text') && (
        <div className="place-overlay" onClick={(e) => createAt(tool === 'text' ? 'bigtext' : 'note', e)} />
      )}
    </div>
  );
}
