import { useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useStore, setUi } from './store.js';
import { mediaToBoard, moveMedia, moveMoodItem } from './actions.js';
import { dropTargetAt, onEmptyBoard } from './util.js';

// Dragging an item of a moodboard (columns on the board, rows in the strip).
// While the pointer is over the moodboard, `place(item)` gives a function
// that, for the pointer, returns how the moodboard would look ({ lay }) and
// how to keep it ({ apply }): the others make room and, in the hand, the
// item already has the size it will have. Dropped out of it, on a slot,
// another moodboard or the board, it moves there (Alt copies). A press
// without moving calls onClick.
export function useMoodDrag({ zoneId, lay, gridRef, interactive, place, onClick }) {
  const [drag, setDrag] = useState(null); // { id, lay, ghost }
  const { screenToFlowPosition } = useReactFlow();
  const own = 'mood:' + zoneId;

  const startMove = (item) => (e) => {
    if (e.button !== 0 || e.target.closest(interactive)) return;
    e.stopPropagation();
    const tile = e.currentTarget.getBoundingClientRect();
    const grab = { x: e.clientX - tile.left, y: e.clientY - tile.top };
    const origin = { x: e.clientX, y: e.clientY };
    const media = item.kind === 'image' || item.kind === 'video';
    const at = place(item);
    let active = false;
    let last = null;

    const move = (ev) => {
      if (!active && Math.hypot(ev.clientX - origin.x, ev.clientY - origin.y) < 5) return;
      active = true;
      const g = gridRef.current.getBoundingClientRect();
      // On the board the moodboard is drawn at the board's zoom.
      const k = g.width / lay.width || 1;
      // The moodboard, and below it: room for the item in the hand, or down
      // to the bottom of its window.
      const bottom = Math.max(g.bottom + tile.height + 20, gridRef.current.closest('.mood, .sgroup')?.getBoundingClientRect().bottom ?? 0);
      const inside = ev.clientX >= g.left - 10 && ev.clientX <= g.right + 10 && ev.clientY >= g.top - 30 && ev.clientY <= bottom;
      let res = null;
      let target = null;
      if (inside) {
        res = at({ x: (ev.clientX - grab.x - g.left) / k, y: (ev.clientY - grab.y - g.top) / k, px: (ev.clientX - g.left) / k, py: (ev.clientY - g.top) / k });
      } else {
        target = dropTargetAt(ev.clientX, ev.clientY, '.mood-ghost');
        if (target === own) target = null;
      }
      const board = media && !inside && !target && onEmptyBoard(ev.clientX, ev.clientY);
      if (useStore.getState().ui.dropHover !== target) setUi({ dropHover: target });
      // In the hand: the size it will have where it lands.
      const r = res?.lay.rects[item.id];
      const w = r ? r.w * k : tile.width;
      const h = r ? r.h * k : tile.height;
      last = { res, target, board, alt: ev.altKey, at: { x: ev.clientX - grab.x, y: ev.clientY - grab.y } };
      setDrag({ id: item.id, lay: res?.lay, ghost: { x: ev.clientX - grab.x * (w / tile.width), y: ev.clientY - grab.y * (h / tile.height), w, h } });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setUi({ dropHover: null });
      setDrag(null);
      if (!active) { onClick?.(item); return; }
      if (!last) return;
      const from = { kind: 'mood', zoneId, itemId: item.id };
      if (last.res) last.res.apply();
      else if (last.target?.startsWith('mood:')) moveMoodItem(zoneId, item.id, last.target.slice(5), last.alt);
      else if (last.target && media) moveMedia({ asset: item.asset, from }, last.target, last.alt);
      else if (last.board) {
        const p = screenToFlowPosition(last.at);
        mediaToBoard({ asset: item.asset, from }, p.x, p.y, last.alt);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return { drag, view: drag?.lay || lay, startMove };
}

// Dragging a corner: `step(dx, dy)` runs for every move (in the moodboard's
// own units); the cursor stays the resize one meanwhile.
export function cornerDrag(e, k, step) {
  if (e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();
  const x0 = e.clientX;
  const y0 = e.clientY;
  const move = (ev) => step((ev.clientX - x0) / k, (ev.clientY - y0) / k);
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    document.body.classList.remove('mood-sizing');
  };
  document.body.classList.add('mood-sizing');
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}
