import { Fragment, useEffect, useState } from 'react';
import { MomentRefs } from './Palette.jsx';
import XButton from './XButton.jsx';
import { useStore, setUi, beginTyping } from './store.js';
import { closeEmptyTransition, moveMedia, openTransition, orderedMoments, removeDiscard, setMomentDescription, setMomentNotes, setTransition } from './actions.js';
import Media from './Media.jsx';
import RichText from './RichText.jsx';
import Icon from './Icon.jsx';
import { Boceto, StyleFrame, pickBocetosFor, useBocetoDrop, useStyleDrop } from './canvas/MomentNode.jsx';
import { DurationField, Narration, useMediaDrop, useSourceDrop } from './canvas/momentParts.jsx';
import { SourceList } from './Sources.jsx';
import { estimateSeconds, formatSeconds, isEditableTarget, startMediaDrag } from './util.js';

const BIG_W = 320;
const BIG_H = 200;

function Neighbor({ item, side }) {
  if (!item) return <div className={`focus-side ${side} empty`} />;
  const { zone, moment: m, number } = item;
  const thumb = m.shots[0]?.asset || m.style;
  return (
    <button className={`focus-side ${side}`} style={{ '--zc': zone.color }} onClick={() => setUi({ focusMoment: m.id })} title={side === 'prev' ? 'Momento anterior (←)' : 'Momento siguiente (→)'}>
      <span className="fs-zone">{zone.name}</span>
      <span className="fs-num">{number}</span>
      {thumb && <div className="fs-thumb"><Media src={thumb} fit="cover" /></div>}
      <p>{m.text.trim() || 'Momento sin texto'}</p>
    </button>
  );
}

function InlineTransition({ momentId, shot, last }) {
  if (shot.transition === null) {
    return (
      <button className="ftr-add" title={last ? 'Transición al siguiente momento' : 'Transición al siguiente plano'} onClick={() => openTransition(momentId, shot.id)}>
        {last ? '+ transición →' : '+'}
      </button>
    );
  }
  return (
    <RichText
      className="ftr-text"
      autoFocus={!shot.transition}
      html={shot.trHtml}
      text={shot.transition}
      placeholder={last ? 'al siguiente momento…' : 'corte, fundido…'}
      onChange={({ text, html }) => setTransition(momentId, shot.id, text, html)}
      onBlur={() => closeEmptyTransition(momentId, shot.id)}
    />
  );
}

// The right column: the moment's references (its palette and images) and
// its discards, in two tabs. The tab chosen last is kept.
let lastTab = 'refs';
function FocusAside({ moment }) {
  const [tab, setTab] = useState(lastTab);
  const choose = (t) => { lastTab = t; setTab(t); };
  const n = moment.discards?.length || 0;
  return (
    <aside className="focus-aside">
      <div className="focus-tabs">
        <button className={tab === 'refs' ? 'on' : ''} onClick={() => choose('refs')}>Referencias</button>
        <button className={tab === 'discards' ? 'on' : ''} onClick={() => choose('discards')}>Descartes{n ? ` · ${n}` : ''}</button>
      </div>
      {tab === 'refs' ? <MomentRefs moment={moment} /> : <Discards moment={moment} />}
    </aside>
  );
}

// Drop any picture here to set it aside; drag it back onto a boceto or a
// style frame to use it again.
function Discards({ moment }) {
  const list = moment.discards || [];
  const drop = useMediaDrop('discard:' + moment.id, (assets) => {
    for (const a of assets) moveMedia({ asset: a }, 'discard:' + moment.id);
  });
  return (
    <div className={`discards ${drop.over ? 'drop-over' : ''}`} {...drop.props}>
      {!list.length && <p className="hint">Arrastra aquí lo que no te convenza. También llegan solos los bocetos y style frames que quites o sustituyas.</p>}
      {list.map((d) => (
        <div
          key={d.id}
          className="discard"
          draggable
          onDragStart={(e) => startMediaDrag(e, d.src, { kind: 'discard', momentId: moment.id, discardId: d.id })}
          onDoubleClick={() => setUi({ lightbox: { asset: d.src, rot: d.rot } })}
        >
          <Media src={d.src} fit="cover" hover rot={d.rot} />
          <XButton onClick={() => removeDiscard(moment.id, d.id)} />
        </div>
      ))}
    </div>
  );
}

