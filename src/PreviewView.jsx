import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useStore, setUi, beginTyping } from './store.js';
import { setMomentDuration } from './actions.js';
import { buildTimeline, formatTime, segmentAt } from './timeline.js';
import { isEditableTarget } from './util.js';
import { isVideoMedia, mediaUrl, thumbUrl } from './media.js';
import Media from './Media.jsx';
import Icon from './Icon.jsx';
import { richOf } from './richtext.js';

// Still picture for a frame in the strip (videos without a thumbnail get none).
const segThumb = (src) => (!src ? null : thumbUrl(src) || (isVideoMedia(src) ? null : mediaUrl(src)));

// Opens the same detail view as on the board, without leaving the preview.
const edit = (momentId) => setUi({ focusMoment: momentId });

function Stage({ seg, speed }) {
  // The moment's description, shown on frosted glass when the pointer is over
  // the picture (like the text on moodboard pictures).
  const moment = useStore((s) => (seg ? s.project.moments[seg.momentId] : null));
  const desc = moment?.description?.trim() ? richOf(moment.descHtml, moment.description) : null;
  if (!seg) return <div className="pv-stage"><p className="pv-empty">Todavía no hay momentos. Pega el guion en la vista Guion.</p></div>;
  return (
    <div className="pv-stage" title="Doble clic para editar este momento" onDoubleClick={() => edit(seg.momentId)}>
      {seg.asset ? (
        <Media key={seg.asset} src={seg.asset} fit="contain" auto always rate={speed} rot={seg.rot} className="pv-media" />
      ) : (
        <div className="pv-card">
          <span className="row-title">Sin imagen</span>
          <p>{seg.text || 'Momento sin texto'}</p>
        </div>
      )}
      <span className="pv-chip" style={{ '--zc': seg.zone.color }}>
        <i />{seg.zone.name} · {seg.number}{seg.count > 1 ? ` · plano ${seg.index + 1}/${seg.count}` : ''}
      </span>
      {desc && (
        <>
          <span className="caption-mark" title="Este momento tiene descripción" aria-hidden="true">T</span>
          <div className="caption pv-desc" dangerouslySetInnerHTML={{ __html: desc }} />
        </>
      )}
    </div>
  );
}

// The narration as a teleprompter: it scrolls by itself and lights up word by
// word at the real pace. Click a paragraph to go there, double click to edit it.
function Prompter({ tl, time, current, onSeek }) {
  const box = useRef(null);
  const roll = useRef(null);
  const cur = tl.moments.find((m) => m.moment.id === current);
  const frac = cur ? Math.min(1, Math.max(0, (time - cur.start) / cur.dur)) : 0;

  useLayoutEffect(() => {
    const el = roll.current?.querySelector(`[data-id="${current}"]`);
    if (!el) return;
    const y = el.offsetTop + el.offsetHeight * frac;
    roll.current.style.transform = `translateY(${box.current.clientHeight * 0.45 - y}px)`;
  });

  let lastZone = null;
  return (
    <section className="pv-prompt" ref={box}>
      <span className="pv-guide" />
      <div className="pv-roll" ref={roll}>
        {tl.moments.map((m) => {
          const head = m.zone !== lastZone;
          lastZone = m.zone;
          const on = m.moment.id === current;
          // How many words are said: all of a past moment, part of the current one.
          const done = m.start + m.dur <= time ? Infinity : on ? frac : 0;
          return <Para key={m.moment.id} m={m} head={head} on={on} done={done} onSeek={onSeek} />;
        })}
      </div>
    </section>
  );
}

// One paragraph of the teleprompter. Only the ones whose state changes are
// drawn again, so dragging through a long script stays smooth.
const Para = memo(function Para({ m, head, on, done, onSeek }) {
  const words = useMemo(() => (m.moment.text.trim() ? m.moment.text.trim().split(/\s+/) : []), [m.moment.text]);
  const said = done === Infinity ? words.length : Math.ceil(done * words.length);
  const transitions = m.moment.shots.map((s) => s.transition).filter((t) => t && t.trim());
  return (
    <div style={{ '--zc': m.zone.color }}>
      {head && <span className="pv-zone row-title">{m.zone.name}</span>}
      <div
        className={`pv-para ${on ? 'on' : ''}`}
        data-id={m.moment.id}
        title="Clic: ir aquí · doble clic: editar este momento"
        onClick={() => onSeek(m.start)}
        onDoubleClick={() => edit(m.moment.id)}
      >
        <p>
          {words.length
            ? words.map((w, i) => <span key={i} className={i < said ? 'said' : ''}>{w} </span>)
            : <i className="pv-silent">Momento sin texto</i>}
        </p>
      </div>
      {transitions.map((t, i) => <span key={i} className="pv-tr">→ {t}</span>)}
    </div>
  );
}, (a, b) => a.m === b.m && a.head === b.head && a.on === b.on && a.onSeek === b.onSeek
  && (a.done === b.done || Math.ceil(a.done * 1000) === Math.ceil(b.done * 1000)));

