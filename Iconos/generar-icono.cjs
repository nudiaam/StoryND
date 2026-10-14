// StoryND icon, drawn as vectors (same design as the 32-grid pixel version):
// an open frame and a pencil at 45°, black on a white rounded tile. Every size
// Windows uses is drawn directly, so nothing is ever stretched.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const outDir = process.argv[process.argv.length - 1];
const SIZES = [256, 128, 96, 64, 48, 40, 32, 24, 20, 16];

app.whenReady().then(async () => {
  setTimeout(() => app.exit(1), 20000);
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await win.loadURL('data:text/html,<body></body>');
  const urls = await win.webContents.executeJavaScript(`(async () => {
    const draw = (size) => {
      const k = size / 32;
      const c = new OffscreenCanvas(size, size);
      const x = c.getContext('2d');
      x.fillStyle = '#ffffff';
      x.beginPath(); x.roundRect(0, 0, size, size, size * 0.18); x.fill();
      x.fillStyle = '#141414';
      // The frame, open at the top right where the pencil comes out. Snapped
      // to whole pixels at every size, so its lines are always sharp.
      const px = (v) => Math.round(v * k);
      const lw = Math.max(1, Math.round(2 * k));
      const [l, t, r, b] = [px(4), px(4), px(28), px(28)];
      // Drawn along the middle of the line, so straight parts stay on whole
      // pixels; the three corners are rounded.
      const h = lw / 2;
      const rad = Math.max(1, 2.6 * k);
      x.strokeStyle = '#141414'; x.lineWidth = lw; x.lineCap = 'round';
      x.beginPath();
      x.moveTo(px(14) - h, t + h);
      x.arcTo(l + h, t + h, l + h, b - h, rad);
      x.arcTo(l + h, b - h, r - h, b - h, rad);
      x.arcTo(r - h, b - h, r - h, px(18) + h, rad);
      x.lineTo(r - h, px(18) + h);
      x.stroke();
      x.scale(k, k);
      // The pencil, from its tip (bottom left) along 45°.
      x.save();
      x.translate(9.6, 22.4); x.rotate(-Math.PI / 4);
      const w = 1.85;
      // Tip and body in one piece (no seam between them), every corner rounded.
      const pts = [[0, 0, 0.45], [3.2, -w, 0.5], [18.4, -w, 0.7], [18.4, w, 0.7], [3.2, w, 0.5]];
      x.beginPath();
      const mid = (a, c) => [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2];
      const start = mid(pts[pts.length - 1], pts[0]);
      x.moveTo(start[0], start[1]);
      pts.forEach((pt, i) => { const nx = pts[(i + 1) % pts.length]; x.arcTo(pt[0], pt[1], nx[0], nx[1], pt[2]); });
      x.closePath(); x.fill();
      x.beginPath(); x.roundRect(19.8, -w, 3.4, 2 * w, 0.9); x.fill(); // eraser
      x.restore();
      return c;
    };
    const out = {};
    for (const size of ${JSON.stringify(SIZES)}) {
      const b = await draw(size).convertToBlob({ type: 'image/png' });
      out[size] = await new Promise((r) => { const f = new FileReader(); f.onload = () => r(f.result.split(',')[1]); f.readAsDataURL(b); });
    }
    return out;
  })()`);
  const pngs = SIZES.map((s) => Buffer.from(urls[s], 'base64'));
  SIZES.forEach((s, i) => fs.writeFileSync(path.join(outDir, 'icon-' + s + '.png'), pngs[i]));
  const head = Buffer.alloc(6 + 16 * SIZES.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(SIZES.length, 4);
  let offset = head.length;
  SIZES.forEach((s, i) => {
    const o = 6 + 16 * i;
    head.writeUInt8(s >= 256 ? 0 : s, o); head.writeUInt8(s >= 256 ? 0 : s, o + 1);
    head.writeUInt16LE(1, o + 4); head.writeUInt16LE(32, o + 6);
    head.writeUInt32LE(pngs[i].length, o + 8); head.writeUInt32LE(offset, o + 12);
    offset += pngs[i].length;
  });
  fs.writeFileSync(path.join(outDir, 'storyboard.ico'), Buffer.concat([head, ...pngs]));
  console.log('ok');
  app.quit();
});
