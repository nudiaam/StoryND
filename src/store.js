import { create } from 'zustand';
import { produce } from 'immer';
import { uid, ZONE_COLORS } from './util.js';
import { L, MOOD_MIN_COL, ZONE_MOOD_W, itemRatio, moodColWFor, zoneScaleFor } from './layout.js';

const HISTORY_LIMIT = 100;

export function newProject(name) {
  return migrate({
    name,
    zones: [
      { id: uid(), kind: 'general', name: 'Estilo general', color: '#b4b2a9', momentIds: [], moodboard: [] },
      { id: uid(), kind: 'normal', name: 'Zona 1', color: ZONE_COLORS[0], momentIds: [], moodboard: [] },
    ],
  });
}

function migrateSettings(s = {}) {
  const out = { wpm: 140, stripOpen: true, ...s };
  // The strip lives on the side unless someone picked a position on purpose.
  if (!out.stripChosen) out.stripPos = 'side';
  return out;
}

// Moodboards are columns: each item mspan columns wide, in column mcol.
// Older projects had thin columns (fcs/fcol, 4 per column) or cells (gx, gy,
// gw, gh, 4 per column): they keep their places, top ones first.
const THIN = 4;
function migrateMood(items) {
  const cells = items.some((it) => it.gx != null);
  const list = cells ? items.slice().sort((a, b) => (a.gy ?? 1e9) - (b.gy ?? 1e9) || (a.gx ?? 0) - (b.gx ?? 0)) : items;
  return list.map(({ pinned, span, cs, col, fcs, fcol, gx, gy, gw, gh, ...it }) => {
    if (it.mspan != null) return it;
    if (gw != null) return { ...it, mspan: Math.max(1, Math.round(gw / THIN)), mcol: Math.round(gx / THIN) };
    const mspan = Math.max(1, Math.round((fcs ?? (cs ?? (span || 1) * 2) * THIN) / THIN));
    const c = fcol ?? (col != null ? col * THIN : null);
    return c == null ? { ...it, mspan } : { ...it, mspan, mcol: Math.round(c / THIN) };
  });
}
// The width a moodboard has on the board.
const moodWidthOf = (z) => (z.kind === 'general' ? (z.size?.w ?? L.generalW) - L.pad * 2 : ZONE_MOOD_W - 32);
// Moodboards used to stretch their columns to the window (`moodCols` was how
// many there were when the items were put there). Now columns keep a width:
// they keep the one they show now, and every item gets the place and size it
// is seen with (laid out as before).
function fixMoodColumns(z, out) {
  const width = moodWidthOf(z);
  const gap = L.moodGap;
  const colW = moodColWFor(width);
  const cols = Math.max(4, Math.floor((width + gap) / (MOOD_MIN_COL + gap)));
  const k = out.moodCols ? cols / out.moodCols : 1;
  const heights = new Array(cols).fill(0);
  const seen = {};
  for (const it of out.moodboard) {
    // A zone's moodboard (in its dropdown) shows no colours.
    if ((it.kind === 'color' && z.kind !== 'general') || it.mspan == null) continue;
    const span = Math.max(1, Math.min(cols, Math.round(it.mspan * k)));
    let col = 0;
    let top = Infinity;
    if (it.mcol != null) {
      col = Math.max(0, Math.min(cols - span, Math.round(it.mcol * k)));
      top = Math.max(...heights.slice(col, col + span));
    } else {
      for (let c = 0; c + span <= cols; c++) {
        const t = Math.max(...heights.slice(c, c + span));
        if (t < top - 0.5) { top = t; col = c; }
      }
    }
    seen[it.id] = { mspan: span, mcol: col };
    const h = (colW * span + gap * (span - 1)) / itemRatio(it);
    for (let c = col; c < col + span; c++) heights[c] = top + h + gap;
  }
  out.moodboard = out.moodboard.map((it) => (seen[it.id] ? { ...it, ...seen[it.id] } : it));
  out.moodColW = colW;
  delete out.moodCols;
}

