import { update, useStore } from './store.js';
import { uid, ZONE_COLORS } from './util.js';
import { mediaKindOf } from './media.js';
import { GRID, L, computeLayout, moodColWFor } from './layout.js';

// ---------- helpers (operate on immer drafts) ----------

const zoneOf = (p, momentId) => p.zones.find((z) => z.momentIds.includes(momentId));
const normalZones = (p) => p.zones.filter((z) => z.kind === 'normal');
const nextColor = (p) => ZONE_COLORS[normalZones(p).length % ZONE_COLORS.length];

// Arrow ends glued to a deleted element stay where they were drawn.
function unglue(p, ids) {
  for (const a of p.arrows) {
    if (a.from && ids.has(a.from.id)) a.from = null;
    if (a.to && ids.has(a.to.id)) a.to = null;
  }
}

const momentAnchorIds = (m) => [m.id, 'sf-' + m.id, ...m.shots.map((s) => s.id), ...m.sources.map((s) => s.id)];

export const zoneNodeId = (zoneId) => 'zone-' + zoneId;

export function orderedMoments(project) {
  const out = [];
  for (const z of project.zones) for (const id of z.momentIds) if (project.moments[id]) out.push({ zone: z, moment: project.moments[id] });
  return out;
}

// ---------- zones ----------

const blankZone = (p, name) => ({ id: uid(), kind: 'normal', name, color: nextColor(p), momentIds: [], moodboard: [], pos: null, size: null });

export function addZone(name) {
  let id;
  update((p) => {
    const z = blankZone(p, name || `Zona ${normalZones(p).length + 1}`);
    id = z.id;
    p.zones.push(z);
  });
  return id;
}

// A new empty zone right after another one (or right before), in time and
// on the board.
export function addZoneAfter(afterId, before = false) {
  let id;
  update((p) => {
    const z = blankZone(p, `Zona ${normalZones(p).length + 1}`);
    id = z.id;
    const i = p.zones.findIndex((x) => x.id === afterId);
    p.zones.splice(i < 0 ? p.zones.length : before ? i : i + 1, 0, z);
  });
  return id;
}

export function renameZone(id, name) {
  update((p) => { p.zones.find((z) => z.id === id).name = name; }, { typing: true });
}

export function setZoneColor(id, color) {
  update((p) => { p.zones.find((z) => z.id === id).color = color; }, { typing: true });
}

// Chronological order: puts a zone before the zone `beforeId` (or last).
export function moveZoneTo(id, beforeId) {
  if (id === beforeId) return;
  update((p) => {
    const zone = p.zones.find((z) => z.id === id);
    p.zones = p.zones.filter((z) => z.id !== id);
    const at = beforeId ? p.zones.findIndex((z) => z.id === beforeId) : p.zones.length;
    p.zones.splice(at, 0, zone);
  });
}

// Where a zone or window sits on the canvas, and its size. Placing zones
// freely never changes their chronological order.
export function setZoneBox(id, box, opts) {
  update((p) => {
    const z = p.zones.find((x) => x.id === id);
    // pos: null puts it back right after the previous zone (it follows it again).
    if (box.pos === null) delete z.pos;
    else if (box.pos) z.pos = box.pos;
    if (box.size) {
      // Its moodboard's columns keep the width they had (nothing in it grows).
      if (z.kind === 'general' && z.moodColW == null) z.moodColW = moodColWFor((z.size?.w ?? L.generalW) - L.pad * 2);
      z.size = box.size;
    }
  }, opts);
}

// Aligning or distributing a selection moves zones, windows and loose items
// together, as one undo step. moves: [{ kind: 'zone' | 'free', id, x, y }].
export function arrangeItems(moves) {
  update((p) => {
    for (const m of moves) {
      if (m.kind === 'zone') p.zones.find((z) => z.id === m.id).pos = { x: Math.round(m.x), y: Math.round(m.y) };
      else {
        const f = p.free.find((it) => it.id === m.id);
        if (f) { f.x = m.x; f.y = m.y; }
      }
    }
  });
}

// An extra general window (characters, palette, typography…).
export function addWindow(x, y) {
  let id;
  update((p) => {
    const n = p.zones.filter((z) => z.kind === 'general').length;
    const z = { id: uid(), kind: 'general', name: `Ventana ${n + 1}`, color: '#b4b2a9', momentIds: [], moodboard: [], pos: { x, y }, size: { w: 480, h: 360 } };
    id = z.id;
    p.zones.push(z);
  });
  return id;
}

export function deleteZone(id) {
  // The zone after it, if it was following this one, takes its place instead
  // of jumping back behind the zone before (e.g. in a second row).
  const before = useStore.getState().project;
  const spot = computeLayout(before).zones[id];
  update((p) => {
    const zone = p.zones.find((z) => z.id === id);
    const next = p.zones[p.zones.indexOf(zone) + 1];
    // (If this zone was itself following the one before, the next one lands in
    // the same spot by itself and keeps following.)
    if (next && !next.pos && zone.pos && spot) next.pos = { x: spot.x, y: spot.y };
    const ids = new Set([id, ...zone.moodboard.map((i) => i.id)]);
    for (const mid of zone.momentIds) {
      momentAnchorIds(p.moments[mid]).forEach((x) => ids.add(x));
      delete p.moments[mid];
    }
    unglue(p, ids);
    p.zones = p.zones.filter((z) => z.id !== id);
  });
}

