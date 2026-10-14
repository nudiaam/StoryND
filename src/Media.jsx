import { isVideoName } from './util.js';
import { useEffect, useState } from 'react';
import { isLink, linkInfo, mediaUrl, thumbUrl, vimeoMeta } from './media.js';
import { useVolume } from './Sound.jsx';
import { useStore } from './store.js';

// Shows any media reference: an image, a project video, or a linked video
// (YouTube / Vimeo show their thumbnail; a direct video link plays).
// hover: videos play while the pointer is over them; auto: they always play.
// onRatio(width / height) reports the real proportions once known.
// always: plays even when videos are paused from the top bar (the preview).
// rot: quarter turns of this copy (90, 180, 270), only where it is set.
export default function Media({ src, fit = 'cover', hover = false, auto = false, always = false, sound = false, rate = 1, rot = 0, onRatio, className = '' }) {
  // sound: the video plays with its audio, at the app's volume.
  const volume = useVolume((s) => s.volume);
  const still = useStore((s) => s.ui.still) && !always;
  // Animated images (GIF, WebP…) stand still too while videos are off.
  const frozen = useFrozen(still && src && !isLink(src) && ANIMATED.test(src) ? mediaUrl(src) : null);
  if (!src) return null;
  const info = linkInfo(src);
  const style = { objectFit: fit };

  if (info && info.provider !== 'file') return <LinkThumb info={info} src={src} style={style} className={className} onRatio={onRatio} />;
  if (rot) {
    // Turned on its side, its proportions swap.
    const quarter = rot % 180 !== 0;
    return (
      <div className={`media-rot ${quarter ? 'q' : ''} ${className}`} style={{ '--rot': rot + 'deg' }}>
        <Media src={src} fit={fit} hover={hover} auto={auto} always={always} sound={sound} rate={rate} onRatio={onRatio && ((ar) => onRatio(quarter ? 1 / ar : ar))} />
      </div>
    );
  }

  if (info || isVideoName(src)) {
    return (
      <video
        className={className}
        src={mediaUrl(src)}
        style={style}
        muted={!sound}
        ref={(v) => {
          if (!v) return;
          v.volume = volume;
          v.playbackRate = rate;
          if (still && !v.paused) v.pause();
          else if (!still && auto && v.paused) v.play().catch(() => {});
        }}
        loop
        playsInline
        autoPlay={auto && !still}
        preload="metadata"
        draggable={false}
        onLoadedMetadata={(e) => {
          const v = e.currentTarget;
          if (v.videoWidth && v.videoHeight) onRatio?.(v.videoWidth / v.videoHeight);
        }}
        onMouseEnter={hover && !still ? (e) => e.currentTarget.play().catch(() => {}) : undefined}
        onMouseLeave={hover ? (e) => e.currentTarget.pause() : undefined}
      />
    );
  }

  return (
    <img
      className={className}
      src={frozen || mediaUrl(src)}
      alt=""
      draggable={false}
      style={style}
      onLoad={(e) => {
        const i = e.currentTarget;
        if (i.naturalWidth && i.naturalHeight) onRatio?.(i.naturalWidth / i.naturalHeight);
      }}
    />
  );
}

// Pictures and videos can be turned; YouTube and Vimeo links can't.
export const canRotate = (src) => !!src && !(linkInfo(src) && linkInfo(src).provider !== 'file');

// Image formats that can be animated.
const ANIMATED = /\.(gif|webp|avif|apng)$/i;

// A still frame of an animated image, made once per image and kept.
const frames = new Map();
function useFrozen(url) {
  const [frame, setFrame] = useState(() => (url && typeof frames.get(url) === 'string' ? frames.get(url) : null));
  useEffect(() => {
    if (!url) { setFrame(null); return undefined; }
    let live = true;
    if (!frames.has(url)) {
      frames.set(url, new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width = img.naturalWidth;
          c.height = img.naturalHeight;
          c.getContext('2d').drawImage(img, 0, 0);
          c.toBlob((b) => resolve(b ? URL.createObjectURL(b) : null));
        };
        img.onerror = () => resolve(null);
        img.src = url;
      }).then((u) => { frames.set(url, u); return u; }));
    }
    Promise.resolve(frames.get(url)).then((u) => { if (live) setFrame(u); });
    return () => { live = false; };
  }, [url]);
  return url ? frame : null;
}

// YouTube or Vimeo link: its thumbnail (Vimeo's is asked for once) and a badge.
function LinkThumb({ info, src, style, className, onRatio }) {
  const [vimeo, setVimeo] = useState(null);
  useEffect(() => {
    if (info.provider !== 'vimeo') return undefined;
    let live = true;
    vimeoMeta(info).then((m) => { if (live && m) setVimeo(m); });
    return () => { live = false; };
  }, [src]); // eslint-disable-line react-hooks/exhaustive-deps
  const thumb = thumbUrl(src) || vimeo?.thumb;
  return (
    <div className={`media-link ${className}`}>
      {thumb ? (
        <img src={thumb} alt="" draggable={false} style={style} onLoad={(e) => {
          // YouTube's thumbnails have black bands: its videos are 16:9. Vimeo's
          // thumbnail has the video's own shape.
          const i = e.currentTarget;
          onRatio?.(info.provider === 'youtube' || !i.naturalHeight ? 16 / 9 : i.naturalWidth / i.naturalHeight);
        }} />
      ) : (
        <div className="media-link-empty" />
      )}
      <span className="media-badge">
        <svg width="9" height="10" viewBox="0 0 9 10" aria-hidden="true"><path d="M0 0l9 5-9 5z" fill="currentColor" /></svg>
        {info.provider === 'youtube' ? 'YouTube' : 'Vimeo'}
      </span>
    </div>
  );
}