// The main general window (the first one, "Estilo general") keeps colours
// and fonts apart from its photos. Stars are gone: the strip shows everything.
function migrateZone(z, i, zones) {
  const out = { pos: null, size: null, ...z };
  out.moodboard = migrateMood(z.moodboard || []);
  // The strip's own arrangement is rows now (an order and row heights).
  if (out.strip && !Array.isArray(out.strip.side?.order) && !Array.isArray(out.strip.top?.order)) delete out.strip;
  if (z.kind === 'general' && zones.find((x) => x.kind === 'general') === z) {
    const moved = out.moodboard.filter((i) => i.kind === 'color').map((i) => ({ id: i.id, hex: i.text }));
    out.colors = [...(z.colors || []), ...moved];
    out.fonts = z.fonts || [];
    out.typeScale = z.typeScale || [];
    if (out.fonts.length && !out.typeScale.length) {
      const [a, b = a] = out.fonts;
      out.typeScale = [
        ['Display', a, 700, 48], ['Título', a, 600, 32], ['Subtítulo', a, 500, 22], ['Cuerpo', b, 400, 16], ['Etiqueta', b, 600, 12],
      ].map(([name, f, weight, size]) => ({ id: uid(), name, fontId: f.id, weight, size }));
    }
    out.moodboard = out.moodboard.filter((i) => i.kind !== 'color');
    // How the palette is used: dominant (60), secondary (30) and accent (10)
    // colours, by colour id.
    out.dist = { 60: [], 30: [], 10: [], ...(z.dist || {}) };
  }
  if (out.moodColW == null) fixMoodColumns(z, out);
  return out;
}

// Brings any saved project up to the current format.
export function migrate(p) {
  const moments = {};
  for (const [id, m] of Object.entries(p.moments || {})) {
    // v1 kept style frames among the shots; now each moment has one style frame.
    let style = m.style ?? null;
    const shots = [];
    for (const s of m.shots || []) {
      if (s.kind === 'style' && !style) style = s.asset;
      else shots.push({ id: s.id, asset: s.asset, transition: s.transition ?? null, ...(s.trHtml ? { trHtml: s.trHtml } : {}), ...(s.rot ? { rot: s.rot } : {}) });
    }
    // Pictures that were sources are now the moment's own reference images.
    // A source is what it says (or what it is) and, if it has one, its link.
    // Old quotes and links become that: a quote keeps its text, a link its address.
    const sources = (m.sources || []).filter((s) => s.kind !== 'imagen').map((s) => ({ id: s.id, text: s.text || '', url: s.url || '' }));
    const refs = [...(m.refs || []), ...(m.sources || []).filter((s) => s.kind === 'imagen' && s.asset).map((s) => ({ id: s.id, asset: s.asset }))];
    moments[id] = {
      id, text: m.text || '', ...(m.html ? { html: m.html } : {}), description: m.description || '', ...(m.descHtml ? { descHtml: m.descHtml } : {}),
      sources, shots, style, ...(m.styleRot ? { styleRot: m.styleRot } : {}), duration: m.duration ?? null, discards: m.discards || [],
      // Its own colours (ids from the general palette) and reference images.
      palette: { 60: [], 30: [], 10: [], ...(m.palette || {}) }, refs,
      // By default a moment follows the general palette; one that already
      // has colours of its own keeps them.
      paletteLinked: m.paletteLinked ?? ![60, 30, 10].some((t) => m.palette?.[t]?.length),
      // Loose ideas about the moment (not what happens in it), and whether it is key.
      notes: m.notes || '', ...(m.notesHtml ? { notesHtml: m.notesHtml } : {}), key: !!m.key,
    };
  }
  const zones = (p.zones || []).map(migrateZone);
  // Zones used to keep the width they were stretched to (their moments grew
  // or shrank to fill it); now they keep the scale it gave them.
  for (const z of zones) {
    if (z.kind !== 'normal' || z.size?.w == null) continue;
    if (z.momentIds.some((id) => moments[id])) {
      z.scale = Math.round(zoneScaleFor(moments, z, z.size.w) * 1000) / 1000;
      z.size = z.size.h != null ? { h: z.size.h } : null;
    }
  }
  return {
    app: 'storyboard',
    version: 2,
    name: p.name || 'Proyecto',
    settings: migrateSettings(p.settings),
    zones,
    moments,
    free: p.free || [],
    // An arrow carries several labels (text and/or pictures) along its line.
    arrows: (p.arrows || []).map(({ text, images, labelT, ctrlIdx, ...a }) => ({
      ...a,
      labels: a.labels || (text || images?.length ? [{ id: uid(), t: labelT ?? 0.5, text: text || '', images: images || [] }] : []),
    })),
  };
}

