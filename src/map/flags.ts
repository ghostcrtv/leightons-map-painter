/**
 * Flag images for the canvas map.
 *
 * Every flag is pre-rendered to PNG at build time (SVG drawing is slow and
 * unreliable on iPad Safari's canvas). All small flags come in ONE atlas image;
 * a sharper 480px version of a flag is fetched only when it is shown large.
 */

export interface AtlasIndex {
  cellW: number;
  cellH: number;
  cols: number;
  width: number;
  height: number;
  index: Record<string, number>;
}

type DrawSource = { image: CanvasImageSource; sx: number; sy: number; sw: number; sh: number };

/** Show the sharp flag once the flag is this many CSS pixels wide on screen. */
const LARGE_FLAG_THRESHOLD = 110;
const DISPUTED_COLOR = '#9aa3ad';

export class FlagLibrary {
  private large = new Map<string, HTMLImageElement | 'loading' | 'failed'>();
  private avgColors = new Map<string, string>();

  private constructor(
    private baseUrl: string,
    private atlas: HTMLImageElement,
    private meta: AtlasIndex,
    /** Called when a sharp flag finishes loading, so the map can redraw. */
    public onImageLoaded: () => void = () => {},
  ) {
    this.computeAverageColors();
  }

  static async load(baseUrl: string): Promise<FlagLibrary> {
    const [meta, atlas] = await Promise.all([
      fetch(`${baseUrl}flags/atlas.json`).then((r) => {
        if (!r.ok) throw new Error(`Could not load flags (${r.status})`);
        return r.json() as Promise<AtlasIndex>;
      }),
      loadImage(`${baseUrl}flags/atlas.png`),
    ]);
    return new FlagLibrary(baseUrl, atlas, meta);
  }

  has(code: string | null): code is string {
    return code != null && code in this.meta.index;
  }

  /** URL of the sharp flag image, for use in the user interface. */
  largeUrl(code: string): string {
    return `${this.baseUrl}flags/lg/${code}.png`;
  }

  /**
   * Average colour of a flag. Used to fill shapes too small for a visible flag,
   * which keeps the zoomed-out map fast and still looks right.
   */
  averageColor(code: string | null): string {
    if (!code) return DISPUTED_COLOR;
    return this.avgColors.get(code) ?? DISPUTED_COLOR;
  }

  /** The best image to draw for a flag that will be `screenWidth` CSS px wide. */
  source(code: string, screenWidth: number): DrawSource | null {
    if (screenWidth >= LARGE_FLAG_THRESHOLD) {
      const big = this.large.get(code);
      if (big instanceof HTMLImageElement) {
        return { image: big, sx: 0, sy: 0, sw: big.naturalWidth, sh: big.naturalHeight };
      }
      if (big === undefined) this.requestLarge(code);
    }
    const i = this.meta.index[code];
    if (i === undefined) return null;
    const { cellW, cellH, cols } = this.meta;
    // Inset by half a pixel so neighbouring flags in the atlas never bleed in.
    return {
      image: this.atlas,
      sx: (i % cols) * cellW + 0.5,
      sy: Math.floor(i / cols) * cellH + 0.5,
      sw: cellW - 1,
      sh: cellH - 1,
    };
  }

  private requestLarge(code: string) {
    this.large.set(code, 'loading');
    loadImage(this.largeUrl(code))
      .then((img) => {
        this.large.set(code, img);
        this.onImageLoaded();
      })
      .catch(() => this.large.set(code, 'failed'));
  }

  private computeAverageColors() {
    const { width, height, cellW, cellH, cols, index } = this.meta;
    const canvas = document.createElement('canvas');
    // Shrink each flag to a few pixels; averaging those is fast and good enough.
    const scale = 4 / cellW;
    canvas.width = Math.ceil(width * scale);
    canvas.height = Math.ceil(height * scale);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(this.atlas, 0, 0, canvas.width, canvas.height);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const cw = cellW * scale;
    const ch = cellH * scale;
    for (const [code, i] of Object.entries(index)) {
      const x0 = Math.round((i % cols) * cw);
      const y0 = Math.round(Math.floor(i / cols) * ch);
      let r = 0, g = 0, b = 0, n = 0;
      for (let y = y0; y < y0 + Math.floor(ch); y++) {
        for (let x = x0; x < x0 + Math.floor(cw); x++) {
          const o = (y * canvas.width + x) * 4;
          r += data[o];
          g += data[o + 1];
          b += data[o + 2];
          n++;
        }
      }
      if (n) this.avgColors.set(code, `rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)})`);
    }
  }
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load image ${src}`));
    img.src = src;
  });
}

export { DISPUTED_COLOR };
