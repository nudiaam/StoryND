import { estimateSeconds } from './util.js';

export const MIN_SEC = 1.5; // a moment with very little text still needs time on screen
export const EMPTY_SEC = 2; // a moment without text (visual only)

export function momentDuration(m, wpm) {
  if (m.duration) return m.duration;
  const est = estimateSeconds(m.text, wpm);
  return est ? Math.max(MIN_SEC, est) : EMPTY_SEC;
}

// Flattens the board into a playable sequence. Each moment lasts its
// duration, shared equally among its bocetos (one frame if it has none).
// mode 'boceto' shows bocetos (style frame if there are none);
// mode 'style' shows the moment's style frame (bocetos if there is none).
export function buildTimeline(project, mode) {
  const wpm = project.settings.wpm;
  const segs = [];
  const moments = [];
  const zones = [];
  let t = 0;
  let n = 0;
  for (const zone of project.zones) {
    if (zone.kind !== 'normal') continue;
    const zStart = t;
    for (const id of zone.momentIds) {
      const m = project.moments[id];
      if (!m) continue;
      n += 1;
      const dur = momentDuration(m, wpm);
      const count = Math.max(1, m.shots.length);
      const start = t;
      for (let i = 0; i < count; i++) {
        const shot = m.shots[i];
        const asset = mode === 'style' ? m.style || shot?.asset || null : shot?.asset || m.style || null;
        segs.push({
          key: shot?.id || m.id, momentId: m.id, isKey: !!m.key, zone, number: n, index: i, count,
          asset, start: t, dur: dur / count, transition: shot?.transition || null, text: m.text,
        });
        t += dur / count;
      }
      moments.push({ moment: m, zone, number: n, start, dur, manual: !!m.duration, needed: estimateSeconds(m.text, wpm) });
    }
    if (t > zStart) zones.push({ zone, start: zStart, dur: t - zStart });
  }
  return { segs, moments, zones, total: t };
}

export function segmentAt(segs, time) {
  if (!segs.length) return null;
  for (const s of segs) if (time < s.start + s.dur) return s;
  return segs[segs.length - 1];
}

export function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${m}:${sec.toFixed(1).padStart(4, '0')}`;
}
