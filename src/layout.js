// Layout of the board. Zones and general windows sit where they were placed
// (zone.pos) or, if never moved, one after another in a row. Inside a zone,
// moments are columns with fixed-height rows (boceto, transición, style
// frame, narración, fuente) separated by thin gaps where new moments can be
// added. Moodboards are laid out in justified rows that keep each image's
// proportions.

export const GRID = 24;
export const ZONE_MOOD_W = 520;
// Zone and window sizes are whole grid cells, so zones placed one after
// another, moved or resized always line up with each other and with the grid.
const cell = (v) => Math.ceil(v / GRID) * GRID;

export const L = {
  zoneGap: 96,
  pad: 18,
  header: 56,
  laneLabel: 92,
  gapW: 26, // space between moments, holds the dashed "add here" line
  momentMin: 288, // room for the number, duration, palette button and actions
  momentHead: 34,
  rowBoceto: 190,
  rowTr: 70,
  rowStyle: 190,
  rowNarr: 150,
  rowSrc: 120,
  colPad: 12,
  shotW: 264, // fills the moment's column (288 minus its padding)
  shotH: 165,
  shotGap: 16,
  trW: 150, // width of a transition note
  emptyZoneW: 420,
  generalW: 576,
  moodGapTop: 22,
  moodHead: 40,
  moodRowH: 112,
  moodGap: 8,
  moodEmptyH: 64,
};

// Spacing proposals (?esp=b|c|d in the address), to compare on the real
// board. Not stored anywhere.
const SPACING = {
  a: {},
  b: { zoneGap: 192, pad: 28, header: 68, laneLabel: 104, gapW: 40, colPad: 18, shotGap: 20, rowBoceto: 170, rowTr: 80, rowStyle: 170, rowNarr: 170, rowSrc: 140, moodGapTop: 40, moodHead: 48 },
  c: { zoneGap: 168, pad: 24, header: 64, laneLabel: 100, gapW: 36, colPad: 16, rowBoceto: 162, rowStyle: 162, rowNarr: 160, rowSrc: 130, moodGapTop: 36, moodHead: 44 },
  d: { zoneGap: 144, pad: 28, header: 68, laneLabel: 104, gapW: 40, colPad: 18, shotGap: 20, rowBoceto: 170, rowTr: 80, rowStyle: 170, rowNarr: 170, rowSrc: 140, moodGapTop: 40, moodHead: 48 },
};
export const ESP = (() => {
  try { return new URLSearchParams(window.location.search).get('esp'); } catch { return null; }
})();
if (SPACING[ESP]) {
  Object.assign(L, SPACING[ESP]);
  document.documentElement.dataset.esp = ESP;
}
// d: zones one under another instead of side by side. In the proposals every
// zone takes its automatic place, so they compare like for like.
const STACK = ESP === 'd';
const AUTO = !!SPACING[ESP];

// Sizes inside a zone. When a zone is made wider, its pictures and rows grow
// by the same factor k (text keeps its size).
export function dims(k = 1) {
  const r = (v) => Math.round(v * k);
  return {
    k,
    momentHead: L.momentHead,
    rowBoceto: r(L.rowBoceto),
    rowTr: L.rowTr,
    rowStyle: r(L.rowStyle),
    rowNarr: r(L.rowNarr),
    rowSrc: r(L.rowSrc),
    colPad: L.colPad * k,
    shotW: r(L.shotW),
    shotH: r(L.shotH),
    shotGap: L.shotGap * k,
    momentMin: r(L.momentMin),
  };
}
export const D1 = dims(1);
// A zone can't get narrower than its natural size: the moment's header (number,
// seconds, palette and icons, about 257 px) needs all of its 264 px.
export const K_MIN = 1;
export const K_MAX = 3;

export const rowsOf = (d) => [
  { key: 'boceto', label: 'Boceto', h: d.rowBoceto },
  { key: 'tr', label: 'Transición', h: d.rowTr },
  { key: 'style', label: 'Style frame', h: d.rowStyle },
  { key: 'narr', label: 'Narración', h: d.rowNarr },
  { key: 'src', label: 'Fuente', h: d.rowSrc },
];
export const ROWS = rowsOf(D1);

export const momentHeightOf = (d) => d.momentHead + rowsOf(d).reduce((n, row) => n + row.h, 0);
export const momentHeight = momentHeightOf(D1);

export function momentWidth(m, d = D1) {
  const n = m.shots.length;
  if (!n) return d.momentMin;
  return Math.max(d.momentMin, d.colPad * 2 + n * d.shotW + (n - 1) * d.shotGap);
}

// Centre (relative to the moment column) of the cut after boceto i. The cut
// after the last boceto is the change to the next moment, so it sits on the
// gap between columns.
export function cutX(m, i, width, d = D1) {
  if (i === m.shots.length - 1) return width + L.gapW / 2;
  return d.colPad + (i + 1) * d.shotW + i * d.shotGap + d.shotGap / 2;
}

