import { memo, useEffect, useState } from 'react';
import { ViewportPortal } from '@xyflow/react';
import { MiniBar, MomentRefs, momentDist, usePalette } from '../Palette.jsx';
import { useCloseOnClickOutside } from '../hooks.js';
import SoundControl from '../Sound.jsx';
import { hasSound } from '../media.js';
import { useStore, setUi, beginTyping, endDrag, notify } from '../store.js';
import {
  deleteMoment, moveMomentTo, addShots, deleteShot, setStyleFrame, toggleKey, rotateMedia,
  openTransition, setTransition, closeEmptyTransition, moveMedia,
} from '../actions.js';
import { D1, L, cutX, momentWidth } from '../layout.js';
import { richOf } from '../richtext.js';
import { api } from '../api.js';
import Media, { canRotate } from '../Media.jsx';
import Icon from '../Icon.jsx';
import RichText from '../RichText.jsx';
import XButton, { RotateButton } from '../XButton.jsx';
import { MOMENT_TYPE, startMediaDrag, estimateSeconds, formatSeconds, naturalCompare, wordCount } from '../util.js';
import { DurationField, Narration, useMediaDrop, useSourceDrop } from './momentParts.jsx';
import { SourceList } from '../Sources.jsx';

// Clicks on these never open the isolated view.
const INTERACTIVE = 'button, input, textarea, select, a, .shot, .slot, .src, .tr-cell, [contenteditable="true"]';

// One picked file goes straight in; several open the import review so each
// photo can be checked against its moment.
export async function pickBocetosFor(momentId) {
  const paths = await api.pickMedia();
  if (!paths.length) return;
  const items = (await api.importPaths(paths)).sort((a, b) => naturalCompare(a.original, b.original));
  if (items.length === 1) addShots(momentId, [items[0].asset]);
  else setUi({ importShots: { items, startMomentId: momentId } });
}

export async function pickStyleFor(momentId) {
  const [r] = await api.importPaths((await api.pickMedia()).slice(0, 1));
  if (r) setStyleFrame(momentId, r.asset);
}

export function Boceto({ momentId, shot, width = L.shotW, height = L.shotH }) {
  const [sound, setSound] = useState(false);
  return (
    <div
      className="shot nodrag nopan"
      data-anchor={shot.id}
      style={{ width, height }}
      draggable
      onDragStart={(e) => startMediaDrag(e, shot.asset, { kind: 'shot', momentId, shotId: shot.id })}
      onDoubleClick={() => setUi({ lightbox: { asset: shot.asset, rot: shot.rot } })}
    >
      <Media src={shot.asset} fit="contain" hover sound={sound} rot={shot.rot} />
      {hasSound(shot.asset) && <SoundControl on={sound} onToggle={setSound} />}
      {canRotate(shot.asset) && <RotateButton onClick={() => rotateMedia({ kind: 'shot', momentId, shotId: shot.id })} />}
      <XButton title="Quitar (va a descartes)" onClick={() => deleteShot(momentId, shot.id)} />
    </div>
  );
}

export function useBocetoDrop(momentId) {
  return useMediaDrop('boceto:' + momentId, (assets) => addShots(momentId, assets));
}

export function useStyleDrop(momentId) {
  return useMediaDrop('style:' + momentId, (assets) => setStyleFrame(momentId, assets[0]));
}

export function StyleFrame({ moment, width = L.shotW, height = L.shotH }) {
  const [sound, setSound] = useState(false);
  if (moment.style) {
    return (
      <div
        className="shot style nodrag nopan"
        data-anchor={'sf-' + moment.id}
        style={{ width, height }}
        draggable
        onDragStart={(e) => startMediaDrag(e, moment.style, { kind: 'style', momentId: moment.id })}
        onDoubleClick={() => setUi({ lightbox: { asset: moment.style, rot: moment.styleRot } })}
      >
        <Media src={moment.style} fit="contain" hover sound={sound} rot={moment.styleRot} />
        {hasSound(moment.style) && <SoundControl on={sound} onToggle={setSound} />}
        {canRotate(moment.style) && <RotateButton onClick={() => rotateMedia({ kind: 'style', momentId: moment.id })} />}
        <XButton title="Quitar (va a descartes)" onClick={() => setStyleFrame(moment.id, null)} />
      </div>
    );
  }
  return (
    <button className="slot nodrag nopan" data-anchor={'sf-' + moment.id} style={{ width, height }} title="Añadir style frame" onClick={() => pickStyleFor(moment.id)}>+</button>
  );
}

