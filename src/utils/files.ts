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
