import { api } from './api.js';
import { linkOf, parseVideoLink } from './media.js';

export const uid = () => Math.random().toString(36).slice(2, 10);

export const ZONE_COLORS = ['#e8a87c', '#85b7eb', '#97c459', '#ed93b1', '#afa9ec', '#5dcaa5', '#e2c15a', '#b4b2a9'];

const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
export const naturalCompare = (a, b) => collator.compare(a, b);

export function wordCount(text) {
  const m = (text || '').trim().match(/\S+/g);
  return m ? m.length : 0;
}

export function estimateSeconds(text, wpm = 140) {
  return (wordCount(text) / wpm) * 60;
}

export function formatSeconds(s) {
  if (!s) return '0 s';
  if (s < 60) return `${s.toFixed(1)} s`;
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.round(s % 60)).padStart(2, '0')} min`;
}

export function isEditableTarget(el) {
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

const IMAGE_RE = /\.(png|jpe?g|webp|gif|bmp|avif)$/i;
const VIDEO_RE = /\.(mp4|m4v|webm|mov)$/i;

export const isVideoName = (name) => VIDEO_RE.test(name || '');

// Imports every image (and, with { video: true }, every video) found in a
// drop: files from disk, images dragged from a browser, or an image URL.
// Returns the stored asset names.
export async function importDroppedImages(dt, { video = false } = {}) {
  const files = [...(dt.files || [])].filter(
    (f) => f.type.startsWith('image/') || IMAGE_RE.test(f.name) || (video && (f.type.startsWith('video/') || VIDEO_RE.test(f.name))),
  );
  if (files.length) {
    const withPath = [];
    const assets = [];
    const sorted = files.sort((a, b) => naturalCompare(a.name, b.name));
    for (const f of sorted) {
      const p = api.pathForFile(f);
      if (p) withPath.push(p);
      else assets.push(await api.importBuffer(f.name, f.type, new Uint8Array(await f.arrayBuffer())));
    }
    if (withPath.length) assets.unshift(...(await api.importPaths(withPath)).map((r) => r.asset));
    return assets;
  }
  const url = (dt.getData('text/uri-list') || dt.getData('text/plain') || '').split('\n')[0].trim();
  return importFromUrl(url, { video });
}

// A pasted or dropped address: a video link stays a link (it is not
// downloaded); an image address is downloaded into the project.
export async function importFromUrl(url, { video = true } = {}) {
  if (!/^https?:\/\//i.test(url)) return [];
  if (video && parseVideoLink(url)) return [linkOf(url)];
  const asset = await api.importUrl(url);
  return asset ? [asset] : [];
}

export function hasFilesOrUrl(dt) {
  const types = [...(dt.types || [])];
  return types.includes('Files') || types.includes('text/uri-list');
}

// The slot under the pointer ("boceto:<id>", "mood:<id>"…). `skip` is a
// selector for the thing being dragged, so it doesn't find itself.
export function dropTargetAt(x, y, skip) {
  for (const el of document.elementsFromPoint(x, y)) {
    if (skip && el.closest(skip)) continue;
    const t = el.closest('[data-drop]');
    if (t) return t.dataset.drop;
  }
  return null;
}

// True when (x, y) is over the empty board: not over a zone, a window, a
// loose item or any of the panels floating over the board.
export function onEmptyBoard(x, y) {
  const el = document.elementFromPoint(x, y);
  if (!el || !el.closest('.react-flow')) return false;
  return !el.closest('.react-flow__node, .react-flow__panel, .react-flow__minimap, .toolbar-v, .isolate-bar, .arrow-label, .react-flow__node-toolbar');
}

// Internal drags carry these payload types: images (bocetos, moodboard
// tiles), whole moments and whole zones.
export const DRAG_TYPE = 'application/x-storyboard-item';

// Starts dragging a picture that lives somewhere in the project (see
// moveMedia in actions.js for what `from` looks like).
export function startMediaDrag(e, asset, from) {
  e.stopPropagation();
  e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ asset, from }));
  e.dataTransfer.effectAllowed = 'copyMove';
}

// The project picture being dragged, or null for files from outside.
export function draggedMedia(dt) {
  const raw = dt.getData(DRAG_TYPE);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
export const MOMENT_TYPE = 'application/x-storyboard-moment';
export const ZONE_TYPE = 'application/x-storyboard-zone';
