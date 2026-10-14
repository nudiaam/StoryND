import { useMemo, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useStore, setUi } from '../store.js';
import { addFreeImages, orderedMoments, placeShots } from '../actions.js';
import { api } from '../api.js';
import Media from '../Media.jsx';

const FREE = '__free';
const SKIP = '__skip';

const snippet = (t, n = 70) => {
  const s = (t || '').replace(/\s+/g, ' ').trim();
  if (!s) return '(sin texto)';
  return s.length > n ? s.slice(0, n) + '…' : s;
};

// Review step for a batch of sketch photos: each photo is shown next to the
// moment it will land in, and can be sent somewhere else before placing.
export default function ImportShotsDialog() {
  const { items, startMomentId } = useStore((s) => s.ui.importShots);
  const project = useStore((s) => s.project);
  const { screenToFlowPosition } = useReactFlow();
  const list = useMemo(() => orderedMoments(project), [project]);

  const [start, setStart] = useState(startMomentId || list[0]?.moment.id || FREE);
  const [kind, setKind] = useState('boceto');
  const [overrides, setOverrides] = useState({});

  const startIdx = list.findIndex((x) => x.moment.id === start);
  const targetFor = (i) => overrides[i] ?? (startIdx >= 0 ? list[startIdx + i]?.moment.id ?? FREE : FREE);
  const label = (x) => `${list.indexOf(x) + 1} · ${x.zone.name} · ${snippet(x.moment.text, 40)}`;

  const close = () => setUi({ importShots: null });

  const cancel = () => {
    api.removeAssets(items.map((it) => it.asset));
    close();
  };

  const place = () => {
    const assignments = [];
    const free = [];
    const skipped = [];
    items.forEach((it, i) => {
      const t = targetFor(i);
      if (t === FREE) free.push(it.asset);
      else if (t === SKIP) skipped.push(it.asset);
      else assignments.push({ momentId: t, asset: it.asset, kind });
    });
    if (assignments.length) placeShots(assignments);
    if (free.length) {
      const c = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
      addFreeImages(free, c.x - 120, c.y - 90);
    }
    if (skipped.length) api.removeAssets(skipped);
    close();
  };

  return (
    <div className="modal-back">
      <div className="modal modal-wide">
        <h2>Colocar {items.length} imágenes</h2>
        <p className="hint">
          Se ordenan por nombre de archivo y van una por momento. Revisa cada foto junto al texto de su momento y cámbiala si hace falta.
        </p>
        <div className="form-row">
          <label>
            Empezar en el momento
            <select value={start} onChange={(e) => { setStart(e.target.value); setOverrides({}); }}>
              {list.map((x) => <option key={x.moment.id} value={x.moment.id}>{label(x)}</option>)}
              <option value={FREE}>Todas al lienzo libre</option>
            </select>
          </label>
          <label>
            Marcar como
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="boceto">Boceto</option>
              <option value="style">Style frame</option>
            </select>
          </label>
        </div>

        <div className="import-list">
          {items.map((it, i) => {
            const t = targetFor(i);
            const target = list.find((x) => x.moment.id === t);
            return (
              <div className="import-row" key={it.asset}>
                <div className="import-thumb"><Media src={it.asset} fit="contain" hover /></div>
                <div className="import-info">
                  <span className="import-file">{it.original}</span>
                  <select value={t} onChange={(e) => setOverrides({ ...overrides, [i]: e.target.value })}>
                    {list.map((x) => <option key={x.moment.id} value={x.moment.id}>{label(x)}</option>)}
                    <option value={FREE}>Lienzo libre</option>
                    <option value={SKIP}>No importar</option>
                  </select>
                  <p className="import-text">
                    {target ? snippet(target.moment.text, 220) : t === FREE ? 'Irá al lienzo, suelta.' : 'No se importará.'}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="modal-foot">
          <span />
          <button onClick={cancel}>Cancelar</button>
          <button className="primary" onClick={place}>Colocar</button>
        </div>
      </div>
    </div>
  );
}