// A bracket under each cut between bocetos, with its note. The cut after the
// last boceto is the change to the next moment.
// `out`: the zone's very last cut, which leads into the next zone. It stays
// inside the zone (not on the gap at its edge) and says where it goes.
function TransitionCell({ momentId, shot, last, x, out }) {
  // While the detail view is open, its own transition field takes the cursor.
  const detailOpen = useStore((s) => !!s.ui.focusMoment);
  return (
    <div className={`tr-cell ${last ? 'tr-last' : ''} ${out ? 'tr-out' : ''}`} style={{ left: x - L.trW / 2, width: L.trW }}>
      <div className="bracket" />
      {shot.transition === null ? (
        <button
          className="tr-add nodrag nopan"
          title={last ? 'Transición al siguiente momento' : 'Transición al siguiente plano'}
          onClick={() => openTransition(momentId, shot.id)}
        >
          + transición
        </button>
      ) : (
        <RichText
          className="tr-text"
          autoFocus={!shot.transition && !detailOpen}
          html={shot.trHtml}
          text={shot.transition}
          placeholder={last ? 'al siguiente momento…' : 'corte, fundido…'}
          onChange={({ text, html }) => setTransition(momentId, shot.id, text, html)}
          onBlur={() => closeEmptyTransition(momentId, shot.id)}
        />
      )}
      {out?.next && shot.transition !== null && (
        <span className="tr-where" style={{ '--to': out.next.color }}>→ {out.next.name}</span>
      )}
    </div>
  );
}

// Small signs in the moment's header: it has a description; it has
// discards (drop a picture on it to set it aside). Both open the detail view.
function MomentFlags({ moment: m }) {
  const drop = useMediaDrop('discard:' + m.id, (assets) => {
    for (const a of assets) moveMedia({ asset: a }, 'discard:' + m.id);
  });
  const n = m.discards?.length || 0;
  const open = () => setUi({ focusMoment: m.id });
  return (
    <span className="m-flags nodrag nopan">
      <button
        className={`m-flag discard-flag ${n ? 'on' : ''} ${drop.over ? 'drop-over' : ''}`}
        title={n ? `${n} en descartes · suelta aquí una imagen para descartarla` : 'Descartes: suelta aquí una imagen para descartarla'}
        onClick={open}
        {...drop.props}
      >
        <Icon name="tray" size={14} />
        {n > 0 && <span>{n}</span>}
      </button>
    </span>
  );
}

// The moment's palette and reference images: a button after its duration
// with the palette in small, and a dropdown over the board.
function MomentPaletteButton({ moment: m, open }) {
  const general = usePalette();
  return (
    <button className={`mpal-btn nodrag nopan ${open ? 'on' : ''}`} data-mpal-btn={m.id} onClick={() => setUi({ momentPop: open ? null : m.id })}>
      <MiniBar dist={momentDist(m, general)} colors={general?.colors || []} />
      {m.refs?.length > 0 && <span className="mpal-dot" />}
      <Icon name="chevron" size={12} />
    </button>
  );
}

