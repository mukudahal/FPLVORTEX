import { savePngBlob } from './savePng';
import { containRect, drawFittedText, EXPORT_FRAME } from './exportFrame';

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
      const response = await fetch(url);
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

/** Capture the visible squad and bench as a fixed 3840x2160 (16:9) PNG.
 * The browser view stays responsive. Portraits are contained without stretching,
 * and the optional team-sheet panel is populated only from visible player names.
 */
export async function downloadPitchPng(pitch: HTMLElement, filename: string): Promise<void> {
  const { toBlob } = await import('html-to-image');
  const width = pitch.offsetWidth;
  const height = Math.max(pitch.offsetHeight, pitch.scrollHeight);
  if (!width || !height || !pitch.parentElement) {
    throw new Error('The pitch is not ready to save. Open the squad view and try again.');
  }

  const clone = pitch.cloneNode(true) as HTMLElement;
  Object.assign(clone.style, {
    position: 'fixed', left: '-20000px', top: '0', width: width + 'px',
    height: height + 'px', minWidth: width + 'px', maxWidth: width + 'px',
    margin: '0', pointerEvents: 'none',
  });
  clone.setAttribute('aria-hidden', 'true');
  // Export artwork, not the Save button or other interactive controls.
  clone.querySelectorAll('[data-pitch-capture-exclude]').forEach(control => control.remove());
  pitch.parentElement.appendChild(clone);

  try {
    const originals = [...pitch.querySelectorAll('img')];
    const copies = [...clone.querySelectorAll('img')];
    if (originals.length !== copies.length) throw new Error('Some pitch images could not be prepared.');
    const images = await Promise.all(originals.map(imageDataUrl));
    await Promise.all(copies.map((image, index) => new Promise<void>((resolve, reject) => {
      image.loading = 'eager';
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('A player image could not be loaded for the PNG.'));
      image.src = images[index];
      if (image.complete && image.naturalWidth) resolve();
    })));
    await document.fonts?.ready;

    // The clone is far off screen to avoid disturbing the live page. Override
    // its physical AND logical insets only in the serialized html-to-image SVG:
    // without this correction, browsers can generate a correctly sized blank PNG.
    const captured = await toBlob(clone, {
      width, height, pixelRatio: 2, cacheBust: false,
      style: {
        position: 'relative', left: '0', top: '0', right: 'auto', bottom: 'auto',
        inset: 'auto', insetBlock: 'auto', insetInline: 'auto', transform: 'none',
      },
    });
    if (!captured) throw new Error('Pitch capture failed. Retry after all player pictures load.');

    let source: CanvasImageSource;
    let release: () => void;
    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(captured);
      source = bitmap;
      release = () => bitmap.close();
    } else {
      const url = URL.createObjectURL(captured);
      const image = new Image();
      try {
        image.src = url;
        await image.decode();
      } catch {
        URL.revokeObjectURL(url);
        throw new Error('The browser could not decode the pitch capture.');
      }
      source = image;
      release = () => URL.revokeObjectURL(url);
    }

    try {
      const f = EXPORT_FRAME;
      const canvas = document.createElement('canvas');
      canvas.width = f.width;
      canvas.height = f.height;
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) throw new Error('The browser could not prepare the 4K PNG canvas.');
      const gradient = ctx.createLinearGradient(0, 0, f.width, f.height);
      gradient.addColorStop(0, f.background);
      gradient.addColorStop(1, '#13182B');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, f.width, f.height);

      // A single precise neon accent is enough: this is an analytics export,
      // not a decorative social poster.
      ctx.fillStyle = f.purple;
      ctx.fillRect(112, 142, 420, 9);
      ctx.fillStyle = f.cyan;
      ctx.fillRect(540, 142, 130, 9);
      ctx.fillStyle = f.text;
      drawFittedText(ctx, 'FPL VORTEX', 112, 112, 1500, 86, 800, 60);
      ctx.fillStyle = f.muted;
      drawFittedText(ctx, 'GAMEWEEK PLANNING INTELLIGENCE', 1970, 110, 1500, 46, 600, 36);

      const pitchBox = { x: 112, y: 232, width: 1710, height: 1782 };
      ctx.fillStyle = f.surface;
      ctx.fillRect(pitchBox.x, pitchBox.y, pitchBox.width, pitchBox.height);
      ctx.strokeStyle = '#343B59';
      ctx.lineWidth = 3;
      ctx.strokeRect(pitchBox.x, pitchBox.y, pitchBox.width, pitchBox.height);
      const rect = containRect(width, height, {
        x: pitchBox.x + 24, y: pitchBox.y + 24,
        width: pitchBox.width - 48, height: pitchBox.height - 48,
      });
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(source, rect.x, rect.y, rect.width, rect.height);

      const info = { x: 1930, y: 232, width: 1798, height: 1782 };
      ctx.fillStyle = f.surface;
      ctx.fillRect(info.x, info.y, info.width, info.height);
      ctx.strokeStyle = '#343B59';
      ctx.strokeRect(info.x, info.y, info.width, info.height);
      const gw = filename.match(/gw(\d+)/i)?.[1] ?? '—';
      ctx.fillStyle = f.cyan;
      drawFittedText(ctx, 'GAMEWEEK ' + gw, info.x + 72, 347, 1500, 56, 700);
      ctx.fillStyle = f.text;
      drawFittedText(ctx, 'SQUAD REVIEW', info.x + 72, 440, 1600, 82, 800, 60);
      ctx.strokeStyle = '#343B59';
      ctx.beginPath();
      ctx.moveTo(info.x + 72, 484);
      ctx.lineTo(info.x + info.width - 72, 484);
      ctx.stroke();

      const positions = ['GOALKEEPER', 'DEFENDERS', 'MIDFIELDERS', 'FORWARDS'];
      const groups = [...pitch.querySelectorAll('.vx-pitch-formation .vx-pitch-row')];
      const roster = groups.map(group => [...group.querySelectorAll('.vx-pitch-name')]
        .map(node => node.textContent?.trim() ?? '').filter(Boolean));
      const bench = [...pitch.querySelectorAll('.vx-pitch-bench .vx-pitch-name')]
        .map(node => node.textContent?.trim() ?? '').filter(Boolean);

      function printGroup(label: string, names: string[], y: number) {
        ctx.fillStyle = f.muted;
        drawFittedText(ctx, label, info.x + 72, y, 1400, 38, 700, 30);
        ctx.fillStyle = f.text;
        if (!names.length) {
          drawFittedText(ctx, 'Not shown in this view', info.x + 72, y + 66, 1600, 42, 500);
          return;
        }
        const maxWidth = info.width - 144;
        ctx.font = '600 48px Inter, Arial, sans-serif';
        const lines: string[] = [];
        let line = '';
        for (const name of names) {
          const attempt = line ? line + '  ·  ' + name : name;
          if (line && ctx.measureText(attempt).width > maxWidth) {
            lines.push(line);
            line = name;
          } else line = attempt;
        }
        if (line) lines.push(line);
        for (let i = 0; i < Math.min(2, lines.length); i++) {
          drawFittedText(ctx, lines[i], info.x + 72, y + 66 + i * 54, maxWidth, 48, 600, 34);
        }
      }

      positions.forEach((position, index) => printGroup(position, roster[index] ?? [], 565 + index * 250));
      printGroup('BENCH', bench, 1570);

      ctx.strokeStyle = '#343B59';
      ctx.beginPath();
      ctx.moveTo(info.x + 72, 1870);
      ctx.lineTo(info.x + info.width - 72, 1870);
      ctx.stroke();
      ctx.fillStyle = f.muted;
      drawFittedText(ctx, 'Source: on-screen squad view • Model forecasts are estimates',
        info.x + 72, 1932, info.width - 140, 34, 500, 28);
      ctx.fillStyle = f.muted;
      drawFittedText(ctx, 'FPL VORTEX  •  4K PNG  •  16:9',
        112, 2101, 1720, 36, 600);
      ctx.fillStyle = f.cyan;
      drawFittedText(ctx, 'Player imagery retained at natural proportions',
        info.x + 72, 2101, info.width - 144, 32, 500, 26);

      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('PNG encoding failed. Try another browser or reduce open tabs.');
      await savePngBlob(blob, filename);
    } finally {
      release();
    }
  } finally {
    clone.remove();
  }
}
