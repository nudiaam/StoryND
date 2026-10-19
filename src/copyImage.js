import { api } from './api.js';

// Right click on a picture of the project: a menu to copy it, as it is seen
// (turned if it is turned). Only in the app; a browser has its own menu.
export function initImageMenu() {
  if (!api.imageMenu) return;
  document.addEventListener('contextmenu', async (e) => {
    const img = document.elementsFromPoint(e.clientX, e.clientY).find((el) => el.tagName === 'IMG');
    const src = img?.currentSrc || img?.src || '';
    if (!/^(sb|blob):/.test(src)) return;
    e.preventDefault();
    if (!(await api.imageMenu())) return;
    const bytes = await pictureBytes(src, turnOf(img));
    if (bytes) api.copyImage(bytes);
  });
}

// Quarter turns of a picture: set on its box (.media-rot) or on itself (the lightbox).
function turnOf(img) {
  const box = img.closest('.media-rot');
  const text = box ? box.style.getPropertyValue('--rot') : img.style.transform;
  const deg = parseFloat(/-?\d+(\.\d+)?/.exec(text || '')?.[0] || 0);
  return ((Math.round(deg / 90) * 90) % 360 + 360) % 360;
}

// The picture at its full size, as PNG bytes.
function pictureBytes(src, rot) {
  return new Promise((resolve) => {
    const pic = new Image();
    pic.crossOrigin = 'anonymous';
    pic.onload = () => {
      const w = pic.naturalWidth, h = pic.naturalHeight;
      const side = rot % 180 !== 0;
      const c = document.createElement('canvas');
      c.width = side ? h : w;
      c.height = side ? w : h;
      const g = c.getContext('2d');
      g.translate(c.width / 2, c.height / 2);
      g.rotate((rot * Math.PI) / 180);
      g.drawImage(pic, -w / 2, -h / 2);
      c.toBlob(async (b) => resolve(b ? new Uint8Array(await b.arrayBuffer()) : null), 'image/png');
    };
    pic.onerror = () => resolve(null);
    pic.src = src;
  });
}
