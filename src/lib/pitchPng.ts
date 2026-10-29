import { savePngBlob } from './savePng';
import { fit4kFrame } from './pngFrame';

/** Try the exact displayed image first, then the app's same-origin photo proxy. */
export function pitchPhotoSources(src: string, code?: string, teamCode?: string): string[] {
  const sources = [src];
  if (code && /^\d+$/.test(code)) sources.push(`/api/img/player/${encodeURIComponent(code)}${teamCode && /^\d+$/.test(teamCode) ? `?teamCode=${encodeURIComponent(teamCode)}` : ''}`);
  return sources;
}

async function imageDataUrl(img: HTMLImageElement): Promise<string> {
  const src = img.currentSrc || img.src;
  if (src.startsWith('data:')) return src;
  for (const url of pitchPhotoSources(src, img.dataset.playerCode, img.dataset.teamCode)) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
      if (!response.ok) continue;
      const image = await response.blob();
      // The server returns a generic SVG shirt when a portrait cannot be fetched.
      // Do not silently replace a visible portrait with a different picture.
      if (!image.type.startsWith('image/') || (url.startsWith('/api/img/player/') && image.type.includes('svg'))) continue;
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(image);
      });
    } catch { /* Try the next source. */ }
  }
  throw new Error(`Could not include ${img.alt || 'an image'} in the pitch. Please try again when images are available.`);
}

/** Capture the actual visible pitch, including all players and the bench, without site controls. */
export async function downloadPitchPng(pitch: HTMLElement, filename: string): Promise<void> {
  const { toBlob } = await import('html-to-image');
  const width = pitch.offsetWidth, height = pitch.offsetHeight;
  if (!width || !height || !pitch.parentElement) throw new Error('The pitch is not ready to save.');
  const clone = pitch.cloneNode(true) as HTMLElement;
  Object.assign(clone.style, { position: 'fixed', left: '-20000px', top: '0', width: `${width}px`, height: `${height}px`, minWidth: `${width}px`, maxWidth: `${width}px`, margin: '0', pointerEvents: 'none' });
  clone.setAttribute('aria-hidden', 'true');
  pitch.parentElement.appendChild(clone);
  try {
    const originals = [...pitch.querySelectorAll('img')];
    const copies = [...clone.querySelectorAll('img')];
    const images = await Promise.all(originals.map(imageDataUrl));
    await Promise.all(copies.map((image, index) => new Promise<void>((resolve, reject) => {
      image.loading = 'eager'; image.onload = () => resolve(); image.onerror = () => reject(new Error('A pitch image could not be loaded.'));
      image.src = images[index];
      if (image.complete && image.naturalWidth) resolve();
    })));
    await document.fonts?.ready;
    const frame = fit4kFrame(width, height);
    const blob = await toBlob(clone, { pixelRatio: frame.scale, cacheBust: false });
    if (!blob) throw new Error('PNG creation failed in this browser.');
    const bitmap = await createImageBitmap(blob);
    try {
      const canvas = document.createElement('canvas'); canvas.width = frame.width; canvas.height = frame.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('PNG export is unavailable.');
      ctx.fillStyle = '#070914'; ctx.fillRect(0, 0, frame.width, frame.height);
      ctx.drawImage(bitmap, frame.x, frame.y, width * frame.scale, height * frame.scale);
      const result = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!result) throw new Error('4K pitch creation failed.');
      await savePngBlob(result, filename.replace(/\.png$/i, '-4k.png'));
    } finally { bitmap.close(); }
  } finally {
    clone.remove();
  }
}