// A thin line to drag through the whole video, with marks where zones change.
// Dragging follows the pointer anywhere on the screen (it doesn't matter how
// fast it leaves the line) and updates at most once per frame.
function Scrub({ tl, time, onSeek }) {
  const box = useRef(null);
  const down = (e) => {
    if (e.button !== 0) return;
    e.preventDefault(); // no text selection while dragging
    const r = box.current.getBoundingClientRect();
    let x = e.clientX;
    let frame = 0;
    const apply = () => { frame = 0; onSeek(Math.max(0, Math.min(1, (x - r.left) / r.width)) * tl.total); };
    const move = (ev) => { x = ev.clientX; if (!frame) frame = requestAnimationFrame(apply); };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (frame) cancelAnimationFrame(frame);
      apply();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    apply();
  };
  const at = tl.total ? (time / tl.total) * 100 : 0;
  return (
    <div ref={box} className="pv-scrub" title="Arrastra para moverte por el vídeo" onPointerDown={down}>
      <span className="pv-rail" />
      <span className="pv-fill" style={{ width: at + '%' }} />
      {tl.zones.slice(1).map((z) => <span key={z.zone.id} className="pv-tick" style={{ left: (z.start / tl.total) * 100 + '%' }} />)}
      <span className="pv-marker" style={{ left: at + '%' }} />
    </div>
  );
}

// Zones as chapters that fill up as the video plays.
function Chapters({ tl, time, onSeek }) {
  return (
    <div className="pv-chapters">
      {tl.zones.map((z) => (
        <button key={z.zone.id} style={{ flex: z.dur, '--zc': z.zone.color }} title={z.zone.name} onClick={() => onSeek(z.start)}>
          <b style={{ width: Math.max(0, Math.min(1, (time - z.start) / z.dur)) * 100 + '%' }} />
          <span>{z.zone.name}</span>
        </button>
      ))}
    </div>
  );
}