// ---------- zone separators (script view) ----------

// Moves the separator in front of zone `zoneId` so it sits before the
// moment at global position `globalIndex`. It can't cross other separators.
export function moveSeparator(zoneId, globalIndex) {
  update((p) => {
    const zones = normalZones(p);
    const k = zones.findIndex((z) => z.id === zoneId);
    if (k < 1) return;
    const prev = zones[k - 1];
    const cur = zones[k];
    const start = zones.slice(0, k - 1).reduce((n, z) => n + z.momentIds.length, 0);
    const joined = [...prev.momentIds, ...cur.momentIds];
    const cut = Math.max(0, Math.min(joined.length, globalIndex - start));
    prev.momentIds = joined.slice(0, cut);
    cur.momentIds = joined.slice(cut);
  });
}

// New separator before the moment `momentId`: it and everything after it in
// its zone go to a new zone.
export function splitZoneBefore(momentId) {
  let newId;
  update((p) => {
    const zone = zoneOf(p, momentId);
    const i = zone.momentIds.indexOf(momentId);
    if (i <= 0) return;
    const z = blankZone(p, `Zona ${normalZones(p).length + 1}`);
    newId = z.id;
    z.momentIds = zone.momentIds.slice(i);
    zone.momentIds = zone.momentIds.slice(0, i);
    p.zones.splice(p.zones.indexOf(zone) + 1, 0, z);
  });
  return newId;
}

// Removes the separator in front of a zone: its moments and moodboard join
// the zone before it.
export function removeSeparator(zoneId) {
  update((p) => {
    const zones = normalZones(p);
    const k = zones.findIndex((z) => z.id === zoneId);
    if (k < 1) return;
    const prev = zones[k - 1];
    const cur = zones[k];
    prev.momentIds.push(...cur.momentIds);
    prev.moodboard.push(...cur.moodboard);
    for (const a of p.arrows) {
      if (a.from?.id === cur.id) a.from.id = prev.id;
      if (a.to?.id === cur.id) a.to.id = prev.id;
    }
    p.zones = p.zones.filter((z) => z.id !== cur.id);
  });
}

// ---------- moments ----------

const blankMoment = (text = '') => ({ id: uid(), text, sources: [], shots: [], style: null, duration: null, discards: [], palette: { 60: [], 30: [], 10: [] }, paletteLinked: true, refs: [] });

export function addMoment(zoneId, index) {
  const m = blankMoment();
  update((p) => {
    const zone = p.zones.find((z) => z.id === zoneId);
    p.moments[m.id] = m;
    zone.momentIds.splice(index ?? zone.momentIds.length, 0, m.id);
  });
  return m.id;
}

// `html` is the same text with its formatting (bold, colours…), if any.
export function setMomentText(id, text, html) {
  update((p) => {
    p.moments[id].text = text;
    if (html === undefined) delete p.moments[id].html;
    else p.moments[id].html = html;
  }, { typing: true });
}

// Manual duration in seconds; null goes back to the reading-time estimate.
// Notes: loose ideas about the moment (the description says what happens).
export function setMomentNotes(id, text, html) {
  update((p) => {
    p.moments[id].notes = text;
    p.moments[id].notesHtml = html;
  }, { typing: true });
}

// A key moment stands out on the board, in the script and in the preview.
export function toggleKey(id) {
  update((p) => { p.moments[id].key = !p.moments[id].key; });
}

export function setMomentDescription(id, text, html) {
  update((p) => {
    p.moments[id].description = text;
    p.moments[id].descHtml = html;
  }, { typing: true });
}

export function setMomentDuration(id, seconds, opts) {
  update((p) => { p.moments[id].duration = seconds; }, opts);
}

export function deleteMoment(id) {
  update((p) => {
    unglue(p, new Set(momentAnchorIds(p.moments[id])));
    const zone = zoneOf(p, id);
    zone.momentIds = zone.momentIds.filter((x) => x !== id);
    delete p.moments[id];
  });
}

// Drag and drop: puts a moment at `index` inside zone `zoneId`.
export function moveMomentTo(id, zoneId, index) {
  update((p) => {
    const from = zoneOf(p, id);
    const to = p.zones.find((z) => z.id === zoneId);
    let at = index;
    const i = from.momentIds.indexOf(id);
    if (from === to && i < at) at -= 1;
    from.momentIds.splice(i, 1);
    to.momentIds.splice(Math.max(0, Math.min(at, to.momentIds.length)), 0, id);
  });
}

