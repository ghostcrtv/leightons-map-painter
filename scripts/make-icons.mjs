/** Renders the app icon (public/icons/logo.svg) to the PNG sizes iPad and browsers need. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/icons');
const rounded = fs.readFileSync(path.join(dir, 'logo.svg'), 'utf8');
// Home Screen icons must be square: iPad and Android round the corners themselves.
const svg = rounded.replace(/<rect width="512" height="512" rx="\d+"/, '<rect width="512" height="512"');
for (const [name, size] of [['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512]]) {
  fs.writeFileSync(path.join(dir, name), new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng());
}
// App Store icon: 1024×1024, square, no transparency (Apple rounds the corners).
const store = path.resolve(dir, '../../docs/app-store');
fs.mkdirSync(store, { recursive: true });
fs.writeFileSync(path.join(store, 'icon-1024.png'), new Resvg(svg, { fitTo: { mode: 'width', value: 1024 }, background: '#121b29' }).render().asPng());
console.log('icons written');
