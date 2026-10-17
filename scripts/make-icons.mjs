/** Renders the app icon (public/icons/logo.svg) to the PNG sizes iPad and browsers need. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/icons');
const svg = fs.readFileSync(path.join(dir, 'logo.svg'));
for (const [name, size] of [['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512]]) {
  fs.writeFileSync(path.join(dir, name), new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng());
}
console.log('icons written');