export const useStore = create((set, get) => ({
  file: null, // the open project file
  doc: null, // { name, versions: [{ id, name, updated }], current }
  project: null,
  past: [],
  future: [],
  pendingCheckpoint: null,
  saveState: 'saved',
  ui: {
    view: 'board', // 'board' | 'script'
    tool: 'select', // select | note | text | arrow
    scriptLocked: true, // zone separators in the script view
    importShots: null,
    lightbox: null,
    selectedArrow: null,
    editingArrow: null,
    dropTarget: null, // { zoneId, index } while a moment is dragged
    dragging: null, // 'moment' | 'zone' | null
    focusId: null, // a just-created field that should get the cursor
    toast: null, // { id, text, undo } small notice at the bottom
    focusMoment: null, // moment open in the detail view
    fontList: [], // installed font families, loaded on first use
    theme: 'light', // 'light' | 'dark'
    // Videos on the board and the style strip stay still (saves the computer's
    // effort). Remembered on this computer. The preview always plays.
    still: (() => { try { return localStorage.getItem('sb-still') === '1'; } catch { return false; } })(),
    isolate: null, // node id of a window worked on in isolation
    popover: null, // { kind: 'color' | 'font', anchor: DOMRect, value, onChange }
    dropHover: null, // slot under a loose item being dragged ("boceto:<id>"…)
  },

  // r: what the main process returns when a project or version is opened.
  load(r, project = r.data) {
    const p = migrate(project);
    const hasScript = Object.keys(p.moments).length > 0;
    set({
      file: r.file, doc: { name: r.name, versions: r.versions, current: r.current },
      project: p, past: [], future: [], pendingCheckpoint: null, saveState: 'saved',
      ui: { ...get().ui, view: hasScript ? 'board' : 'script', scriptLocked: hasScript, selectedArrow: null },
    });
  },

  close() {
    set({ file: null, doc: null, project: null, past: [], future: [] });
  },

  // Every change goes through here. Text typing passes {typing: true}: the
  // state before the first keystroke becomes one undo step for the whole edit.
  update(fn, { history = true, typing = false } = {}) {
    const { project: prev, past, pendingCheckpoint } = get();
    if (!prev) return;
    const next = produce(prev, fn);
    if (next === prev) return;
    if (typing) {
      if (pendingCheckpoint) {
        set({ project: next, past: [...past, pendingCheckpoint].slice(-HISTORY_LIMIT), future: [], pendingCheckpoint: null });
      } else {
        set({ project: next });
      }
      return;
    }
    set({
      project: next,
      past: history ? [...past, prev].slice(-HISTORY_LIMIT) : past,
      future: history ? [] : get().future,
      pendingCheckpoint: null,
    });
  },

  beginTyping() {
    set({ pendingCheckpoint: get().project });
  },

  // Every step taken after `mark` (an entry of `past`) folds into one.
  squash(mark) {
    const { past } = get();
    const i = past.lastIndexOf(mark);
    if (i >= 0 && i < past.length - 1) set({ past: past.slice(0, i + 1) });
  },

  undo() {
    const { past, project, future } = get();
    if (!past.length) return;
    set({ project: past[past.length - 1], past: past.slice(0, -1), future: [project, ...future], pendingCheckpoint: null });
  },

  redo() {
    const { past, project, future } = get();
    if (!future.length) return;
    set({ project: future[0], past: [...past, project], future: future.slice(1), pendingCheckpoint: null });
  },

  setUi(patch) {
    set({ ui: { ...get().ui, ...patch } });
  },

  setSaveState(saveState) {
    set({ saveState });
  },
}));

if (import.meta.env.DEV) window.__sb = useStore;

export const update = (fn, opts) => useStore.getState().update(fn, opts);
export const setUi = (patch) => useStore.getState().setUi(patch);
export const beginTyping = () => useStore.getState().beginTyping();
export const endDrag = () => setUi({ dragging: null, dropTarget: null });

// Non-blocking notice instead of pop-ups; `undo` adds a Deshacer button.
// The undo button only stays while nothing else has changed since.
// action: { label, run } for a button of its own (e.g. bring back a version).
export const notify = (text, undo = false, action = null) =>
  setUi({ toast: { id: uid(), text, undo, action, pastLen: useStore.getState().past.length } });