// Several moments at once (in script order) to position `index` of a zone,
// counted among the moments that stay there. One undo step.
export function moveMomentsTo(ids, zoneId, index) {
  update((p) => {
    const order = p.zones.flatMap((z) => z.momentIds);
    const moving = order.filter((id) => ids.includes(id));
    const to = p.zones.find((z) => z.id === zoneId);
    const before = to.momentIds.slice(0, index).filter((id) => !moving.includes(id)).length;
    for (const z of p.zones) z.momentIds = z.momentIds.filter((id) => !moving.includes(id));
    to.momentIds.splice(before, 0, ...moving);
  });
}

// ---------- bocetos and style frame ----------

export function addShots(momentId, assets, index) {
  update((p) => {
    const m = p.moments[momentId];
    m.shots.splice(index ?? m.shots.length, 0, ...assets.map((asset) => ({ id: uid(), asset, transition: null })));
    // The transition written before there were bocetos goes to the last one.
    const last = m.shots[m.shots.length - 1];
    if (m.trOut?.transition != null && last.transition == null) {
      last.transition = m.trOut.transition;
      if (m.trOut.trHtml) last.trHtml = m.trOut.trHtml;
    }
    delete m.trOut;
  });
}

// Bocetos and style frames that are removed or replaced are kept here, so
// earlier options can be looked at and brought back.
function discard(m, src, rot) {
  if (!src) return;
  m.discards = m.discards || [];
  m.discards.unshift({ id: uid(), src, at: Date.now(), ...(rot ? { rot } : {}) });
}

// A turned picture keeps its turn when it is moved or copied somewhere else.
const withRot = (o, rot) => { if (rot) o.rot = rot; else delete o.rot; return o; };
function rotAt(p, from) {
  if (!from) return 0;
  const m = from.momentId ? p.moments[from.momentId] : null;
  if (from.kind === 'shot') return m?.shots.find((s) => s.id === from.shotId)?.rot || 0;
  if (from.kind === 'style') return m?.styleRot || 0;
  if (from.kind === 'ref') return m?.refs?.find((r) => r.id === from.refId)?.rot || 0;
  if (from.kind === 'discard') return m?.discards?.find((d) => d.id === from.discardId)?.rot || 0;
  if (from.kind === 'mood') return p.zones.find((z) => z.id === from.zoneId)?.moodboard.find((i) => i.id === from.itemId)?.rot || 0;
  if (from.kind === 'free') return p.free.find((f) => f.id === from.id)?.rot || 0;
  return 0;
}

export function setStyleFrame(momentId, asset) {
  update((p) => {
    const m = p.moments[momentId];
    if (m.style && m.style !== asset) discard(m, m.style, m.styleRot);
    if (m.style !== asset) delete m.styleRot;
    m.style = asset;
  });
}

// Turns a picture a quarter clockwise, only in that spot: its copies
// elsewhere stay as they are. `at` says where it is, like `from` below.
export function rotateMedia(at) {
  const turn = (o, key = 'rot') => {
    const r = ((o[key] || 0) + 90) % 360;
    if (r) o[key] = r;
    else delete o[key];
  };
  update((p) => {
    const m = at.momentId ? p.moments[at.momentId] : null;
    if (at.kind === 'shot' && m) {
      const s = m.shots.find((x) => x.id === at.shotId);
      if (s) turn(s);
    } else if (at.kind === 'style' && m) turn(m, 'styleRot');
    else if (at.kind === 'ref' && m) {
      const r = m.refs?.find((x) => x.id === at.refId);
      if (r) turn(r);
    } else if (at.kind === 'mood') {
      const it = p.zones.find((z) => z.id === at.zoneId)?.moodboard.find((i) => i.id === at.itemId);
      if (it) {
        turn(it);
        if (it.ar) it.ar = Math.round(1000 / it.ar) / 1000;
      }
    } else if (at.kind === 'free') {
      const f = p.free.find((x) => x.id === at.id);
      if (f) {
        // On its side it takes the other shape, around the same centre.
        turn(f);
        const cx = f.x + f.w / 2;
        const cy = f.y + f.h / 2;
        [f.w, f.h] = [f.h, f.w];
        f.x = onGrid(cx - f.w / 2);
        f.y = onGrid(cy - f.h / 2);
      }
    }
  });
}

export function restoreDiscard(momentId, discardId, as = 'boceto') {
  update((p) => {
    const m = p.moments[momentId];
    const d = m.discards.find((x) => x.id === discardId);
    if (!d) return;
    m.discards = m.discards.filter((x) => x.id !== discardId);
    if (as === 'style') {
      if (m.style) discard(m, m.style, m.styleRot);
      m.style = d.src;
      if (d.rot) m.styleRot = d.rot; else delete m.styleRot;
    } else {
      m.shots.push(withRot({ id: uid(), asset: d.src, transition: null }, d.rot));
    }
  });
}

export function removeDiscard(momentId, discardId) {
  update((p) => {
    const m = p.moments[momentId];
    m.discards = m.discards.filter((x) => x.id !== discardId);
  });
}

