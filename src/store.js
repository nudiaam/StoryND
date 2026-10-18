import { create } from 'zustand';
import { produce } from 'immer';
import { uid, ZONE_COLORS } from './util.js';
import { MOOD_FINE } from './layout.js';

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

// The main general window (the first one, "Estilo general") keeps colours
// and fonts apart from its photos. Stars are gone: the strip shows everything.
function migrateZone(z, i, zones) {
  const out = { pos: null, size: null, ...z };
  // Spans and columns count thin columns now (MOOD_FINE per old one): the
  // same places and sizes, with finer steps from here on.
  out.moodboard = (z.moodboard || []).map(({ pinned, span, cs, col, ...it }) => {
    const fcs = it.fcs ?? (cs ?? (span || 1) * 2) * MOOD_FINE;
    const fcol = it.fcol ?? (col != null ? col * MOOD_FINE : null);
    return fcol == null ? { ...it, fcs } : { ...it, fcs, fcol };
  });
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
  return {
    app: 'storyboard',
    version: 2,
    name: p.name || 'Proyecto',
    settings: migrateSettings(p.settings),
    zones: (p.zones || []).map(migrateZone),
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
