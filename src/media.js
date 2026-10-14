import { assetUrl } from './api.js';
import { isVideoName } from './util.js';

// A media reference is a string: either a file in the project's assets
// folder ("abc-foto.png") or a linked video ("link:https://…").

export const isLink = (src) => typeof src === 'string' && src.startsWith('link:');
export const linkOf = (url) => 'link:' + url;

export function parseVideoLink(url) {
  if (!url) return null;
  let m = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/i);
  if (m) return { provider: 'youtube', id: m[1], url };
  // vimeo.com/123, vimeo.com/123/abcdef (unlisted), player.vimeo.com/video/123?h=abcdef
  m = url.match(/vimeo\.com\/(?:.*?\/)?(?:video\/)?(\d{5,})(?:\/([\da-f]{6,}))?/i);
  if (m) return { provider: 'vimeo', id: m[1], hash: m[2] || url.match(/[?&]h=([\da-f]+)/i)?.[1] || null, url };
  if (/^https?:\/\/\S+\.(mp4|m4v|webm|mov)(\?\S*)?$/i.test(url)) return { provider: 'file', url };
  return null;
}

export const linkInfo = (src) => (isLink(src) ? parseVideoLink(src.slice(5)) : null);

export function isVideoMedia(src) {
  return isLink(src) || isVideoName(src);
}

// Videos whose sound can be played here (YouTube and Vimeo play theirs in
// their own player, in the large view).
export const hasSound = (src) => isVideoName(src) || linkInfo(src)?.provider === 'file';

// Playable/visible URL for files and direct video links.
export function mediaUrl(src) {
  if (!src) return '';
  if (isLink(src)) return src.slice(5);
  return assetUrl(src);
}

export function thumbUrl(src) {
  const info = linkInfo(src);
  if (info?.provider === 'youtube') return `https://i.ytimg.com/vi/${info.id}/hqdefault.jpg`;
  return null;
}

// Vimeo's thumbnail comes from its public oEmbed service.
// Asked once per video and remembered on this computer.
const vimeoCache = new Map();
export function vimeoMeta(info) {
  const key = info.id + (info.hash ? '/' + info.hash : '');
  if (vimeoCache.has(key)) return vimeoCache.get(key);
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem('sb-vimeo-' + key)); } catch { /* not stored */ }
  const p = saved ? Promise.resolve(saved) : fetch(`https://vimeo.com/api/oembed.json?width=1280&url=${encodeURIComponent(`https://vimeo.com/${info.id}${info.hash ? '/' + info.hash : ''}`)}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      if (!j?.thumbnail_url) return null;
      const meta = { thumb: j.thumbnail_url.replace(/_\d+(x\d+)?(?=$|\?|\.)/, '_1280') };
      try { localStorage.setItem('sb-vimeo-' + key, JSON.stringify(meta)); } catch { /* not stored */ }
      return meta;
    })
    .catch(() => null);
  vimeoCache.set(key, p);
  return p;
}

export function embedUrl(src) {
  const info = linkInfo(src);
  if (info?.provider === 'youtube') return `https://www.youtube-nocookie.com/embed/${info.id}?autoplay=1&rel=0`;
  if (info?.provider === 'vimeo') return `https://player.vimeo.com/video/${info.id}?autoplay=1${info.hash ? '&h=' + info.hash : ''}`;
  return null;
}

export const mediaKindOf = (src) => (isVideoMedia(src) ? 'video' : 'image');