// Puts any media (image, video or video link) into a slot:
// "boceto:<momentId>", "style:<momentId>", "src:<momentId>" or "mood:<zoneId>".
// ---------- moving pictures around ----------
// Every picture dragged inside the app says where it comes from (`from`):
//   { kind: 'shot', momentId, shotId } · { kind: 'style', momentId }
//   { kind: 'src', momentId, sourceId } · { kind: 'discard', momentId, discardId }
//   { kind: 'mood', zoneId, itemId } · { kind: 'arrow', id, index } · { kind: 'free', id }
// Dropping it somewhere moves it there; with Alt it is copied. The same rule
// everywhere. Targets are "boceto:<id>", "style:<id>", "src:<id>",
// "discard:<id>", "mood:<zoneId>" and "arrow:<id>".

function putInto(p, target, src, rot = 0) {
  const [kind, id] = target.split(':');
  const m = p.moments[id];
  if (kind === 'boceto' && m) m.shots.push(withRot({ id: uid(), asset: src, transition: null }, rot));
  else if (kind === 'style' && m) {
    if (m.style && m.style !== src) discard(m, m.style, m.styleRot);
    m.style = src;
    if (rot) m.styleRot = rot; else delete m.styleRot;
  } else if ((kind === 'ref' || kind === 'src') && m) (m.refs ||= []).push(withRot({ id: uid(), asset: src }, rot));
  else if (kind === 'discard' && m) discard(m, src, rot);
  else if (kind === 'mood') p.zones.find((z) => z.id === id)?.moodboard.push(withRot({ id: uid(), kind: mediaKindOf(src), asset: src, text: '' }, rot));
  else if (kind === 'arrow') {
    // "arrow:<id>" makes a new picture label; "arrow:<id>:<labelId>" adds to that label.
    const a = p.arrows.find((x) => x.id === id);
    const labelId = target.split(':')[2];
    const l = labelId && a?.labels.find((x) => x.id === labelId);
    if (l) l.images.push(src);
    else if (a) (a.labels ||= []).push({ id: uid(), t: freeT(a.labels), text: '', images: [src] });
  }
}

function takeFrom(p, from) {
  if (!from) return;
  const m = from.momentId ? p.moments[from.momentId] : null;
  const gone = new Set();
  if (from.kind === 'shot' && m) {
    m.shots = m.shots.filter((s) => s.id !== from.shotId);
    gone.add(from.shotId);
  } else if (from.kind === 'style' && m) {
    m.style = null;
    delete m.styleRot;
    gone.add('sf-' + m.id);
  } else if (from.kind === 'src' && m) {
    m.sources = m.sources.filter((s) => s.id !== from.sourceId);
    gone.add(from.sourceId);
  } else if (from.kind === 'ref' && m) {
    m.refs = (m.refs || []).filter((r) => r.id !== from.refId);
  } else if (from.kind === 'discard' && m) {
    m.discards = (m.discards || []).filter((d) => d.id !== from.discardId);
  } else if (from.kind === 'mood') {
    const z = p.zones.find((x) => x.id === from.zoneId);
    if (z) z.moodboard = z.moodboard.filter((i) => i.id !== from.itemId);
    gone.add(from.itemId);
  } else if (from.kind === 'arrow') {
    const a = p.arrows.find((x) => x.id === from.id);
    const l = a?.labels.find((x) => x.id === from.labelId);
    if (l) {
      l.images.splice(from.index, 1);
      if (!l.images.length && !l.text?.trim()) a.labels = a.labels.filter((x) => x.id !== l.id);
    }
  } else if (from.kind === 'free') {
    p.free = p.free.filter((f) => f.id !== from.id);
    gone.add(from.id);
  }
  if (gone.size) unglue(p, gone);
}

const SAME = { shot: 'boceto', style: 'style', src: 'src', ref: 'ref', discard: 'discard', mood: 'mood', arrow: 'arrow' };
const sameSpot = (from, kind, id, rest) => SAME[from.kind] === kind && (from.momentId ?? from.zoneId ?? from.id) === id
  && (from.kind !== 'arrow' || from.labelId === rest);

// item = { asset, from? }. Without `from` (a new file) it is just added.
export function moveMedia(item, target, copy = false) {
  const from = item.from;
  const [kind, id, rest] = target.split(':');
  if (from && sameSpot(from, kind, id, rest)) return;
  // A boceto moved to another moment stays the same boceto (arrows included).
  if (!copy && from?.kind === 'shot' && kind === 'boceto') return moveShot(from.momentId, from.shotId, id);
  if (!copy && from?.kind === 'shot' && kind === 'style') return shotToStyleFrame(from.momentId, from.shotId, id);
  update((p) => {
    putInto(p, target, item.asset, rotAt(p, from));
    if (!copy) takeFrom(p, from);
  });
}

