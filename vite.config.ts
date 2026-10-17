import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' makes the built site work from any folder or web address
// (Cloudflare Pages, GitHub Pages, a sub-folder, or opening a preview link).
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { target: 'es2020', chunkSizeWarningLimit: 800 },
  test: { environment: 'node' },
});
