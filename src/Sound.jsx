import { create } from 'zustand';
import Icon from './Icon.jsx';

// One volume for the whole app, remembered between sessions.
const read = () => {
  try { const v = parseFloat(localStorage.getItem('sb-volume')); return Number.isFinite(v) ? v : 0.8; } catch { return 0.8; }
};
export const useVolume = create((set) => ({
  volume: read(),
  setVolume: (volume) => {
    try { localStorage.setItem('sb-volume', String(volume)); } catch { /* not stored */ }
    set({ volume });
  },
}));

// A speaker that turns a video's sound on or off; hovering it shows the
// volume. `on` is whether this video plays with sound.
export default function SoundControl({ on, onToggle, className = '' }) {
  const volume = useVolume((s) => s.volume);
  const setVolume = useVolume((s) => s.setVolume);
  const loud = on && volume > 0;
  return (
    <span
      className={`sound nodrag nopan ${on ? 'on' : ''} ${className}`}
      onPointerDown={(e) => {
        e.stopPropagation();
        // Moving the volume never drags the picture it sits on: a draggable
        // picture would take the gesture, and the slider would only take clicks.
        const host = e.currentTarget.closest('[draggable="true"]');
        if (!host) return;
        host.draggable = false;
        window.addEventListener('pointerup', () => { host.draggable = true; }, { once: true });
      }}
      onDoubleClick={(e) => e.stopPropagation()}
      onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); }}
    >
      <button
        className="sound-btn"
        title={loud ? 'Quitar el sonido' : 'Activar el sonido'}
        onClick={(e) => { e.stopPropagation(); if (on && volume === 0) setVolume(0.6); else onToggle(!on); }}
      >
        <Icon name={loud ? 'speaker' : 'speakerOff'} size={14} />
      </button>
      {on && (
        <input
          className="sound-vol"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          style={{ '--v': `${Math.round(volume * 100)}%` }}
          title={`Volumen ${Math.round(volume * 100)} %`}
          onChange={(e) => setVolume(Number(e.target.value))}
          onClick={(e) => e.stopPropagation()}
        />
      )}
    </span>
  );
}