export function itemRatio(it) {
  if (it.kind === 'word') return it.ar || 1.8;
  if (it.kind === 'color') return 1;
  return it.ar || 1.5;
}

// Justified rows: every row fills the width, every item keeps its ratio.
// The last row keeps the target height instead of stretching.
export function justify(items, width, rowH = L.moodRowH, gap = L.moodGap) {
  const rects = {};
  let y = 0;
  let row = [];
  let sum = 0;
  const flush = (h) => {
    let x = 0;
    for (const r of row) {
      const w = r.ar * h;
      rects[r.id] = { x, y, w, h };
      x += w + gap;
    }
    y += h + gap;
    row = [];
    sum = 0;
  };
  for (const it of items) {
    const ar = itemRatio(it);
    row.push({ id: it.id, ar });
    sum += ar;
    const gaps = gap * (row.length - 1);
    if (sum * rowH + gaps >= width) flush((width - gaps) / sum);
  }
  if (row.length) flush(rowH);
  return { rects, height: items.length ? y - gap : 0 };
}

// ---------- moodboards ----------
// On the board, a moodboard is columns of a fixed width (`moodColW` on the
// zone). Each item takes `mspan` columns and stays in the column it was put
// in (`mcol`), under whatever is above it there, so pictures can go one under
// another. A wider or narrower window has more or fewer columns, but nothing
// in it grows, shrinks or moves: only what no longer fits goes down, to the
// highest free place, and comes back when there is room again. Items never
// placed also go to the highest free place.
export const MOOD_MIN_COL = 72;
export const MOOD_SPAN = 2;

// The column width a moodboard starts with: as many columns as fit at ~72 px,
// filling its width.
export function moodColWFor(width, gap = L.moodGap) {
  const cols = Math.max(4, Math.floor((width + gap) / (MOOD_MIN_COL + gap)));
  return (width - gap * (cols - 1)) / cols;
}

export function moodColumns(items, width, gap, colW = moodColWFor(width, gap)) {
  const cols = Math.max(1, Math.floor((width + gap + 0.5) / (colW + gap)));
  const heights = new Array(cols).fill(0);
  const rects = {};
  const put = (it, col, span) => {
    const top = Math.max(...heights.slice(col, col + span));
    const w = colW * span + gap * (span - 1);
    const h = w / itemRatio(it);
    rects[it.id] = { x: col * (colW + gap), y: top, w, h, span, col };
    for (let c = col; c < col + span; c++) heights[c] = top + h + gap;
  };
  const spanOf = (it) => Math.max(1, Math.min(cols, it.mspan || MOOD_SPAN));
  const later = [];
  for (const it of items) {
    if (it.mcol != null && it.mcol + spanOf(it) <= cols) put(it, it.mcol, spanOf(it));
    else later.push(it);
  }
  for (const it of later) {
    const span = spanOf(it);
    let col = 0;
    let top = Infinity;
    for (let c = 0; c + span <= cols; c++) {
      const t = Math.max(...heights.slice(c, c + span));
      if (t < top - 0.5) { top = t; col = c; }
    }
    put(it, col, span);
  }
  return { rects, height: items.length ? Math.max(...heights) - gap : 0, cols, colW, gap, width };
}

// In the strip, each moodboard is rows of its own (apart from the board):
// every row has its own height (px), its items sit side by side at that
// height, and whatever doesn't fit goes down to the next row.
export const STRIP_ROW_STEP = 14;
export const STRIP_ROW_MIN = 36;
export const stripRowH = (width) => Math.round(Math.max(70, Math.min(104, width * 0.3)));