// Dropped on the empty board: it stays there as a loose picture.
export function mediaToBoard(item, x, y, copy = false) {
  update((p) => {
    p.free.push(gridded(withRot({ id: uid(), type: 'image', x, y, w: 240, h: 168, text: '', asset: item.asset, fitted: false }, rotAt(p, item.from))));
    if (!copy) takeFrom(p, item.from);
  });
}

export function placeMedia(target, src) {
  moveMedia({ asset: src }, target);
}

// One undo step for a whole batch import: [{ momentId, asset, kind }] in order.
export function placeShots(assignments) {
  update((p) => {
    for (const { momentId, asset, kind } of assignments) {
      const m = p.moments[momentId];
      if (!m) continue;
      if (kind === 'style') m.style = asset;
      else m.shots.push({ id: uid(), asset, transition: null });
    }
  });
}

// A transition belongs to a boceto (the cut after it). A moment without
// bocetos keeps its transition to the next moment itself ("out").
const trOf = (m, shotId) => (shotId === 'out' ? (m.trOut ||= { transition: null }) : m.shots.find((x) => x.id === shotId));

export function openTransition(momentId, shotId) {
  update((p) => { trOf(p.moments[momentId], shotId).transition = ''; });
}

export function setTransition(momentId, shotId, text, html) {
  update((p) => {
    const s = trOf(p.moments[momentId], shotId);
    s.transition = text;
    if (html === undefined) delete s.trHtml;
    else s.trHtml = html;
  }, { typing: true });
}

export function closeEmptyTransition(momentId, shotId) {
  update((p) => {
    const m = p.moments[momentId];
    const s = m && trOf(m, shotId);
    if (s && s.transition !== null && !s.transition.trim()) s.transition = null;
  }, { history: false });
}

export function deleteShot(momentId, shotId) {
  update((p) => {
    const m = p.moments[momentId];
    const shot = m.shots.find((s) => s.id === shotId);
    discard(m, shot?.asset, shot?.rot);
    m.shots = m.shots.filter((s) => s.id !== shotId);
    unglue(p, new Set([shotId]));
  });
}

export function moveShot(fromMomentId, shotId, toMomentId, toIndex) {
  update((p) => {
    const from = p.moments[fromMomentId];
    const i = from.shots.findIndex((s) => s.id === shotId);
    if (i < 0) return;
    const [shot] = from.shots.splice(i, 1);
    const to = p.moments[toMomentId];
    let at = toIndex ?? to.shots.length;
    if (from === to && i < at) at -= 1;
    to.shots.splice(at, 0, shot);
  });
}

// A boceto dropped on the style frame slot becomes the style frame.
export function shotToStyleFrame(fromMomentId, shotId, toMomentId) {
  update((p) => {
    const from = p.moments[fromMomentId];
    const shot = from.shots.find((s) => s.id === shotId);
    if (!shot) return;
    from.shots = from.shots.filter((s) => s.id !== shotId);
    const to = p.moments[toMomentId];
    if (to.style) discard(to, to.style, to.styleRot);
    to.style = shot.asset;
    if (shot.rot) to.styleRot = shot.rot;
    else delete to.styleRot;
    for (const a of p.arrows) {
      if (a.from?.id === shotId) a.from.id = 'sf-' + toMomentId;
      if (a.to?.id === shotId) a.to.id = 'sf-' + toMomentId;
    }
  });
}

// ---------- sources ----------

export function addSource(momentId, source = {}) {
  const id = uid();
  update((p) => { p.moments[momentId].sources.push({ id, text: '', url: '', ...source }); });
  return id;
}

// Moves a source to position `index` among the sources of a moment (the
// same one or another).
export function moveSource(fromMomentId, sourceId, toMomentId, index) {
  update((p) => {
    const from = p.moments[fromMomentId];
    const to = p.moments[toMomentId];
    const i = from?.sources.findIndex((s) => s.id === sourceId) ?? -1;
    if (i < 0 || !to) return;
    const [s] = from.sources.splice(i, 1);
    to.sources.splice(Math.max(0, Math.min(index, to.sources.length)), 0, s);
  });
}

export function updateSource(momentId, sourceId, patch) {
  update((p) => { Object.assign(p.moments[momentId].sources.find((s) => s.id === sourceId), patch); }, { typing: true });
}

export function deleteSource(momentId, sourceId) {
  update((p) => {
    const m = p.moments[momentId];
    m.sources = m.sources.filter((s) => s.id !== sourceId);
    unglue(p, new Set([sourceId]));
  });
}

// ---------- moodboards ----------

export function addMoodItems(zoneId, items) {
  const created = items.map((it) => ({ id: uid(), kind: 'image', asset: null, text: '', ...it }));
  update((p) => {
    p.zones.find((z) => z.id === zoneId).moodboard.push(...created);
  });
  return created.map((it) => it.id);
}

// Real proportions of an image or video, learnt when it loads.
export function setMoodRatio(zoneId, itemId, ar) {
  const it = useStore.getState().project.zones.find((z) => z.id === zoneId)?.moodboard.find((i) => i.id === itemId);
  if (!it || Math.abs((it.ar || 0) - ar) < 0.01) return;
  update((p) => { p.zones.find((z) => z.id === zoneId).moodboard.find((i) => i.id === itemId).ar = Math.round(ar * 1000) / 1000; }, { history: false });
}

