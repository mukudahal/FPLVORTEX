import { difficultyColor, fillTextColor } from './fixtureForecast';
import { containRect, drawFittedText, EXPORT_FRAME } from './exportFrame';
import { imageDataUrl } from './pitchPng';
import { savePngBlob } from './savePng';

export interface PlayerCardExportData {
  name: string;
  club: string;
  position: string;
  price: string;
  ownership: string;
  stats: readonly { label: string; value: string }[];
  fixtures: readonly { label: string; rating: number | null }[];
}

async function inlineCardImage(img: HTMLImageElement): Promise<HTMLImageElement> {
  const data = await imageDataUrl(img);
  const output = new Image();
  output.src = data;
  try {
    await output.decode();
  } catch {
    throw new Error('Could not decode the player photo or club crest. Please reopen the card and try again.');
  }
  return output;
}

/** Purpose-built 4K 16:9 player card: no cropping of photos, no DOM
 * screenshot layout drift, and data strictly copied from the visible card.
 */
export async function downloadPlayerCardPng(
  card: HTMLElement,
  data: PlayerCardExportData,
  filename: string,
): Promise<void> {
  const visiblePortrait = card.querySelector<HTMLImageElement>('.vx-pcard__portrait-img');
  if (!visiblePortrait || !visiblePortrait.complete || !visiblePortrait.naturalWidth) {
    throw new Error('The player portrait is still loading. Try saving when it appears.');
  }
  const crest = card.querySelector<HTMLImageElement>('.vx-pcard__club-crest img');
  const portrait = await inlineCardImage(visiblePortrait);
  const clubCrest = crest && crest.complete && crest.naturalWidth ? await inlineCardImage(crest) : null;
  const portraitUnavailable = (visiblePortrait.currentSrc || visiblePortrait.src).startsWith('data:image/svg+xml');

  const f = EXPORT_FRAME;
  const canvas = document.createElement('canvas');
  canvas.width = f.width;
  canvas.height = f.height;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('This browser does not support PNG canvas export.');
  const ctx: CanvasRenderingContext2D = context;

  const bg = ctx.createLinearGradient(0, 0, f.width, f.height);
  bg.addColorStop(0, f.background);
  bg.addColorStop(1, '#151A30');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, f.width, f.height);
  ctx.fillStyle = f.purple;
  ctx.fillRect(112, 145, 420, 8);
  ctx.fillStyle = f.cyan;
  ctx.fillRect(540, 145, 130, 8);
  ctx.fillStyle = f.text;
  drawFittedText(ctx, 'FPL VORTEX', 112, 110, 1350, 82, 800, 62);
  ctx.fillStyle = f.muted;
  drawFittedText(ctx, 'PLAYER INTELLIGENCE  ·  4K / 16:9', 1970, 110, 1760, 46, 600, 32);

  const left = { x: 112, y: 232, width: 1410, height: 1732 };
  const right = { x: 1594, y: 232, width: 2134, height: 1732 };
  ctx.fillStyle = f.surface;
  ctx.fillRect(left.x, left.y, left.width, left.height);
  ctx.fillRect(right.x, right.y, right.width, right.height);
  ctx.strokeStyle = '#3D4564';
  ctx.lineWidth = 3;
  ctx.strokeRect(left.x, left.y, left.width, left.height);
  ctx.strokeRect(right.x, right.y, right.width, right.height);

  const glow = ctx.createRadialGradient(left.x + 710, left.y + 660, 50, left.x + 710, left.y + 660, 780);
  glow.addColorStop(0, 'rgba(139,92,246,0.32)');
  glow.addColorStop(0.6, 'rgba(34,211,238,0.10)');
  glow.addColorStop(1, 'rgba(11,13,22,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(left.x + 15, left.y + 10, left.width - 30, left.height - 30);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const imageRect = containRect(portrait.naturalWidth, portrait.naturalHeight, {
    x: left.x + 90, y: left.y + 200, width: left.width - 180, height: left.height - 370,
  });
  ctx.drawImage(portrait, imageRect.x, imageRect.y, imageRect.width, imageRect.height);
  ctx.fillStyle = f.cyan;
  drawFittedText(ctx, data.position.toUpperCase(), left.x + 80, left.y + 108, left.width - 160, 49, 700);
  ctx.fillStyle = f.text;
  drawFittedText(ctx, data.club, left.x + 80, left.y + left.height - 112, left.width - 160, 56, 700);
  if (portraitUnavailable) {
    ctx.fillStyle = f.muted;
    drawFittedText(ctx, 'Official player photo unavailable — shirt fallback displayed',
      left.x + 80, left.y + left.height - 56, left.width - 160, 26, 500, 22);
  }

  const startX = right.x + 82;
  ctx.fillStyle = f.muted;
  drawFittedText(ctx, 'PLAYER PROFILE', startX, right.y + 93, right.width - 160, 38, 700);
  ctx.fillStyle = f.text;
  drawFittedText(ctx, data.name.toUpperCase(), startX, right.y + 215, right.width - 370, 93, 800, 60);

  if (clubCrest) {
    const crestRect = containRect(clubCrest.naturalWidth, clubCrest.naturalHeight, {
      x: right.x + right.width - 248, y: right.y + 80, width: 154, height: 154,
    });
    ctx.drawImage(clubCrest, crestRect.x, crestRect.y, crestRect.width, crestRect.height);
  } else {
    ctx.fillStyle = f.muted;
    drawFittedText(ctx, data.club.slice(0, 3).toUpperCase(),
      right.x + right.width - 235, right.y + 175, 145, 50, 800);
  }

  ctx.fillStyle = f.purple;
  ctx.fillRect(startX, right.y + 257, 430, 9);
  ctx.fillStyle = f.cyan;
  ctx.fillRect(startX + 440, right.y + 257, 130, 9);
  ctx.fillStyle = f.muted;
  drawFittedText(ctx, 'PRICE', startX, right.y + 352, 320, 36, 700);
  drawFittedText(ctx, 'OWNERSHIP', startX + 720, right.y + 352, 400, 36, 700);
  ctx.fillStyle = f.text;
  drawFittedText(ctx, data.price, startX, right.y + 444, 570, 78, 800);
  drawFittedText(ctx, data.ownership, startX + 720, right.y + 444, 510, 78, 800);
  ctx.strokeStyle = '#3D4564';
  ctx.beginPath();
  ctx.moveTo(startX, right.y + 487);
  ctx.lineTo(right.x + right.width - 82, right.y + 487);
  ctx.stroke();

  ctx.fillStyle = f.muted;
  drawFittedText(ctx, 'VERIFIED PLAYER STATS / REPORTED METRICS', startX, right.y + 574,
    right.width - 170, 37, 700);
  const stats = data.stats.slice(0, 6);
  stats.forEach((stat, index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    const x = startX + col * 648;
    const y = right.y + 615 + row * 235;
    ctx.fillStyle = '#222942';
    ctx.fillRect(x, y, 600, 195);
    ctx.strokeStyle = '#3D4564';
    ctx.strokeRect(x, y, 600, 195);
    ctx.fillStyle = f.muted;
    drawFittedText(ctx, stat.label, x + 30, y + 58, 540, 31, 700, 24);
    ctx.fillStyle = f.text;
    drawFittedText(ctx, stat.value, x + 30, y + 146, 540, 80, 800, 52);
  });
  ctx.fillStyle = f.muted;
  drawFittedText(ctx, 'NEXT FIVE FIXTURES  ·  PROVISIONAL VORTEX FDR', startX,
    right.y + 1180, right.width - 170, 37, 700);
  const fixtureWidth = 360;
  data.fixtures.slice(0, 5).forEach((fixture, index) => {
    const x = startX + index * 383;
    const y = right.y + 1221;
    ctx.fillStyle = '#222942';
    ctx.fillRect(x, y, fixtureWidth, 250);
    ctx.strokeStyle = '#3D4564';
    ctx.strokeRect(x, y, fixtureWidth, 250);
    ctx.fillStyle = f.text;
    drawFittedText(ctx, fixture.label, x + 24, y + 75, fixtureWidth - 48, 49, 700, 34);
    const fdr = fixture.rating;
    const color = fdr === null ? '#596579' : difficultyColor(fdr);
    ctx.fillStyle = color;
    ctx.fillRect(x + 24, y + 121, fixtureWidth - 48, 98);
    ctx.fillStyle = fdr === null ? '#FFFFFF' : fillTextColor(color);
    drawFittedText(ctx, fdr === null ? 'N/A' : fdr.toFixed(2),
      x + 49, y + 188, fixtureWidth - 96, 65, 800, 50);
  });

  ctx.fillStyle = f.muted;
  drawFittedText(ctx, 'Data shown on the player card • Fixture ratings remain provisional pending calibration',
    112, 2085, 3550, 36, 500, 28);
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('The player PNG could not be encoded. Retry in another browser.');
  await savePngBlob(blob, filename);
}
