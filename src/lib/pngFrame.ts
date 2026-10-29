export const PNG_4K_WIDTH = 3840;
export const PNG_4K_HEIGHT = 2160;

/** Fit content into UHD without stretching, cropping or depending on phone pixel density. */
export function fit4kFrame(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('The content is not ready to export.');
  }
  const scale = Math.min((PNG_4K_WIDTH - 128) / width, (PNG_4K_HEIGHT - 200) / height);
  return { width: PNG_4K_WIDTH, height: PNG_4K_HEIGHT, scale,
    x: (PNG_4K_WIDTH - width * scale) / 2,
    y: (PNG_4K_HEIGHT - height * scale) / 2 };
}