export function updateMoodItem(zoneId, itemId, patch) {
  update((p) => { Object.assign(p.zones.find((z) => z.id === zoneId).moodboard.find((i) => i.id === itemId), patch); }, { typing: true });
}

// Moves an item (with its size and proportions) to another moodboard.
// There it goes to the first free place.
export function moveMoodItem(fromZoneId, itemId, toZoneId, copy = false) {
  update((p) => {
    const from = p.zones.find((x) => x.id === fromZoneId);
    const to = p.zones.find((x) => x.id === toZoneId);
    const it = from.moodboard.find((i) => i.id === itemId);
    if (!it || !to) return;
    // In the other moodboard it finds a place of its own.
    const { mcol, ...rest } = it;
    if (copy) to.moodboard.push({ ...rest, id: uid() });
    else {
      from.moodboard = from.moodboard.filter((i) => i.id !== itemId);
      to.moodboard.push(rest);
    }
  });
}

// A moodboard on the board after moving an item: its order (`ids`; items
// not listed, like colours, keep theirs after them) and the column of each
// (`cols`).
export function arrangeMood(zoneId, ids, cols) {
  update((p) => {
    const z = p.zones.find((x) => x.id === zoneId);
    const byId = new Map(z.moodboard.map((i) => [i.id, i]));
    const listed = ids.map((id) => byId.get(id)).filter(Boolean);
    z.moodboard = [...listed, ...z.moodboard.filter((i) => !ids.includes(i.id))];
    for (const it of z.moodboard) if (cols[it.id] != null) it.mcol = cols[it.id];
  });
}

// How many columns an item takes; everything keeps the column it is in
// (`cols`). One undo step for a whole drag of a corner (beginTyping first).
export function setMoodSpan(zoneId, itemId, span, cols) {
  update((p) => {
    const z = p.zones.find((x) => x.id === zoneId);
    for (const it of z.moodboard) {
      if (cols[it.id] != null) it.mcol = cols[it.id];
      if (it.id === itemId) it.mspan = span;
    }
  }, { typing: true });
}

// The strip keeps its own rows for each moodboard, on the side and on top
// apart: `order` and row heights `hs`. The board doesn't change.
export function setStripRows(zoneId, pos, patch, opts) {
  update((p) => {
    const z = p.zones.find((x) => x.id === zoneId);
    z.strip = { ...z.strip, [pos]: { ...z.strip?.[pos], ...patch } };
  }, opts);
}

// A word card's colour (and its proportions).
export function setWordShape(zoneId, itemId, patch) {
  update((p) => {
    const it = p.zones.find((z) => z.id === zoneId).moodboard.find((i) => i.id === itemId);
    if (it) Object.assign(it, patch);
  }, { typing: true });
}

export function toggleTypeScale(zoneId) {
  update((p) => {
    const z = p.zones.find((x) => x.id === zoneId);
    z.scaleOpen = !z.scaleOpen;
  });
}

// ---------- general style: colours and typography ----------

const zoneById = (p, id) => p.zones.find((z) => z.id === id);

export function addColor(zoneId, hex) {
  update((p) => { zoneById(p, zoneId).colors.push({ id: uid(), hex }); });
}

export function setColor(zoneId, colorId, hex) {
  update((p) => { zoneById(p, zoneId).colors.find((c) => c.id === colorId).hex = hex; }, { typing: true });
}

// ---------- 60 / 30 / 10: how colours are used ----------
// owner: { zone: id } (the general palette) or { moment: id } (a moment's own).
// A colour sits in one group at a time; dist values are colour ids.
const distOf = (p, owner) => {
  if (owner.zone) {
    const z = zoneById(p, owner.zone);
    return (z.dist ||= { 60: [], 30: [], 10: [] });
  }
  const m = p.moments[owner.moment];
  return (m.palette ||= { 60: [], 30: [], 10: [] });
};

export function assignColor(owner, tier, colorId) {
  update((p) => {
    const d = distOf(p, owner);
    for (const t of [60, 30, 10]) d[t] = (d[t] || []).filter((x) => x !== colorId);
    d[tier].push(colorId);
  });
}

export function unassignColor(owner, tier, colorId) {
  update((p) => {
    const d = distOf(p, owner);
    d[tier] = (d[tier] || []).filter((x) => x !== colorId);
  });
}

// A moment's palette can simply follow the general one (changing the general
// palette changes it too). Leaving it, the moment starts from a copy.
export function setPaletteLinked(momentId, linked) {
  update((p) => {
    const m = p.moments[momentId];
    m.paletteLinked = linked;
    const empty = !m.palette || [60, 30, 10].every((t) => !m.palette[t]?.length);
    const g = p.zones.find((z) => z.kind === 'general' && z.dist);
    if (!linked && empty && g) m.palette = JSON.parse(JSON.stringify(g.dist));
  });
}