// Description and notes: small icons on the boceto's corner, shown with the
// pointer over the picture. A click on one shows what it says.
function NoteMarks({ moment: m, d }) {
  const [open, setOpen] = useState(null); // 'desc' | 'notes'
  useEffect(() => {
    if (!open) return undefined;
    const down = (e) => { if (!e.target.closest?.(`[data-marks="${m.id}"]`)) setOpen(null); };
    window.addEventListener('pointerdown', down, true);
    return () => window.removeEventListener('pointerdown', down, true);
  }, [open, m.id]);
  const hasDesc = !!m.description?.trim();
  const hasNotes = !!m.notes?.trim();
  if (!hasDesc && !hasNotes) return null;
  const toggle = (k) => setOpen((o) => (o === k ? null : k));
  return (
    <div
      className={`nmarks nodrag nopan ${open ? 'open' : ''}`}
      data-marks={m.id}
      // 7 px from the boceto's corner, like the T of a picture's text (the
      // row's 1 px top line shifts the centred boceto by half a pixel).
      style={{ left: d.colPad + 7, bottom: (d.rowBoceto - 1 - d.shotH) / 2 + 7 }}
    >
      {hasDesc && <button className={`nmark ${open === 'desc' ? 'on' : ''}`} onClick={() => toggle('desc')}><Icon name="desc" size={13} /></button>}
      {hasNotes && <button className={`nmark note ${open === 'notes' ? 'on' : ''}`} onClick={() => toggle('notes')}><Icon name="note" size={13} /></button>}
      {open && (
        <div className="npeek">
          <span className="row-title">{open === 'desc' ? 'Descripción' : 'Apuntes'}</span>
          <div className="npeek-text" dangerouslySetInnerHTML={{ __html: richOf(open === 'desc' ? m.descHtml : m.notesHtml, open === 'desc' ? m.description : m.notes) }} />
          <span className="link-btn" onClick={() => setUi({ focusMoment: m.id })}>Editar</span>
        </div>
      )}
    </div>
  );
}

