import { useEffect, useRef } from 'react';
import { useStore, setUi } from './store.js';

// Closes a dropdown with a click outside it (`inside`: a selector for the
// dropdown and its button). Dragging something into it never closes it.
export function useCloseOnClickOutside(open, inside, onClose) {
  useEffect(() => {
    if (!open) return undefined;
    let start = null;
    const down = (e) => { start = { x: e.clientX, y: e.clientY }; };
    const click = (e) => {
      if (e.target.closest?.(inside)) return;
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 5) return;
      onClose();
    };
    const key = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('click', click, true);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('click', click, true);
      window.removeEventListener('keydown', key);
    };
  }, [open, inside]); // eslint-disable-line react-hooks/exhaustive-deps
}

// Puts the cursor in a field right after it is created (ui.focusId === id).
export function useFocusOnCreate(id) {
  const ref = useRef(null);
  const focus = useStore((s) => s.ui.focusId === id);
  useEffect(() => {
    if (focus && ref.current) {
      ref.current.focus();
      setUi({ focusId: null });
    }
  }, [focus]);
  return ref;
}
