/** FPL VORTEX image exports use a fixed 16:9 UHD frame, never the viewport ratio. */
export const EXPORT_FRAME = {
  width: 3840,
  height: 2160,
  background: '#0B0D16',
  surface: '#171A2B',
  purple: '#8B5CF6',
  cyan: '#22D3EE',
  text: '#F8FAFC',
  muted: '#A9B1C5',
} as const;

export interface Rect { x: number; y: number; width: number; height: number }

/** Scale an image uniformly inside a bounded rectangle; never stretch or crop it. */
export function containRect(
  imageWidth: number, imageHeight: number, destination: Rect,
): Rect {
  if (![imageWidth, imageHeight, destination.x, destination.y, destination.width, destination.height]
    .every(Number.isFinite) || imageWidth <= 0 || imageHeight <= 0 || destination.width <= 0 || destination.height <= 0) {
    throw new RangeError('Image and destination dimensions must be positive and finite.');
  }
  const scale = Math.min(destination.width / imageWidth, destination.height / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return {
    x: destination.x + (destination.width - width) / 2,
    y: destination.y + (destination.height - height) / 2,
    width, height,
  };
}

/** Avoid ellipsis for FPL player names unless the text actually exceeds available space. */
export function drawFittedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  fontSize: number,
  weight: number | string = 600,
  minFontSize = 28,
): void {
  let size = fontSize;
  do {
    ctx.font = `${weight} ${size}px Inter, Arial, sans-serif`;
    if (ctx.measureText(text).width <= maxWidth || size <= minFontSize) break;
    size -= 2;
  } while (size > minFontSize);
  ctx.fillText(text, x, y, maxWidth);
}
