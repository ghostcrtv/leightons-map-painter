/**
 * Saving and opening files. Kept in one place so the future iPad app can swap in the
 * iOS Share sheet / Files app (Capacitor) without touching the rest of the game.
 */

/** Offer a text file to the player (browser: downloads it). */
export function saveTextFile(filename: string, text: string, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Read a file the player picked (from an <input type="file">). */
export function readTextFile(file: File): Promise<string> {
  return file.text();
}

/**
 * Share or save a picture. On iPad/iPhone this opens the Share sheet (Save Image, Messages…);
 * elsewhere the picture downloads. Returns how it was handled.
 */
export async function sharePicture(canvas: HTMLCanvasElement, filename: string, title: string): Promise<'shared' | 'saved' | 'cancelled'> {
  const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, 'image/png'));
  if (!blob) throw new Error('Could not make the picture');
  const file = new File([blob], filename, { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title });
      return 'shared';
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'saved';
}