// One moment, large, to look at and edit with full attention. The moments
// before and after sit dimmed at the sides.
export default function FocusView() {
  const id = useStore((s) => s.ui.focusMoment);
  const project = useStore((s) => s.project);
  const list = orderedMoments(project).map((x, i) => ({ ...x, number: i + 1 }));
  const idx = list.findIndex((x) => x.moment.id === id);
  const current = list[idx];
  const bocetoDrop = useBocetoDrop(id);
  const styleDrop = useStyleDrop(id);
  const { drop: srcDrop } = useSourceDrop({ id });

  useEffect(() => {
    const onKey = (e) => {
      if (isEditableTarget(document.activeElement)) return;
      if (e.key === 'ArrowLeft' && list[idx - 1]) setUi({ focusMoment: list[idx - 1].moment.id });
      if (e.key === 'ArrowRight' && list[idx + 1]) setUi({ focusMoment: list[idx + 1].moment.id });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!current) return null;
  const { zone, moment: m, number } = current;
  const close = () => setUi({ focusMoment: null });

  return (
    <div className="focus-back" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <Neighbor item={list[idx - 1]} side="prev" />
      <div className="focus-card" style={{ '--zc': zone.color }}>
        <header className="focus-head">
          <span className="focus-zone">{zone.name}</span>
          <span className="m-num">{number}</span>
          <DurationField moment={m} wpm={project.settings.wpm} />
          <button className="icon-btn focus-close" title="Cerrar (Esc)" onClick={close}><Icon name="close" size={14} /></button>
        </header>
        <div className="focus-body">
          <div className="focus-main">
            <section>
              <h4>Narración</h4>
              <div className="focus-narr"><Narration moment={m} height={140} big /></div>
            </section>
            {/* What happens, and loose ideas: side by side, the same height. */}
            <section className="focus-two">
              <div className="focus-desc">
                <h4>Descripción</h4>
                <RichText
                  className="edit desc-text"
                  html={m.descHtml}
                  text={m.description}
                  placeholder="Qué pasa en este momento"
                  onChange={({ text, html }) => setMomentDescription(m.id, text, html)}
                />
              </div>
              <div className="focus-notes">
                <h4>Apuntes</h4>
                <RichText
                  className="edit notes-text"
                  html={m.notesHtml}
                  text={m.notes}
                  placeholder="Ideas sueltas, referencias, dudas…"
                  onChange={({ text, html }) => setMomentNotes(m.id, text, html)}
                />
              </div>
            </section>
            <section>
              <h4>Bocetos y transiciones</h4>
              <div className={`focus-row ${bocetoDrop.over ? 'drop-over' : ''}`} {...bocetoDrop.props}>
                {m.shots.map((s, i) => (
                  <Fragment key={s.id}>
                    <Boceto momentId={m.id} shot={s} width={BIG_W} height={BIG_H} />
                    <InlineTransition momentId={m.id} shot={s} last={i === m.shots.length - 1} />
                  </Fragment>
                ))}
                <button className="slot" style={{ width: m.shots.length ? 90 : BIG_W, height: BIG_H }} title="Añadir bocetos" onClick={() => pickBocetosFor(m.id)}>+</button>
              </div>
            </section>
            <section>
              <h4>Style frame</h4>
              <div className={`focus-row ${styleDrop.over ? 'drop-over' : ''}`} {...styleDrop.props}>
                <StyleFrame moment={m} width={BIG_W} height={BIG_H} />
              </div>
            </section>
            <section className={srcDrop.over ? 'drop-over' : ''} {...srcDrop.props}>
              <h4>Fuente</h4>
              <div className="focus-src">
                <SourceList moment={m} where="focus" />
              </div>
            </section>
          </div>
          <FocusAside moment={m} />
        </div>
      </div>
      <Neighbor item={list[idx + 1]} side="next" />
    </div>
  );
}
