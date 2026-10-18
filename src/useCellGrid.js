import { useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useStore, setUi, beginTyping } from './store.js';
import { mediaToBoard, moveMedia, moveMoodItem } from './actions.js';
import { cellRects, settleCells } from './layout.js';
import { dropTargetAt, onEmptyBoard } from './util.js';

// Moving and sizing items of a moodboard laid out in cells (see moodLayout),
// on the board or in the strip.
// - Drag an item: it takes the cells under the picture in the hand, the
//   others make room (they go down, and rise into gaps); drop it out of the
//   grid on a slot, another moodboard or the board to move it there (Alt
//   copies). A press without moving calls onClick.
// - Drag its corner: wider or narrower and taller or shorter, a cell at a
//   time; whatever it grows over goes down.
// commit(cells, opts) saves the cells of every item.
export function useCellGrid({ zoneId, lay, gridRef, commit, interactive, onClick }) {
  const [drag, setDrag] = useState(null); // { id, cells, ghost, sizing }
  const { screenToFlowPosition } = useReactFlow();
  const own = 'mood:' + zoneId;
  // On the board the grid is drawn at the board's zoom.
  const scaleOf = () => gridRef.current.getBoundingClientRect().width / lay.width || 1;

  const startMove = (item) => (e) => {
    if (e.button !== 0 || e.target.closest(interactive)) return;
    e.stopPropagation();
    const start = lay.cells;
    const me = start.find((c) => c.id === item.id);
    if (!me) return;
    const tile = e.currentTarget.getBoundingClientRect();
    const grab = { x: e.clientX - tile.left, y: e.clientY - tile.top };
    const origin = { x: e.clientX, y: e.clientY };
    const media = item.kind === 'image' || item.kind === 'video';
    let active = false;
    let last = null;

    const move = (ev) => {
      if (!active && Math.hypot(ev.clientX - origin.x, ev.clientY - origin.y) < 5) return;
      active = true;
      const g = gridRef.current.getBoundingClientRect();
      const k = scaleOf();
      // The grid, and below it: room for the picture in the hand, or down
      // to the bottom of its window.
      const bottom = Math.max(g.bottom + tile.height + 20, gridRef.current.closest('.mood, .sgroup')?.getBoundingClientRect().bottom ?? 0);
      const inside = ev.clientX >= g.left - 10 && ev.clientX <= g.right + 10 && ev.clientY >= g.top - 30 && ev.clientY <= bottom;
      let cells = null;
      let target = null;
      if (inside) {
        // The cells under the picture in the hand (its top left corner).
        const gx = Math.max(0, Math.min(lay.cols - me.gw, Math.round((ev.clientX - grab.x - g.left) / (lay.step * k))));
        const gy = Math.max(0, Math.round((ev.clientY - grab.y - g.top) / (lay.step * k)));
        cells = settleCells(start.map((c) => (c.id === item.id ? { ...c, gx, gy } : c)), lay.cols, item.id);
      } else {
        target = dropTargetAt(ev.clientX, ev.clientY, '.mood-ghost');
        if (target === own) target = null;
      }
      const board = media && !inside && !target && onEmptyBoard(ev.clientX, ev.clientY);
      if (useStore.getState().ui.dropHover !== target) setUi({ dropHover: target });
      last = { cells, target, board, alt: ev.altKey, at: { x: ev.clientX - grab.x, y: ev.clientY - grab.y } };
      setDrag({ id: item.id, cells, ghost: { x: ev.clientX - grab.x, y: ev.clientY - grab.y, w: tile.width, h: tile.height } });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setUi({ dropHover: null });
      setDrag(null);
      if (!active) { onClick?.(item); return; }
      if (!last) return;
      const from = { kind: 'mood', zoneId, itemId: item.id };
      if (last.cells) {
        if (last.cells.some((c, i) => c.gx !== start[i].gx || c.gy !== start[i].gy)) commit(last.cells);
      } else if (last.target?.startsWith('mood:')) moveMoodItem(zoneId, item.id, last.target.slice(5), last.alt);
      else if (last.target && media) moveMedia({ asset: item.asset, from }, last.target, last.alt);
      else if (last.board) {
        const p = screenToFlowPosition(last.at);
        mediaToBoard({ asset: item.asset, from }, p.x, p.y, last.alt);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const startSize = (item) => (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const start = lay.cells;
    const me = start.find((c) => c.id === item.id);
    const r0 = lay.rects[item.id];
    if (!me || !r0) return;
    const k = scaleOf();
    const x0 = e.clientX;
    const y0 = e.clientY;
    let size = `${me.gw}x${me.gh}`;
    beginTyping();
    setDrag({ id: item.id, sizing: true });
    const move = (ev) => {
      const gw = Math.max(lay.minW, Math.min(lay.cols - me.gx, Math.round((r0.w + (ev.clientX - x0) / k + lay.gap) / lay.step)));
      const gh = Math.max(lay.minH, Math.round((r0.h + (ev.clientY - y0) / k + lay.gap) / lay.step));
      if (`${gw}x${gh}` === size) return;
      size = `${gw}x${gh}`;
      commit(settleCells(start.map((c) => (c.id === item.id ? { ...c, gw, gh } : c)), lay.cols, item.id), { typing: true });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.classList.remove('cell-sizing');
      setDrag(null);
    };
    document.body.classList.add('cell-sizing');
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // What to draw: the layout, or while moving inside, how it would end up.
  const view = drag?.cells ? { ...lay, cells: drag.cells, ...cellRects(drag.cells, lay) } : lay;
  return { drag, view, startMove, startSize };
}