function MomentNode({ data, positionAbsoluteX, positionAbsoluteY }) {
  const popOpen = useStore((s) => s.ui.momentPop === data.momentId);
  // A click outside (or Esc) closes the dropdown; dragging into it doesn't.
  useCloseOnClickOutside(popOpen, `[data-mpop="${data.momentId}"], [data-mpal-btn="${data.momentId}"], .popover, .lightbox`, () => setUi({ momentPop: null }));
  const m = useStore((s) => s.project.moments[data.momentId]);
  const zoneColor = useStore((s) => s.project.zones.find((z) => z.id === data.zoneId)?.color);
  const wpm = useStore((s) => s.project.settings.wpm);
  const flash = useStore((s) => s.ui.flash === data.momentId);
  const draggingMoment = useStore((s) => s.ui.dragging === 'moment');
  const bocetoDrop = useBocetoDrop(data.momentId);
  const styleDrop = useStyleDrop(data.momentId);
  const { drop: srcDrop } = useSourceDrop({ id: data.momentId });

  if (!m) return null;

  // While another moment is dragged over this one, decide before or after.
  const onMomentDragOver = (e) => {
    if (!e.dataTransfer.types.includes(MOMENT_TYPE)) return;
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    const index = data.localIndex + (e.clientX > r.left + r.width / 2 ? 1 : 0);
    const t = useStore.getState().ui.dropTarget;
    if (t?.zoneId !== data.zoneId || t.index !== index) setUi({ dropTarget: { zoneId: data.zoneId, index } });
  };
  const onMomentDrop = (e) => {
    const id = e.dataTransfer.getData(MOMENT_TYPE);
    const t = useStore.getState().ui.dropTarget;
    if (!id || !t) return;
    e.preventDefault();
    moveMomentTo(id, t.zoneId, t.index);
    endDrag();
  };

  const d = data.d || D1;
  const width = momentWidth(m, d);
  const remove = () => {
    deleteMoment(m.id);
    notify('Momento borrado', true);
  };

  return (
    <div
      className={`moment ${flash ? 'flash' : ''} ${m.key ? 'key' : ''}`}
      style={{ '--zc': zoneColor }}
      data-anchor={m.id}
      title="Doble clic para trabajar en este momento aislado"
      onDoubleClick={(e) => { if (!e.target.closest(INTERACTIVE)) setUi({ focusMoment: m.id }); }}
      onDragOver={draggingMoment ? onMomentDragOver : undefined}
      onDrop={draggingMoment ? onMomentDrop : undefined}
    >
      <div className="m-head" style={{ height: d.momentHead, paddingLeft: d.colPad, paddingRight: d.colPad }}>
        <span
          className="m-num nodrag nopan"
          title="Arrastra para mover el momento · doble clic para verlo en detalle"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData(MOMENT_TYPE, m.id);
            e.dataTransfer.effectAllowed = 'move';
            setUi({ dragging: 'moment' });
          }}
          onDragEnd={endDrag}
          onDoubleClick={() => setUi({ focusMoment: m.id })}
        >
          {data.index + 1}
        </span>
        <DurationField moment={m} wpm={wpm} />
        {/* On the right, all together and evenly spaced: palette, key, discards, detail, delete. */}
        <span className="m-right">
          <MomentPaletteButton moment={m} open={popOpen} />
          <button className={`m-flag m-key nodrag nopan ${m.key ? 'on' : ''}`} title={m.key ? 'Momento clave (clic para quitarlo)' : 'Marcar como momento clave'} onClick={() => toggleKey(m.id)}>
            <Icon name="star" size={14} />
          </button>
          <MomentFlags moment={m} />
          <button className="icon-btn m-open nodrag nopan" title="Ver en detalle" onClick={() => setUi({ focusMoment: m.id })}>
            <Icon name="expand" size={14} />
          </button>
          <button className="icon-btn m-del nodrag nopan" title="Borrar el momento" onClick={remove}><Icon name="close" size={14} /></button>
        </span>
      </div>

      {popOpen && (
        <ViewportPortal>
          <div
            className="mpop nodrag nopan nowheel"
            data-mpop={m.id}
            style={{ left: positionAbsoluteX + d.colPad, top: positionAbsoluteY + d.momentHead }}
          >
            <MomentRefs moment={m} />
          </div>
        </ViewportPortal>
      )}

      <div className={`row row-boceto ${bocetoDrop.over ? 'drop-over' : ''}`} style={{ height: d.rowBoceto, gap: d.shotGap }} {...bocetoDrop.props}>
        <NoteMarks moment={m} d={d} />
        {m.shots.map((s) => <Boceto key={s.id} momentId={m.id} shot={s} width={d.shotW} height={d.shotH} />)}
        {!m.shots.length && (
          <button className="slot nodrag nopan" style={{ width: d.shotW, height: d.shotH }} title="Añadir bocetos" onClick={() => pickBocetosFor(m.id)}>+</button>
        )}
      </div>

      <div className="row row-tr" style={{ height: d.rowTr }}>
        {m.shots.map((s, i) => {
          const last = i === m.shots.length - 1;
          // The zone's last cut sits under its last picture, inside the zone.
          const out = last && data.zoneEnd ? { next: data.nextZone } : null;
          const x = out ? width - d.colPad - L.trW / 2 : cutX(m, i, width, d);
          return <TransitionCell key={s.id} momentId={m.id} shot={s} last={last} out={out} x={x} />;
        })}
        {/* Without bocetos, the moment still has its transition to the next one. */}
        {!m.shots.length && (() => {
          const out = data.zoneEnd ? { next: data.nextZone } : null;
          const x = out ? width - d.colPad - L.trW / 2 : cutX(m, -1, width, d);
          return <TransitionCell momentId={m.id} shot={{ id: 'out', transition: null, ...m.trOut }} last out={out} x={x} />;
        })()}
      </div>

      <div className={`row row-style ${styleDrop.over ? 'drop-over' : ''}`} style={{ height: d.rowStyle }} {...styleDrop.props}>
        <StyleFrame moment={m} width={d.shotW} height={d.shotH} />
      </div>

      <div className="row row-narr" style={{ height: d.rowNarr }}>
        <Narration moment={m} height={d.rowNarr - 12} />
      </div>

      <div className={`row row-src ${srcDrop.over ? 'drop-over' : ''}`} style={{ height: d.rowSrc }} {...srcDrop.props}>
        <SourceList moment={m} where="board" />
      </div>
    </div>
  );
}

export default memo(MomentNode);
