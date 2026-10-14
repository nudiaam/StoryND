import { Fragment, useRef, useState } from 'react';
import RichText from './RichText.jsx';
import { useStore, setUi, beginTyping, notify } from './store.js';
import { addMoment, addZone, addZoneAfter, deleteMoment, toggleKey, importScript, moveMomentsTo, moveZoneTo, setMomentText, moveSeparator, removeSeparator, renameZone, setWpm, splitScript, splitZoneBefore } from './actions.js';
import { momentDuration } from './timeline.js';
import { DurationField } from './canvas/momentParts.jsx';
import { formatSeconds, wordCount } from './util.js';
import Icon from './Icon.jsx';

const SEP_TYPE = 'application/x-storyboard-separator';

// The whole script, read only. Zones are marked by horizontal separators that
// stay locked unless the padlock is opened.
export default function ScriptView() {
  const project = useStore((s) => s.project);
  const locked = useStore((s) => s.ui.scriptLocked);
  const [dragSep, setDragSep] = useState(null); // { zoneId, k }
  const [overGap, setOverGap] = useState(null);
  const [paste, setPaste] = useState('');
  const [adding, setAdding] = useState(false);
  // Selected sentences, and where dragged ones would land.
  const [picked, setPicked] = useState([]);
  const [dropAt, setDropAt] = useState(null); // { zoneId, index }
  const [moving, setMoving] = useState(null); // ids being dragged
  const [ghost, setGhost] = useState(null); // { x, y, text, count }
  const dragged = useRef(false); // a drag just ended: the click that follows is not a click
  const [fresh, setFresh] = useState(null); // a sentence just added: its text takes the cursor
  const [zoneDrop, setZoneDrop] = useState(null); // { beforeId } while a zone is dragged
  const [movingZone, setMovingZone] = useState(null);
  const anchor = useRef(null); // last sentence clicked, for Shift ranges
  // Selecting works like the Explorer: click one; Ctrl adds or removes;
  // Shift takes every sentence between the last one clicked and this one.
  const pick = (id, e) => {
    const order = zones.flatMap((z) => z.momentIds);
    if (e.shiftKey && anchor.current && order.includes(anchor.current)) {
      const [a, b] = [order.indexOf(anchor.current), order.indexOf(id)].sort((x, y) => x - y);
      const range = order.slice(a, b + 1);
      setPicked((l) => (e.ctrlKey || e.metaKey ? [...new Set([...l, ...range])] : range));
      return;
    }
    anchor.current = id;
    if (e.ctrlKey || e.metaKey) setPicked((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
    else setPicked([id]);
  };
  // Clicks on the words edit them; only the space around selects or drags.
  const onWords = (e) => !!e.target.closest('.rich, .para-side');
  // Press on the space around a sentence and move: it follows the pointer
  // (with the others selected along with it) and a line shows where it will
  // land, in this zone or another. Without moving it is just a click.
  const startDrag = (id, e) => {
    if (e.button !== 0 || onWords(e)) return;
    const origin = { x: e.clientX, y: e.clientY };
    const order = zones.flatMap((zz) => zz.momentIds);
    const ids = picked.includes(id) ? order.filter((x) => picked.includes(x)) : [id];
    let active = false;
    let target = null;
    const where = (ev) => {
      for (const el of document.elementsFromPoint(ev.clientX, ev.clientY)) {
        const para = el.closest?.('.para[data-j]');
        if (para) {
          const r = para.getBoundingClientRect();
          const j = Number(para.dataset.j);
          return { zoneId: para.dataset.zone, index: ev.clientY < r.top + r.height / 2 ? j : j + 1 };
        }
        const head = el.closest?.('.sep[data-zone]');
        if (head) return { zoneId: head.dataset.zone, index: 0 };
      }
      return null;
    };
    const move = (ev) => {
      if (!active && Math.hypot(ev.clientX - origin.x, ev.clientY - origin.y) < 5) return;
      if (!active) {
        active = true;
        setMoving(ids);
        if (!picked.includes(id)) setPicked([id]);
        window.getSelection()?.removeAllRanges();
      }
      target = where(ev) || target;
      setDropAt(target);
      setGhost({ x: ev.clientX, y: ev.clientY, text: project.moments[ids[0]]?.text || '', count: ids.length });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (!active) return;
      dragged.current = true;
      setTimeout(() => { dragged.current = false; }, 0);
      if (target) moveMomentsTo(ids, target.zoneId, target.index);
      setMoving(null);
      setDropAt(null);
      setGhost(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // Press on a zone's title row (not on its name) and move: the zone goes
  // before or after another one, with all its sentences.
  const startZoneDrag = (zoneId, e) => {
    if (e.button !== 0 || e.target.closest('input, button, .grip')) return;
    e.preventDefault();
    const origin = { x: e.clientX, y: e.clientY };
    const name = project.zones.find((z) => z.id === zoneId)?.name || '';
    let active = false;
    let target;
    const where = (ev) => {
      const list = [...document.querySelectorAll('.script-zone[data-zone]')];
      for (const el of list) {
        const r = el.getBoundingClientRect();
        if (ev.clientY < r.top + r.height / 2) return { beforeId: el.dataset.zone };
      }
      return { beforeId: null };
    };
    const move = (ev) => {
      if (!active && Math.hypot(ev.clientX - origin.x, ev.clientY - origin.y) < 5) return;
      if (!active) { active = true; setMovingZone(zoneId); }
      target = where(ev);
      setZoneDrop(target);
      setGhost({ x: ev.clientX, y: ev.clientY, text: name, count: 1 });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (!active) return;
      if (target && target.beforeId !== zoneId) moveZoneTo(zoneId, target.beforeId);
      setMovingZone(null);
      setZoneDrop(null);
      setGhost(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // "+ texto | + zona": a new sentence here, or a new zone starting here.
  const addHere = (zoneId, index, splitAt) => (
    <div className="add-row-btns">
      <i />
      <button className="gap-add" onClick={() => setFresh(addMoment(zoneId, index))}>+ texto</button>
      <i />
      <button className="gap-add" onClick={splitAt}>+ zona</button>
      <i />
    </div>
  );

  const wpm = project.settings.wpm;
  const zones = project.zones.filter((z) => z.kind === 'normal');
  const all = zones.flatMap((z) => z.momentIds.map((id) => project.moments[id]).filter(Boolean));
  const words = all.reduce((n, m) => n + wordCount(m.text), 0);
  const hasScript = all.length > 0;
  const parts = splitScript(paste, 'parrafos');

  const addText = () => {
    if (!parts.length) return;
    importScript({ text: paste, mode: 'parrafos' });
    setPaste('');
    setAdding(false);
  };

  const goTo = (id) => setUi({ view: 'board', pendingCenter: id });

  let g = 0; // global paragraph index
  const body = zones.map((z, k) => {
    const sep = (
      <div
        key={'sep-' + z.id}
        className={`sep ${k > 0 && !locked ? 'movable' : ''} ${dragSep?.zoneId === z.id ? 'dragging' : ''} ${dropAt?.zoneId === z.id && dropAt.index === 0 && !z.momentIds.length ? 'drop-into' : ''}`}
        data-zone={z.id}
        onPointerDown={(e) => startZoneDrag(z.id, e)}
      >
        {k > 0 && !locked && (
          <span
            className="grip"
            title="Arrastra para mover dónde empieza esta zona"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(SEP_TYPE, z.id);
              e.dataTransfer.effectAllowed = 'move';
              setDragSep({ zoneId: z.id, k });
            }}
            onDragEnd={() => { setDragSep(null); setOverGap(null); }}
          >
            ⠿
          </span>
        )}
        <span className="order">{k + 1}</span>
        <input className="sep-name" maxLength={40} value={z.name} onFocus={beginTyping} onChange={(e) => renameZone(z.id, e.target.value)} />
        <span className="fixed-meta">
          {z.momentIds.length} {z.momentIds.length === 1 ? 'momento' : 'momentos'} · {formatSeconds(z.momentIds.reduce((n, id) => n + (project.moments[id] ? momentDuration(project.moments[id], wpm) : 0), 0))}
        </span>
        {k > 0 && !locked && (
          <button
            className="icon-btn sep-del"
            title="Quitar este separador (la zona se une a la anterior)"
            onClick={() => { removeSeparator(z.id); notify(`Zona "${z.name}" unida a la anterior`, true); }}
          >
            <Icon name="close" size={13} />
          </button>
        )}
      </div>
    );

    const paras = z.momentIds.map((id, j) => {
      const m = project.moments[id];
      if (!m) return null;
      const gi = g++;
      // A separator being dragged may only land inside the two zones it divides.
      const valid = dragSep && (k === dragSep.k - 1 || k === dragSep.k);
      // Before the zone's first sentence: a sentence there, or a new zone before this one.
      const first = j === 0 && !dragSep && (
        <div className={`gap ${moving || movingZone ? 'quiet' : ''}`}>
          {addHere(z.id, 0, () => addZoneAfter(z.id, true))}
        </div>
      );
      const gap = j > 0 && (
        <div
          className={`gap ${valid ? 'valid' : ''} ${overGap === gi && valid ? 'over' : ''} ${moving || movingZone ? 'quiet' : ''}`}
          onDragOver={(e) => { if (valid && e.dataTransfer.types.includes(SEP_TYPE)) { e.preventDefault(); setOverGap(gi); } }}
          onDragLeave={() => setOverGap(null)}
          onDrop={(e) => {
            const zoneId = e.dataTransfer.getData(SEP_TYPE);
            if (!zoneId || !valid) return;
            e.preventDefault();
            moveSeparator(zoneId, gi);
            setDragSep(null);
            setOverGap(null);
          }}
        >
          {/* Adding is a deliberate click, so it works even when locked. */}
          {!dragSep && addHere(z.id, j, () => splitZoneBefore(id))}
        </div>
      );
      return (
        <Fragment key={id}>
          {first}
          {gap}
          <div
            className={`para ${m.key ? 'key' : ''} ${picked.includes(id) ? 'picked' : ''} ${moving?.includes(id) ? 'moving' : ''} ${dropAt?.zoneId === z.id && dropAt.index === j ? 'drop-before' : ''} ${dropAt?.zoneId === z.id && dropAt.index === j + 1 && j === z.momentIds.length - 1 ? 'drop-after' : ''}`}
            title="Clic en el hueco: seleccionar (Mayús / Ctrl para varias) · pulsa y arrastra para moverla · doble clic: verla en el tablero"
            data-zone={z.id}
            data-j={j}
            onPointerDown={(e) => startDrag(id, e)}
            onMouseDown={(e) => { if (!onWords(e)) e.preventDefault(); }}
            onClick={(e) => { if (!dragged.current && !onWords(e)) pick(id, e); }}
            onDoubleClick={(e) => { if (!onWords(e)) goTo(id); }}
          >
            <span className="para-num">{gi + 1}</span>
            <div className="para-body">
              <RichText
                className="para-text"
                autoFocus={fresh === id}
                html={m.html}
                text={m.text}
                placeholder="Momento sin texto"
                onChange={({ text, html }) => setMomentText(id, text, html)}
              />
            </div>
            <span className="para-side" onClick={(e) => e.stopPropagation()}>
              <button className={`icon-btn para-key ${m.key ? 'on' : ''}`} title={m.key ? 'Momento clave (clic para quitarlo)' : 'Marcar como momento clave'} onClick={() => toggleKey(id)}>
                <Icon name="star" size={13} />
              </button>
              <DurationField moment={m} wpm={wpm} />
              <button
                className="icon-btn para-del"
                title="Borrar esta frase (y su momento en el tablero)"
                onClick={() => { deleteMoment(id); notify('Frase borrada', true); }}
              >
                <Icon name="close" size={12} />
              </button>
            </span>
          </div>
        </Fragment>
      );
    });

    const last = k === zones.length - 1;
    return (
      <section
        key={z.id}
        className={`script-zone ${movingZone === z.id ? 'moving' : ''} ${zoneDrop?.beforeId === z.id ? 'zone-drop-before' : ''} ${last && zoneDrop && !zoneDrop.beforeId ? 'zone-drop-after' : ''}`}
        style={{ '--zc': z.color }}
        data-zone={z.id}
      >
        {sep}
        <div className="script-body">
          {paras}
          {/* After the zone's last sentence: one more sentence, or a new zone after this one. */}
          {!dragSep && !last && (
            <div className={`gap end ${moving || movingZone ? 'quiet' : ''}`}>
              {addHere(z.id, z.momentIds.length, () => addZoneAfter(z.id))}
            </div>
          )}
        </div>
      </section>
    );
  });

  return (
    <div className="script-view" onClick={(e) => { if (!e.target.closest('.para')) setPicked([]); }}>
      <div className="script-page">
        <header className="script-top">
          <h1>Guion</h1>
          {hasScript && <span className="fixed-meta">{words} palabras · ~{formatSeconds((words / wpm) * 60)}</span>}
          <label className="wpm" title="Velocidad de lectura para estimar la duración">
            <input
              type="number" min={60} max={260} step={5} value={wpm}
              onChange={(e) => { const v = Number(e.target.value); if (v >= 60 && v <= 260) setWpm(v); }}
            />
            palabras/min
          </label>
          {hasScript && (
            <button className={`lock ${locked ? '' : 'open'}`} onClick={() => setUi({ scriptLocked: !locked })}>
              <Icon name={locked ? 'lock' : 'unlock'} />
              {locked ? 'Zonas bloqueadas' : 'Zonas desbloqueadas'}
            </button>
          )}
        </header>

        {body}

        {(!hasScript || adding) ? (
          <div className="paste">
            <p>{hasScript ? 'Texto para añadir al final del guion.' : 'Pega aquí el guion entero. Cada párrafo (separado por una línea en blanco) será un momento.'}</p>
            <textarea autoFocus value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Pega el guion…" />
            <div className="paste-foot">
              <span className="hint">{parts.length ? `${parts.length} párrafos` : ''}</span>
              {hasScript && <button onClick={() => setAdding(false)}>Cancelar</button>}
              <button className="primary" disabled={!parts.length} onClick={addText}>Añadir al guion</button>
            </div>
          </div>
        ) : (
          <div className="script-end">
            <button className="add-more" onClick={() => setAdding(true)}>+ Añadir texto al final</button>
            <button className="add-more" onClick={() => addZone()}>+ Añadir zona al final</button>
          </div>
        )}
      </div>
      {ghost && (
        <div className="para-ghost" style={{ left: ghost.x + 14, top: ghost.y + 10 }}>
          <span>{ghost.text || 'Momento sin texto'}</span>
          {ghost.count > 1 && <b>+{ghost.count - 1}</b>}
        </div>
      )}
    </div>
  );
}
