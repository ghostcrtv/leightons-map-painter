import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * Offline support: after each build, write dist/sw.js (a service worker) that saves the
 * game's core files on the device the first time it opens, so it works with no internet.
 * Big extras (sharp flags, full-detail borders) are saved the first time they're used.
 */
function offline(): Plugin {
  return {
    name: 'lmp-offline',
    apply: 'build',
    closeBundle() {
      const dist = path.resolve('dist');
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const f of fs.readdirSync(dir)) {
          const full = path.join(dir, f);
          if (fs.statSync(full).isDirectory()) walk(full);
          else files.push(path.relative(dist, full).split(path.sep).join('/'));
        }
      };
      walk(dist);
      const core = files.filter(
        (f) =>
          f !== 'sw.js' &&
          !f.startsWith('flags/lg/') &&
          f !== 'data/world-max.json' &&
          f !== 'privacy.html' &&
          f !== 'third-party-notices.txt',
      );
      const version = crypto.createHash('sha1').update(core.join('|')).update(String(Date.now())).digest('hex').slice(0, 10);
      const template = fs.readFileSync(path.resolve('scripts/sw-template.js'), 'utf8');
      const list = ['./', ...core.map((f) => `./${f}`)];
      fs.writeFileSync(path.join(dist, 'sw.js'), template.replace('__VERSION__', version).replace('__CORE__', JSON.stringify(list)));
    },
  };
}

// base: './' makes the built site work from any folder or web address
// (Cloudflare Pages, GitHub Pages, a sub-folder, or opening a preview link).
export default defineConfig({
  base: './',
  plugins: [react(), offline()],
  build: { target: 'es2020', chunkSizeWarningLimit: 800 },
  test: { environment: 'node' },
});