// ---------- a moment's reference images ----------
export function addRefs(momentId, assets) {
  update((p) => {
    const m = p.moments[momentId];
    m.refs ||= [];
    for (const asset of assets) m.refs.push({ id: uid(), asset });
  });
}

export function deleteRef(momentId, refId) {
  update((p) => {
    const m = p.moments[momentId];
    m.refs = (m.refs || []).filter((r) => r.id !== refId);
  });
}

// Puts a colour of the palette at another place (index in the list).
export function moveColor(zoneId, colorId, index) {
  update((p) => {
    const z = zoneById(p, zoneId);
    const from = z.colors.findIndex((c) => c.id === colorId);
    if (from < 0 || from === index) return;
    const [c] = z.colors.splice(from, 1);
    z.colors.splice(Math.max(0, Math.min(z.colors.length, index)), 0, c);
  });
}

export function deleteColor(zoneId, colorId) {
  update((p) => {
    const z = zoneById(p, zoneId);
    z.colors = z.colors.filter((c) => c.id !== colorId);
    const out = (d) => { if (d) for (const t of [60, 30, 10]) d[t] = (d[t] || []).filter((x) => x !== colorId); };
    out(z.dist);
    for (const m of Object.values(p.moments)) out(m.palette);
  });
}

export function addFont(zoneId, family) {
  let id;
  update((p) => {
    const z = zoneById(p, zoneId);
    const roles = ['Títulos', 'Texto', 'Detalles'];
    id = uid();
    z.fonts.push({ id, family, role: roles[z.fonts.length] || '' });
    // The type scale starts with the first font; the second one takes the
    // reading sizes when it arrives.
    if (!z.typeScale?.length) {
      z.typeScale = [
        { id: uid(), name: 'Display', fontId: id, weight: 700, size: 48 },
        { id: uid(), name: 'Título', fontId: id, weight: 600, size: 32 },
        { id: uid(), name: 'Subtítulo', fontId: id, weight: 500, size: 22 },
        { id: uid(), name: 'Cuerpo', fontId: id, weight: 400, size: 16 },
        { id: uid(), name: 'Etiqueta', fontId: id, weight: 600, size: 12 },
      ];
    } else if (z.fonts.length === 2) {
      for (const row of z.typeScale) if (row.name === 'Cuerpo' || row.name === 'Etiqueta') row.fontId = id;
    }
  });
  return id;
}

export function updateScale(zoneId, rowId, patch) {
  update((p) => { Object.assign(zoneById(p, zoneId).typeScale.find((r) => r.id === rowId), patch); }, { typing: true });
}

export function updateFont(zoneId, fontId, patch) {
  update((p) => { Object.assign(zoneById(p, zoneId).fonts.find((f) => f.id === fontId), patch); }, { typing: true });
}

export function deleteFont(zoneId, fontId) {
  update((p) => {
    const z = zoneById(p, zoneId);
    z.fonts = z.fonts.filter((f) => f.id !== fontId);
    // Styles that used it fall back to the first remaining font.
    for (const row of z.typeScale || []) if (row.fontId === fontId) row.fontId = z.fonts[0]?.id ?? null;
    if (!z.fonts.length) z.typeScale = [];
  });
}

export function setSetting(key, value) {
  update((p) => { p.settings[key] = value; }, { history: false });
}

export function deleteMoodItem(zoneId, itemId) {
  update((p) => {
    const z = p.zones.find((x) => x.id === zoneId);
    z.moodboard = z.moodboard.filter((i) => i.id !== itemId);
    unglue(p, new Set([itemId]));
  });
}

// ---------- free canvas items ----------

// Loose items sit on the grid and measure whole grid cells, so they line up
// with each other and with the zones, also after resizing.
const onGrid = (v) => Math.round(v / GRID) * GRID;
const gridded = (f) => ({ ...f, x: onGrid(f.x), y: onGrid(f.y), w: Math.max(GRID * 2, onGrid(f.w)), h: Math.max(GRID * 2, onGrid(f.h)) });

export function addFree(item) {
  const id = uid();
  update((p) => { p.free.push(gridded({ id, w: 216, h: 144, text: '', asset: null, ...item })); });
  return id;
}

export function addFreeImages(assets, x, y) {
  update((p) => {
    assets.forEach((asset, i) => {
      p.free.push(gridded({ id: uid(), type: 'image', x: x + i * 264, y, w: 240, h: 168, text: '', asset, fitted: false }));
    });
  });
}

// Loose items are layered in the order of the list: the last one is on top.
// What you touch goes to the top (not an undo step).
export function raiseFree(ids) {
  const free = useStore.getState().project.free;
  const want = new Set(ids);
  if (free.slice(-want.size).every((f) => want.has(f.id))) return;
  update((p) => {
    p.free = [...p.free.filter((f) => !want.has(f.id)), ...p.free.filter((f) => want.has(f.id))];
  }, { history: false });
}

