import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  // https: for YouTube thumbnails and linked videos; frames for their players.
  "img-src 'self' sb: data: blob: https:",
  "media-src 'self' sb: blob: https:",
  'frame-src https://www.youtube-nocookie.com https://player.vimeo.com',
  "connect-src 'self' sb: https://vimeo.com",
].join('; ');

// The dev server needs inline scripts for hot reload, so the strict policy is
// only added to the built app.
const cspOnBuild = {
  name: 'csp-on-build',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
};

export default defineConfig({
  plugins: [react(), cspOnBuild],
  base: './',
  // A desktop app loads from disk, so one bigger bundle is fine.
  build: { chunkSizeWarningLimit: 1500 },
  // Polling: the default file watcher misses quick successive saves on Windows.
  server: { port: 5173, strictPort: true, watch: { usePolling: true, interval: 250 } },
});
