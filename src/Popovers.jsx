import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useStore, setUi, beginTyping } from './store.js';
import { listFonts } from './fonts.js';
import Icon from './Icon.jsx';

// ---------- opening ----------

// Opens a picker under `el`. onChange receives each new value while the
// person adjusts it; the whole adjustment is one undo step.
export function openPopover(kind, el, value, onChange, options) {
  beginTyping();
  setUi({ popover: { kind, rect: el.getBoundingClientRect().toJSON(), value, onChange, options } });
}
const close = () => setUi({ popover: null });

// ---------- colour maths ----------

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const hexToRgb = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgbToHex = (r, g, b) => '#' + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
function rgbToHsv(r, g, b) {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const d = max - Math.min(R, G, B);
  let h = 0;
  if (d) h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [(h * 60 + 360) % 360, max ? d / max : 0, max];
}
function hsvToRgb(h, s, v) {
  const f = (n) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [f(5) * 255, f(3) * 255, f(1) * 255];
}
function rgbToCmyk(r, g, b) {
  const k = 1 - Math.max(r, g, b) / 255;
  if (k >= 1) return [0, 0, 0, 100];
  const c = (1 - r / 255 - k) / (1 - k);
  const m = (1 - g / 255 - k) / (1 - k);
  const y = (1 - b / 255 - k) / (1 - k);
  return [c, m, y, k].map((v) => Math.round(v * 100));
}
const cmykToRgb = (c, m, y, k) => [c, m, y].map((v) => 255 * (1 - v / 100) * (1 - k / 100));

// ---------- colour picker ----------
// The square and, beside it, the colour in large; its HEX below; sliders
// for RGB, CMYK or HSB (like Illustrator); the project's colours at the end.

const CHANNELS = {
  rgb: [['R', 255], ['G', 255], ['B', 255]],
  cmyk: [['C', 100], ['M', 100], ['Y', 100], ['K', 100]],
  hsb: [['H', 359], ['S', 100], ['B', 100]],
};
let lastMode = 'rgb'; // the tab chosen last time

function Channel({ label, max, value, track, onChange }) {
  const [draft, setDraft] = useState(String(value));
  const [typing, setTyping] = useState(false);
  useEffect(() => { if (!typing) setDraft(String(value)); }, [value, typing]);
  return (
    <div className="cp-ch">
      <span>{label}</span>
      <input type="range" min={0} max={max} value={value} style={{ background: track }} onChange={(e) => onChange(Number(e.target.value))} />
      <input
        className="cp-val"
        value={draft}
        onFocus={() => setTyping(true)}
        onBlur={() => setTyping(false)}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        onChange={(e) => {
          setDraft(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value !== '' && Number.isFinite(n)) onChange(clamp(n, 0, max));
        }}
      />
    </div>
  );
}