// One picture per shot, as long as it lasts. Click to go there, double click
// to edit; drag the edge after a moment to change how long it lasts (double
// click that edge to go back to the estimate).
function Frames({ tl, time, current, onSeek }) {
  const box = useRef(null);
  const [width, setWidth] = useState(800);
  const [frozen, setFrozen] = useState(null); // scale kept still while resizing
  const drag = useRef(null);

  useLayoutEffect(() => {
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);

  const scale = frozen ?? width / Math.max(tl.total, 0.001);
  const x = (t) => t * scale;

  const down = (m) => (e) => {
    e.stopPropagation();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
    drag.current = { id: m.moment.id, x0: e.clientX, d0: m.dur };
    setFrozen(scale);
    beginTyping();
  };
  const move = (e) => {
    const d = drag.current;
    if (!d) return;
    const dur = Math.max(0.5, Math.round((d.d0 + (e.clientX - d.x0) / scale) * 10) / 10);
    setMomentDuration(d.id, dur, { typing: true });
  };
  const up = () => {
    drag.current = null;
    setFrozen(null);
  };

  return (
    <div className="pv-frames" ref={box}>
      {tl.segs.map((s) => {
        const thumb = segThumb(s.asset);
        return (
          <div
            key={s.key + s.index}
            className={`pv-frame ${s.momentId === current ? 'cur' : ''} ${s.isKey ? 'key' : ''}`}
            style={{ left: x(s.start), width: Math.max(2, x(s.dur) - 3), '--zc': s.zone.color }}
            title={`${s.number} · ${s.text || 'Momento sin texto'}\nClic: ir aquí · doble clic: editar`}
            onClick={() => onSeek(s.start)}
            onDoubleClick={() => edit(s.momentId)}
          >
            {thumb && <img src={thumb} alt="" draggable={false} />}
            {s.index === 0 && <span className="pv-n">{s.number}</span>}
            {s.transition && <span className="pv-cut" title={`Transición: ${s.transition}`} />}
          </div>
        );
      })}
      {tl.moments.map((m) => {
        const tight = m.manual && m.needed > m.dur + 0.3;
        return (
          <div
            key={m.moment.id}
            className={`pv-handle ${m.manual ? 'manual' : ''} ${tight ? 'tight' : ''}`}
            style={{ left: x(m.start + m.dur) - 5 }}
            title={
              (m.manual ? `Duración manual: ${m.dur.toFixed(1)} s (doble clic para volver a la estimada)` : `Duración estimada por el texto: ${m.dur.toFixed(1)} s`)
              + (tight ? `\nOjo: leer el texto necesita ~${m.needed.toFixed(1)} s` : '')
              + '\nArrastra para cambiarla'
            }
            onClick={(e) => e.stopPropagation()}
            onPointerDown={down(m)}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            onDoubleClick={(e) => { e.stopPropagation(); setMomentDuration(m.moment.id, null); }}
          />
        );
      })}
      <span className="pv-needle" style={{ left: x(Math.min(time, tl.total)) }} />
    </div>
  );
}

// Playback speed, like YouTube's: slower to look closely, faster to feel the
// overall rhythm. A quiet button with the speed; above it, a row with all of them.
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const label = (v) => `×${String(v).replace('.', ',')}`;
function SpeedMenu({ speed, onChange }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return;
    const down = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    const key = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key, true);
    return () => { window.removeEventListener('pointerdown', down, true); window.removeEventListener('keydown', key, true); };
  }, [open]);
  return (
    <div className="pv-speed" ref={box}>
      <button
        className={`pv-speed-btn ${open ? 'open' : ''} ${speed !== 1 ? 'on' : ''}`}
        title="Velocidad de reproducción"
        onClick={() => setOpen((o) => !o)}
      >
        {label(speed)}
        <Icon name="chevron" size={11} />
      </button>
      {open && (
        <div className="pv-speed-pop">
          <span className="pv-speed-title">Velocidad</span>
          <div className="pv-speed-row">
            {SPEEDS.map((v) => (
              <button key={v} className={v === speed ? 'on' : ''} onClick={() => { onChange(v); setOpen(false); }}>{label(v)}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Plays the storyboard to check the pacing: the frame on the left, the
// narration as a teleprompter on the right, and below a line to drag through
// the video, the zones as chapters and the frames.
export default function PreviewView() {
  const project = useStore((s) => s.project);
  const editing = useStore((s) => !!s.ui.focusMoment);
  const [mode, setMode] = useState('boceto');
  const tl = useMemo(() => buildTimeline(project, mode), [project, mode]);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const seg = segmentAt(tl.segs, Math.min(time, Math.max(0, tl.total - 0.001)));
  const total = useRef(tl.total);
  total.current = tl.total;
  const seek = useCallback((t) => setTime(Math.max(0, Math.min(total.current, t))), []);

  // Opening a moment to edit it pauses the preview.
  useEffect(() => { if (editing) setPlaying(false); }, [editing]);

  // The clock measures real elapsed time, so playback keeps the right pace
  // even if the window is covered and the browser slows its timers down.
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      const dt = ((now - last) / 1000) * speed;
      last = now;
      setTime((t) => {
        if (t + dt >= tl.total) { setPlaying(false); return tl.total; }
        return t + dt;
      });
    }, 33);
    return () => clearInterval(id);
  }, [playing, tl.total, speed]);

  const toggle = () => {
    if (!tl.total) return;
    if (!playing && time >= tl.total - 0.01) setTime(0);
    setPlaying((p) => !p);
  };
  const step = (dir) => {
    const i = seg ? tl.segs.indexOf(seg) : 0;
    const next = tl.segs[Math.max(0, Math.min(tl.segs.length - 1, i + dir))];
    if (next) setTime(next.start);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (useStore.getState().ui.focusMoment || isEditableTarget(document.activeElement)) return;
      if (e.code === 'Space') { e.preventDefault(); toggle(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="preview-view">
      <div className="pv-main">
        <section className="pv-monitor">
          <Stage seg={seg} speed={speed} />
          <div className="pv-controls">
            <button className="ghost icon" title="Plano anterior (←)" onClick={() => step(-1)}><Icon name="prev" /></button>
            <button className="primary icon pv-play" title="Reproducir o pausar (Espacio)" onClick={toggle}>
              <Icon name={playing ? 'pause' : 'play'} />
            </button>
            <button className="ghost icon" title="Plano siguiente (→)" onClick={() => step(1)}><Icon name="next" /></button>
            <span className="pv-time">{formatTime(Math.min(time, tl.total))} <small>/ {formatTime(tl.total)}</small></span>
            <SpeedMenu speed={speed} onChange={setSpeed} />
            <div className="seg pv-mode">
              <button className={mode === 'boceto' ? 'on' : ''} onClick={() => setMode('boceto')}>Bocetos</button>
              <button className={mode === 'style' ? 'on' : ''} onClick={() => setMode('style')}>Style frames</button>
            </div>
          </div>
        </section>
        <Prompter tl={tl} time={time} current={seg?.momentId} onSeek={seek} />
      </div>
      <section className="pv-bottom">
        <Scrub tl={tl} time={time} onSeek={seek} />
        <Chapters tl={tl} time={time} onSeek={seek} />
        <Frames tl={tl} time={time} current={seg?.momentId} onSeek={seek} />
      </section>
    </div>
  );
}
