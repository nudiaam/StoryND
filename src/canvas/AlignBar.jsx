import { NodeToolbar, Position, useNodes } from '@xyflow/react';
import { arrangeItems } from '../actions.js';
import Icon from '../Icon.jsx';

const box = (n) => ({
  n,
  x: n.position.x,
  y: n.position.y,
  w: n.measured?.width ?? n.width ?? 0,
  h: n.measured?.height ?? n.height ?? 0,
});

// Moves for each alignment: every box keeps its size, only x / y change.
const OPS = {
  left: (bs) => { const v = Math.min(...bs.map((b) => b.x)); return bs.map((b) => ({ b, x: v, y: b.y })); },
  centerH: (bs) => {
    const c = (Math.min(...bs.map((b) => b.x)) + Math.max(...bs.map((b) => b.x + b.w))) / 2;
    return bs.map((b) => ({ b, x: c - b.w / 2, y: b.y }));
  },
  right: (bs) => { const v = Math.max(...bs.map((b) => b.x + b.w)); return bs.map((b) => ({ b, x: v - b.w, y: b.y })); },
  top: (bs) => { const v = Math.min(...bs.map((b) => b.y)); return bs.map((b) => ({ b, x: b.x, y: v })); },
  middleV: (bs) => {
    const c = (Math.min(...bs.map((b) => b.y)) + Math.max(...bs.map((b) => b.y + b.h))) / 2;
    return bs.map((b) => ({ b, x: b.x, y: c - b.h / 2 }));
  },
  bottom: (bs) => { const v = Math.max(...bs.map((b) => b.y + b.h)); return bs.map((b) => ({ b, x: b.x, y: v - b.h })); },
  // Same space between neighbours, keeping the first and last where they are.
  distH: (bs) => {
    const s = [...bs].sort((a, b) => a.x - b.x);
    const span = s[s.length - 1].x + s[s.length - 1].w - s[0].x;
    const gap = (span - s.reduce((n, b) => n + b.w, 0)) / (s.length - 1);
    let x = s[0].x;
    return s.map((b) => { const m = { b, x, y: b.y }; x += b.w + gap; return m; });
  },
  distV: (bs) => {
    const s = [...bs].sort((a, b) => a.y - b.y);
    const span = s[s.length - 1].y + s[s.length - 1].h - s[0].y;
    const gap = (span - s.reduce((n, b) => n + b.h, 0)) / (s.length - 1);
    let y = s[0].y;
    return s.map((b) => { const m = { b, x: b.x, y }; y += b.h + gap; return m; });
  },
};

const BUTTONS = [
  ['left', 'alignLeft', 'Alinear a la izquierda'],
  ['centerH', 'alignCenterH', 'Centrar en horizontal'],
  ['right', 'alignRight', 'Alinear a la derecha'],
  null,
  ['top', 'alignTop', 'Alinear arriba'],
  ['middleV', 'alignMiddleV', 'Centrar en vertical'],
  ['bottom', 'alignBottom', 'Alinear abajo'],
  null,
  ['distH', 'distH', 'Repartir en horizontal (mismo espacio entre ellos)', 3],
  ['distV', 'distV', 'Repartir en vertical (mismo espacio entre ellos)', 3],
];

// Appears above a selection of two or more zones, windows or loose items.
export default function AlignBar() {
  const nodes = useNodes();
  const selected = nodes.filter((n) => n.selected && n.type !== 'moment');
  if (selected.length < 2) return null;

  const run = (op) => {
    const moves = OPS[op](selected.map(box)).map(({ b, x, y }) => (
      b.n.type === 'zone' ? { kind: 'zone', id: b.n.data.zoneId, x, y } : { kind: 'free', id: b.n.id, x, y }
    ));
    arrangeItems(moves);
  };

  return (
    <NodeToolbar nodeId={selected.map((n) => n.id)} isVisible position={Position.Top} offset={14}>
      <div className="align-bar">
        <span className="align-count">{selected.length} seleccionados</span>
        {BUTTONS.map((b, i) => {
          if (!b) return <span key={i} className="align-sep" />;
          const [op, icon, title, min = 2] = b;
          return (
            <button key={op} title={title} disabled={selected.length < min} onClick={() => run(op)}>
              <Icon name={icon} size={17} />
            </button>
          );
        })}
      </div>
    </NodeToolbar>
  );
}