function ColorPicker({ value, onChange }) {
  const [hsv, setHsv] = useState(() => rgbToHsv(...(hexToRgb(value) || [127, 119, 221])));
  const [hexDraft, setHexDraft] = useState(value);
  const [mode, setMode] = useState(lastMode);
  const colors = useStore((s) => s.project?.zones.find((z) => z.colors)?.colors);
  const palette = (colors || []).map((c) => c.hex);
  const sv = useRef(null);
  const rgb = hsvToRgb(...hsv);
  const hex = rgbToHex(...rgb);
  const R = rgb.map(Math.round);
  const cmyk = rgbToCmyk(...rgb);

  const set = (next) => {
    setHsv(next);
    const h = rgbToHex(...hsvToRgb(...next));
    setHexDraft(h);
    onChange(h);
  };
  // Keeps the hue when the colour turns grey, so the square doesn't jump.
  const setRgb = (r, g, b) => {
    const next = rgbToHsv(r, g, b);
    if (!next[1] || !next[2]) next[0] = hsv[0];
    set(next);
  };

  const pickSV = (e) => {
    const r = sv.current.getBoundingClientRect();
    set([hsv[0], clamp((e.clientX - r.left) / r.width, 0, 1), clamp(1 - (e.clientY - r.top) / r.height, 0, 1)]);
  };
  const eyedrop = async () => {
    try {
      const { sRGBHex } = await new window.EyeDropper().open();
      const c = hexToRgb(sRGBHex);
      if (c) setRgb(...c);
    } catch { /* cancelled */ }
  };

  // Each channel: its value, how a new one changes the colour, and the
  // colours along its track.
  const values = mode === 'rgb' ? R : mode === 'cmyk' ? cmyk : [Math.round(hsv[0]), Math.round(hsv[1] * 100), Math.round(hsv[2] * 100)];
  const colourWith = (i, v) => {
    const next = [...values];
    next[i] = v;
    if (mode === 'rgb') return next;
    if (mode === 'cmyk') return cmykToRgb(...next);
    return hsvToRgb(next[0], next[1] / 100, next[2] / 100);
  };
  const apply = (i, v) => {
    if (mode === 'hsb') {
      const next = [...values];
      next[i] = v;
      set([next[0], next[1] / 100, next[2] / 100]);
    } else setRgb(...colourWith(i, v));
  };
  const track = (i, max) => (mode === 'hsb' && i === 0
    ? 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)'
    : `linear-gradient(to right, ${[0, 0.25, 0.5, 0.75, 1].map((f) => rgbToHex(...colourWith(i, Math.round(f * max)))).join(', ')})`);

  return (
    <div className="cp">
      <div className="cp-top">
        <div
          ref={sv}
          className="cp-sv"
          style={{ background: `hsl(${hsv[0]}, 100%, 50%)` }}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); pickSV(e); }}
          onPointerMove={(e) => { if (e.buttons) pickSV(e); }}
        >
          <span className="cp-mark" style={{ left: `${hsv[1] * 100}%`, top: `${(1 - hsv[2]) * 100}%`, background: hex }} />
        </div>
        <span className="cp-swatch" style={{ background: hex }} />
      </div>
      <div className="cp-hexrow">
        <input
          className="cp-hex"
          value={hexDraft.toUpperCase()}
          spellCheck={false}
          onChange={(e) => {
            setHexDraft(e.target.value);
            const c = hexToRgb(e.target.value);
            if (c) { setHsv(rgbToHsv(...c)); onChange(rgbToHex(...c)); }
          }}
          onBlur={() => setHexDraft(hex)}
        />
        {window.EyeDropper && (
          <button className="cp-eye" title="Cuentagotas: coge un color de la pantalla" onClick={eyedrop}><Icon name="eyedropper" size={16} /></button>
        )}
      </div>
      <div className="cp-tabs">
        {Object.keys(CHANNELS).map((m) => (
          <button key={m} className={mode === m ? 'on' : ''} onClick={() => { setMode(m); lastMode = m; }}>{m.toUpperCase()}</button>
        ))}
      </div>
      <div className="cp-chs">
        {CHANNELS[mode].map(([label, max], i) => (
          <Channel key={mode + label} label={label} max={max} value={values[i]} track={track(i, max)} onChange={(v) => apply(i, v)} />
        ))}
      </div>
      {palette.length > 0 && (
        <>
          <div className="cp-divider" />
          <span className="cp-title">Colores del proyecto</span>
          <div className="cp-palette">
            {palette.map((c, i) => (
              <button key={c + i} style={{ background: c }} title={c} onClick={() => { const v = hexToRgb(c); if (v) setRgb(...v); }} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---------- preset colours ----------

function SwatchRow({ value, options, onChange }) {
  return (
    <div className="sw-row">
      {options.map((c) => (
        <button
          key={c || 'none'}
          className={`sw-dot ${c ? '' : 'none'} ${(value || null) === c ? 'on' : ''}`}
          style={c ? { background: c } : undefined}
          title={c ? c : 'Color del tema'}
          onClick={() => { onChange(c); close(); }}
        />
      ))}
    </div>
  );
}

// ---------- font picker ----------

function FontPicker({ value, onChange }) {
  const fonts = useStore((s) => s.ui.fontList);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef(null);

  useEffect(() => {
    if (!fonts.length) listFonts().then((fontList) => setUi({ fontList }));
  }, [fonts.length]);

  // Open on the font in use.
  useEffect(() => {
    if (fonts.length) setActive(Math.max(0, fonts.indexOf(value)));
  }, [fonts.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? fonts.filter((f) => f.toLowerCase().includes(s)) : fonts;
  }, [fonts, q]);

  useLayoutEffect(() => {
    listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const choose = (f) => { onChange(f); close(); };

  return (
    <div className="fp">
      <input
        className="fp-search"
        autoFocus
        placeholder={`Buscar entre ${fonts.length || ''} tipografías…`}
        value={q}
        onChange={(e) => { setQ(e.target.value); setActive(0); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(shown.length - 1, a + 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
          if (e.key === 'Enter' && shown[active]) choose(shown[active]);
        }}
      />
      <div className="fp-list" ref={listRef}>
        {shown.map((f, i) => (
          <button
            key={f}
            className={`fp-item ${f === value ? 'current' : ''} ${i === active ? 'active' : ''}`}
            onMouseEnter={() => setActive(i)}
            onClick={() => choose(f)}
          >
            <span className="fp-aa" style={{ fontFamily: `"${f}"` }}>Aa</span>
            <span className="fp-name" style={{ fontFamily: `"${f}"` }}>{f}</span>
          </button>
        ))}
        {!fonts.length && <p className="hint fp-none">Cargando tipografías…</p>}
        {fonts.length > 0 && !shown.length && <p className="hint fp-none">No hay ninguna tipografía con ese nombre.</p>}
      </div>
    </div>
  );
}

// ---------- host ----------

// The one open picker, placed under what opened it and kept on screen.
export function PopoverHost() {
  const pop = useStore((s) => s.ui.popover);
  const box = useRef(null);
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    if (!pop || !box.current) return;
    const w = box.current.offsetWidth;
    const h = box.current.offsetHeight;
    let left = pop.rect.left;
    let top = pop.rect.bottom + 6;
    if (top + h > window.innerHeight - 8) top = Math.max(8, pop.rect.top - h - 6);
    left = clamp(left, 8, window.innerWidth - w - 8);
    setPos({ left, top });
  }, [pop]);

  useEffect(() => {
    if (!pop) return;
    const onDown = (e) => { if (box.current && !box.current.contains(e.target)) close(); };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    // Zooming or scrolling the board would leave it floating away from its field.
    const onWheel = (e) => { if (box.current && !box.current.contains(e.target)) close(); };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('wheel', onWheel, true);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('wheel', onWheel, true);
    };
  }, [pop]);

  if (!pop) return null;
  return (
    <div ref={box} className="popover" style={pos ? { left: pos.left, top: pos.top } : { visibility: 'hidden' }}>
      {pop.kind === 'color' && <ColorPicker value={pop.value} onChange={pop.onChange} />}
      {pop.kind === 'font' && <FontPicker value={pop.value} onChange={pop.onChange} />}
      {pop.kind === 'swatches' && <SwatchRow value={pop.value} options={pop.options} onChange={pop.onChange} />}
    </div>
  );
}