// The strip's order for a moodboard: the ones it has placed, then new ones.
export function stripOrder(items, order = []) {
  const at = new Map(order.map((id, i) => [id, i]));
  return items
    .map((it, i) => ({ it, k: at.has(it.id) ? at.get(it.id) : order.length + i }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.it);
}

export function stripRows(items, hs, width, gap) {
  const rects = {};
  let i = 0;
  let row = 0;
  let y = 0;
  while (i < items.length) {
    const h = hs[row] ?? stripRowH(width);
    let x = 0;
    let rowH = 0;
    while (i < items.length) {
      const ar = itemRatio(items[i]);
      const w = Math.min(ar * h, width);
      if (x > 0 && x + w > width + 0.5) break;
      rects[items[i].id] = { x, y, w, h: w / ar, row };
      x += w + gap;
      rowH = Math.max(rowH, w / ar);
      i += 1;
    }
    y += rowH + gap;
    row += 1;
  }
  return { rects, height: items.length ? y - gap : 0, width, gap };
}

// Main general window: Colores, Tipografía (fonts + type scale) and Fotos,
// one under the other.
// distH: the 60/30/10 bar over the colours, with its names and the space below.
export const G = { secHead: 36, swatch: 64, swatchGap: 8, distH: 70, fontCardH: 132, fontGap: 10, secGap: 18, emptyH: 34 };

export const scaleRowH = (row) => Math.max(40, Math.round(row.size * 1.3) + 14);

function generalSections(zone, w) {
  const inner = w - L.pad * 2;
  const perRow = Math.max(1, Math.floor((inner + G.swatchGap) / (G.swatch + G.swatchGap)));
  const colorRows = Math.max(1, Math.ceil(zone.colors.length / perRow));
  const colorsY = L.header + 8;
  const fontsY = colorsY + G.secHead + G.distH + (zone.colors.length ? colorRows * (G.swatch + G.swatchGap) : G.emptyH) + G.secGap;
  const n = zone.fonts.length;
  const fontsH = n ? n * G.fontCardH + (n - 1) * G.fontGap : G.emptyH;
  // The type scale is folded unless opened from the typography header.
  const scale = n && zone.scaleOpen ? zone.typeScale || [] : [];
  const scaleY = fontsY + G.secHead + fontsH + (scale.length ? G.secGap : 0);
  const scaleH = scale.length ? G.secHead + scale.reduce((s, row) => s + scaleRowH(row), 0) : 0;
  const moodY = scaleY + scaleH + G.secGap;
  return { colorsY, fontsY, scaleY, moodY, hasScale: scale.length > 0 };
}

export function computeLayout(project) {
  const zones = {};
  const moments = {};
  let cursor = { x: 0, y: 0 };
  let index = 0;

  for (const zone of project.zones) {
    let w;
    let h;
    let moodY;
    let mood;
    let contentW;
    let contentH;
    let sections = null;
    let d = D1;
    const gaps = [];
    const pos = (!AUTO && zone.pos) || cursor;

    if (zone.kind === 'general') {
      w = zone.size?.w ?? L.generalW;
      contentW = 320;
      if (zone.colors) {
        sections = generalSections(zone, w);
        moodY = sections.moodY;
      } else {
        moodY = L.header;
      }
      mood = moodColumns(zone.moodboard, w - L.pad * 2, L.moodGap, zone.moodColW);
      contentH = moodY + L.moodHead + Math.max(mood.height, L.moodEmptyH) + L.pad;
      h = Math.max(contentH, zone.size?.h ?? (zone.colors ? 0 : L.header + momentHeight + L.moodGapTop + L.moodHead + L.moodRowH + L.pad));
    } else {
      const list = zone.momentIds.map((id) => project.moments[id]).filter(Boolean);
      const startX = L.pad + L.laneLabel;
      const lanes = (dd) => list.reduce((s, m) => s + momentWidth(m, dd) + L.gapW, L.gapW);
      // A wider zone scales its contents up, a narrower one down (k = 1 is
      // the natural size). contentW is the narrowest it can get.
      const fixed = L.gapW * (list.length + 1);
      const k = zone.size?.w && list.length
        ? Math.min(K_MAX, Math.max(K_MIN, (zone.size.w - startX - L.pad - fixed) / Math.max(1, lanes(D1) - fixed)))
        : 1;
      contentW = startX + Math.max(lanes(dims(K_MIN)), L.emptyZoneW) + L.pad;
      d = list.length ? dims(k) : D1;
      let cx = startX + L.gapW;
      // gaps[i] = centre (relative to the zone) of the line that inserts at index i
      gaps.push({ index: 0, x: startX + L.gapW / 2 });
      list.forEach((m, i) => {
        const mw = momentWidth(m, d);
        moments[m.id] = {
          x: pos.x + cx, y: pos.y + L.header, rel: { x: cx, y: L.header },
          w: mw, h: momentHeightOf(d), index: index++, zoneId: zone.id, d,
        };
        cx += mw + L.gapW;
        gaps.push({ index: i + 1, x: cx - L.gapW / 2 });
      });
      w = Math.max(startX + Math.max(cx - startX, L.emptyZoneW) + L.pad, zone.size?.w || 0);
      // The zone's moodboard lives in a dropdown from its header (ZONE_MOOD_W wide).
      moodY = null;
      mood = moodColumns(zone.moodboard.filter((i) => i.kind !== 'color'), ZONE_MOOD_W - 32, L.moodGap, zone.moodColW);
      contentH = L.header + momentHeightOf(d) + L.pad;
      h = Math.max(contentH, zone.size?.h || 0);
    }

    w = cell(w);
    h = cell(h);
    zones[zone.id] = { x: pos.x, y: pos.y, w, h, moodY, gaps, mood, contentW, contentH, sections, d };
    cursor = STACK ? { x: pos.x, y: pos.y + h + L.zoneGap } : { x: pos.x + w + L.zoneGap, y: pos.y };
  }
  return { zones, moments };
}
