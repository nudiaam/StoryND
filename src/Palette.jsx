import { useStore, setUi } from './store.js';
import { addRefs, assignColor, deleteRef, setPaletteLinked, unassignColor } from './actions.js';
import { api } from './api.js';
import Media from './Media.jsx';
import XButton from './XButton.jsx';
import { useMediaDrop } from './canvas/momentParts.jsx';
import { startMediaDrag } from './util.js';

// How colours are used: dominant, secondary and accent, at 60 / 30 / 10.
export const TIERS = [60, 30, 10];
const NAMES = { 60: 'Dominante', 30: 'Secundario', 10: 'Acento' };

// The project's colours: the palette of the main "Estilo general" window.
export const usePalette = () => useStore((s) => s.project.zones.find((z) => z.kind === 'general' && z.colors));

// The distribution a moment shows: the general one when it follows it.
export const momentDist = (m, general) => (m.paletteLinked ? general?.dist : m.palette);

const ownerKey = (owner) => (owner.zone ? 'z' + owner.zone : 'm' + owner.moment);
const colorsOf = (dist, colors) => {
  const byId = new Map(colors.map((c) => [c.id, c]));
  return Object.fromEntries(TIERS.map((t) => [t, (dist?.[t] || []).map((id) => byId.get(id)).filter(Boolean)]));
};

// Press on a colour and move it onto a part of a 60/30/10 bar to put it in
// that group. opts: onMove(ev, overBar) and onDrop(ev) for other uses of the
// same gesture (reordering the palette), ghost: show the colour under the
// pointer the whole time. Returns nothing; a press without moving is a click.
export function startColorDrag(e, color, opts = {}) {
  if (e.button !== 0) return;
  const origin = { x: e.clientX, y: e.clientY };
  let active = false;
  let seg = null;
  const segUnder = (ev) => document.elementsFromPoint(ev.clientX, ev.clientY).map((el) => el.closest?.('.dseg[data-owner]')).find(Boolean) || null;
  const move = (ev) => {
    if (!active && Math.hypot(ev.clientX - origin.x, ev.clientY - origin.y) < 5) return;
    active = true;
    seg = segUnder(ev);
    setUi({
      colorOver: seg ? seg.dataset.key + ':' + seg.dataset.tier : null,
      colorDrag: seg || opts.ghost ? { hex: color.hex, x: ev.clientX, y: ev.clientY } : null,
    });
    opts.onMove?.(ev, !!seg);
  };
  const up = (ev) => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    setUi({ colorOver: null, colorDrag: null });
    if (!active) return;
    if (seg) assignColor(JSON.parse(seg.dataset.owner), Number(seg.dataset.tier), color.id);
    else opts.onDrop?.(ev);
    opts.onEnd?.();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

// The colour following the pointer while it is dragged.
export function ColorGhost() {
  const drag = useStore((s) => s.ui.colorDrag);
  if (!drag) return null;
  return <div className="color-ghost" style={{ left: drag.x + 12, top: drag.y + 12, background: drag.hex }} />;
}

// The 60/30/10 bar: each part as wide as its share, split between its
// colours. Colours are dropped on it; × on a colour takes it out. The names
// sit under their part (every part keeps room for its name).
export function DistBar({ owner, dist, colors, height = 36, readOnly = false }) {
  const over = useStore((s) => s.ui.colorOver);
  const key = ownerKey(owner);
  const groups = colorsOf(dist, colors);
  return (
    <div className={`dist nodrag nopan ${readOnly ? 'read-only' : ''}`}>
      <div className="dbar">
        {TIERS.map((t) => (
          <div
            key={t}
            className={`dseg ${groups[t].length ? '' : 'empty'} ${over === key + ':' + t ? 'over' : ''}`}
            data-owner={readOnly ? undefined : JSON.stringify(owner)}
            data-key={key}
            data-tier={t}
            style={{ flex: t, height }}
          >
            {groups[t].length
              ? groups[t].map((c) => (
                <span key={c.id} className="dchip" style={{ background: c.hex }}>
                  {!readOnly && (
                    <button className="dchip-x" onClick={() => unassignColor(owner, t, c.id)}>
                      <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M3 3l4 4M7 3L3 7" /></svg>
                    </button>
                  )}
                </span>
              ))
              : <span className="dhint">Arrastra aquí</span>}
          </div>
        ))}
      </div>
      <div className="dlabels">
        {TIERS.map((t) => <div key={t} style={{ flex: t }}><span className="row-title">{NAMES[t]}</span></div>)}
      </div>
    </div>
  );
}

// The same distribution, tiny, for a button.
export function MiniBar({ dist, colors }) {
  const groups = colorsOf(dist, colors);
  if (!TIERS.some((t) => groups[t].length)) return <span className="minibar none" />;
  return (
    <span className="minibar">
      {TIERS.map((t) => groups[t].map((c) => <i key={c.id} style={{ background: c.hex, width: `${t / groups[t].length}%` }} />))}
    </span>
  );
}

// A moment's own palette and reference images: in its dropdown on the board
// and in the "Referencias" tab of the detail view.
export function MomentRefs({ moment: m }) {
  const general = usePalette();
  const colors = general?.colors || [];
  const used = new Set(TIERS.flatMap((t) => m.palette?.[t] || []));
  const drop = useMediaDrop('ref:' + m.id, (assets) => addRefs(m.id, assets));
  const pick = async () => {
    const res = await api.importPaths(await api.pickMedia());
    if (res.length) addRefs(m.id, res.map((r) => r.asset));
  };
  const refs = m.refs || [];
  return (
    <div className="mrefs">
      <div className="mrefs-head">
        <span className="row-title">Paleta</span>
        <label className="mrefs-link">
          <input type="checkbox" checked={!!m.paletteLinked} onChange={(e) => setPaletteLinked(m.id, e.target.checked)} />
          <span>Igual que la general</span>
        </label>
      </div>
      <DistBar owner={{ moment: m.id }} dist={momentDist(m, general)} colors={colors} height={32} readOnly={!!m.paletteLinked} />
      {!m.paletteLinked && <div className="mrefs-colors">
        {colors.map((c) => (
          <span
            key={c.id}
            className={`csw ${used.has(c.id) ? 'used' : ''}`}
            style={{ background: c.hex }}
            onPointerDown={(e) => startColorDrag(e, c, { ghost: true })}
          />
        ))}
        {!colors.length && <span className="mrefs-hint">Los colores salen de la paleta de «Estilo general».</span>}
      </div>}
      <div className="mrefs-sep" />
      <div className="mrefs-head">
        <span className="row-title">Imágenes</span>
        <span className="link-btn" onClick={pick}>+ añadir</span>
      </div>
      <div className={`mrefs-imgs ${drop.over ? 'drop-over' : ''}`} {...drop.props}>
        {refs.map((r) => (
          <div
            key={r.id}
            className="mref"
            draggable
            onDragStart={(e) => startMediaDrag(e, r.asset, { kind: 'ref', momentId: m.id, refId: r.id })}
            onDoubleClick={() => setUi({ lightbox: r.asset })}
          >
            <Media src={r.asset} fit="cover" hover />
            <XButton onClick={() => deleteRef(m.id, r.id)} />
          </div>
        ))}
        <button className={`mref-add ${refs.length ? '' : 'wide'}`} onClick={pick}>
          {refs.length ? '+' : 'Arrastra aquí las referencias de este momento'}
        </button>
      </div>
    </div>
  );
}
