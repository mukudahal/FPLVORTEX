import { randomBytes } from 'node:crypto';
import express from 'express';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_IMAGE = 15 * 1024 * 1024;
const MAX_TOTAL = 50 * 1024 * 1024;
const LIFETIME_MS = 5 * 60_000;

/** Short-lived, bounded in-memory files for browsers whose download managers cannot read blob URLs. */
export function createImageDownloadRouter(lifetimeMs = LIFETIME_MS) {
  const router = express.Router();
  const images = new Map<string, { bytes: Buffer; filename: string; expires: number }>();
  let total = 0;
  const remove = (key: string) => { const old = images.get(key); if (old) { total -= old.bytes.length; images.delete(key); } };
  const clearExpired = () => { const now = Date.now(); for (const [key, value] of images) if (value.expires <= now) remove(key); };
  router.post('/', express.raw({ type: 'image/png', limit: MAX_IMAGE }), (req, res) => {
    clearExpired();
    const bytes = req.body;
    if (!Buffer.isBuffer(bytes) || bytes.length < 33 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
      res.status(400).json({ error: 'A valid PNG image is required.' }); return;
    }
    while (total + bytes.length > MAX_TOTAL && images.size) remove(images.keys().next().value!);
    const requested = typeof req.query.filename === 'string' ? req.query.filename : 'fpl-vortex.png';
    const name = requested.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 100).replace(/\.png$/i, '') || 'fpl-vortex';
    const id = randomBytes(24).toString('hex');
    images.set(id, { bytes, filename: `${name}.png`, expires: Date.now() + lifetimeMs }); total += bytes.length;
    const timer = setTimeout(() => remove(id), lifetimeMs); timer.unref();
    res.set('Cache-Control', 'no-store').status(201).json({ path: `/api/vortex/image-downloads/${id}` });
  });
  router.get('/:id', (req, res) => {
    clearExpired();
    const image = images.get(req.params.id);
    if (!image) { res.set('Cache-Control', 'no-store').status(404).json({ error: 'This download has expired. Please save again.' }); return; }
    res.set({ 'Cache-Control': 'no-store, private', 'Content-Type': 'image/png', 'Content-Length': String(image.bytes.length), 'Content-Disposition': `attachment; filename="${image.filename}"`, 'X-Content-Type-Options': 'nosniff' });
    res.send(image.bytes);
  });
  return router;
}