export function updateFree(id, patch, opts) {
  update((p) => {
    const f = p.free.find((x) => x.id === id);
    Object.assign(f, patch);
    if ('x' in patch || 'y' in patch || 'w' in patch || 'h' in patch) Object.assign(f, gridded(f));
  }, opts);
}

export function moveFreeItems(positions) {
  update((p) => {
    for (const { id, x, y } of positions) {
      const f = p.free.find((it) => it.id === id);
      if (f) { f.x = x; f.y = y; }
    }
  });
}

// Alt + drag: a copy of each loose item stays where it was (just under it),
// while the one being dragged goes wherever it is dropped.
// positions: [{ id, x, y }].
export function copyFree(positions) {
  const ids = [];
  update((p) => {
    for (const { id, x, y } of positions) {
      const i = p.free.findIndex((it) => it.id === id);
      if (i < 0) continue;
      const copy = gridded({ ...JSON.parse(JSON.stringify(p.free[i])), id: uid(), x, y });
      ids.push(copy.id);
      p.free.splice(i, 0, copy);
    }
  });
  return ids;
}

export function deleteFree(ids) {
  const set = new Set(ids);
  update((p) => {
    p.free = p.free.filter((f) => !set.has(f.id));
    unglue(p, set);
  });
}

// ---------- hand-drawn arrows ----------
// points: the smoothed stroke in canvas coordinates.
// from / to: { id, fx, fy } — the element under each end and where on it
// (fractions of its width and height), or null when the end is free.

export function addArrow(arrow) {
  const id = uid();
  update((p) => { p.arrows.push({ id, labels: [], ...arrow }); });
  return id;
}

export function updateArrow(id, patch, opts) {
  update((p) => { Object.assign(p.arrows.find((a) => a.id === id), patch); }, opts);
}

// Where a new label goes: the middle of the biggest free stretch of the line.
// Between `from` and `to` when given (a stretch between two anchors).
export function freeT(labels = [], from = 0, to = 1) {
  const a = Math.max(0.08, from);
  const b = Math.min(0.92, to);
  const ts = [a, ...labels.map((l) => l.t).filter((t) => t > a && t < b).sort((x, y) => x - y), b];
  let best = 0.5;
  let gap = -1;
  for (let i = 1; i < ts.length; i++) if (ts[i] - ts[i - 1] > gap) { gap = ts[i] - ts[i - 1]; best = (ts[i] + ts[i - 1]) / 2; }
  return Math.round(best * 1000) / 1000;
}

// Labels: text and/or pictures, each one somewhere along the arrow (t: 0–1).
export function addArrowLabel(id, label = {}) {
  const lid = uid();
  update((p) => {
    const a = p.arrows.find((x) => x.id === id);
    a.labels ||= [];
    a.labels.push({ id: lid, t: label.t ?? freeT(a.labels), text: '', images: [], ...label });
  });
  return lid;
}

export function updateArrowLabel(id, labelId, patch, opts) {
  update((p) => { Object.assign(p.arrows.find((a) => a.id === id).labels.find((l) => l.id === labelId), patch); }, opts);
}

export function removeArrowLabel(id, labelId) {
  update((p) => {
    const a = p.arrows.find((x) => x.id === id);
    a.labels = a.labels.filter((l) => l.id !== labelId);
  });
}

// Pictures into a label (or a new label of their own).
export function addArrowImages(id, assets, labelId, t) {
  if (!labelId) return addArrowLabel(id, { images: assets, ...(t != null ? { t } : {}) });
  update((p) => { p.arrows.find((a) => a.id === id).labels.find((l) => l.id === labelId).images.push(...assets); });
  return labelId;
}

export function removeArrowImage(id, labelId, index) {
  update((p) => {
    const a = p.arrows.find((x) => x.id === id);
    const l = a.labels.find((x) => x.id === labelId);
    l.images.splice(index, 1);
    // A label left with nothing goes away.
    if (!l.images.length && !l.text?.trim()) a.labels = a.labels.filter((x) => x.id !== labelId);
  });
}

export function deleteArrows(ids) {
  const set = new Set(ids);
  update((p) => { p.arrows = p.arrows.filter((a) => !set.has(a.id)); });
}

// ---------- script import ----------

export function splitScript(text, mode) {
  const parts = mode === 'lineas' ? text.split(/\r?\n/) : text.split(/\r?\n\s*\r?\n/);
  return parts.map((t) => t.trim()).filter(Boolean);
}

export function importScript({ text, mode, zoneId }) {
  const parts = splitScript(text, mode);
  update((p) => {
    let zone = p.zones.find((z) => z.id === zoneId) || normalZones(p).at(-1);
    if (!zone) {
      zone = blankZone(p, 'Zona 1');
      p.zones.push(zone);
    }
    for (const t of parts) {
      const m = blankMoment(t);
      p.moments[m.id] = m;
      zone.momentIds.push(m.id);
    }
  });
}

export function setWpm(wpm) {
  update((p) => { p.settings.wpm = wpm; });
}
