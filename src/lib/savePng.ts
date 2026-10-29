/** A PNG is prepared before asking the browser to create a file. */
type Writable = { write: (blob: Blob) => Promise<void>; close: () => Promise<void> };
type Handle = { createWritable: () => Promise<Writable> };
type PickerWindow = Window & { showSaveFilePicker?: (options: object) => Promise<Handle> };

export async function choosePngDestination(filename: string): Promise<Handle | null> {
  const picker = (window as PickerWindow).showSaveFilePicker;
  if (!picker) return null;
  try {
    return await picker.call(window, { suggestedName: filename, types: [{ description: 'PNG image', accept: { 'image/png': ['.png'] } }] });
  } catch (error) {
    if (error instanceof Error && error.name === 'SecurityError') return null;
    throw error;
  }
}

export async function validatePng(blob: Blob): Promise<void> {
  const expected = [137, 80, 78, 71, 13, 10, 26, 10];
  const bytes = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
  if (blob.size < 33 || bytes.length !== 8 || expected.some((value, index) => value !== bytes[index])) {
    throw new Error('The image could not be created. No file was saved; please try again.');
  }
}

/** The second, real tap is important: mobile browsers may block delayed automatic downloads. */
export async function savePngBlob(blob: Blob, filename: string): Promise<void> {
  await validatePng(blob);
  const url = URL.createObjectURL(blob);
  let downloadUrl: string | null = null;
  const controller = new AbortController();
  const uploadTimeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`/api/vortex/image-downloads?filename=${encodeURIComponent(filename)}`, {
      method: 'POST', headers: { 'Content-Type': 'image/png' }, body: blob, signal: controller.signal,
    });
    if (response.ok) {
      const result: unknown = await response.json();
      if (result && typeof result === 'object' && 'path' in result && typeof result.path === 'string' && /^\/api\/vortex\/image-downloads\/[a-f0-9]{48}$/.test(result.path)) downloadUrl = result.path;
    }
  } catch { /* The device can still use Share or the browser download fallback. */ }
  finally { clearTimeout(uploadTimeout); }
  const overlay = document.createElement('div');
  overlay.className = 'png-save-overlay';
  overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true'); overlay.setAttribute('aria-label', 'Save image');
  const panel = document.createElement('div'); panel.className = 'png-save-dialog';
  const heading = document.createElement('h2'); heading.textContent = 'Your image is ready';
  const description = document.createElement('p'); description.textContent = downloadUrl ? 'Choose Download, or Share to save or send the image. For downloading, the image is kept temporarily on the server for up to five minutes.' : 'The download link could not be prepared. Try Share image, or use the browser download below.';
  const preview = document.createElement('img'); preview.src = url; preview.alt = 'Preview of the image to save';
  const actions = document.createElement('div'); actions.className = 'png-save-actions';
  const download = document.createElement('a'); download.className = 'png-save-primary'; download.href = downloadUrl ?? url; download.download = filename; download.textContent = 'Download image';
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Close';
  const message = document.createElement('p'); message.className = 'png-save-message'; message.setAttribute('role', 'status');
  let finished = false;
  const cleanup = () => {
    if (finished) return; finished = true;
    document.removeEventListener('keydown', onKeyDown); overlay.remove();
    // The download manager can start reading after the click handler returns.
    window.setTimeout(() => URL.revokeObjectURL(url), 300_000);
  };
  const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') cleanup(); };
  download.addEventListener('click', () => { window.setTimeout(cleanup, 1000); });
  cancel.addEventListener('click', cleanup);
  actions.appendChild(download);
  const picker = (window as PickerWindow).showSaveFilePicker;
  if (picker) {
    const saveAs = document.createElement('button'); saveAs.type = 'button'; saveAs.textContent = 'Choose location';
    saveAs.addEventListener('click', async () => {
      try {
        const destination = await choosePngDestination(filename);
        if (!destination) { message.textContent = 'Location picker unavailable. Use Download image instead.'; return; }
        const writable = await destination.createWritable(); await writable.write(blob); await writable.close(); cleanup();
      } catch (error) { if (!(error instanceof Error && error.name === 'AbortError')) message.textContent = 'Could not save there. Try Download image.'; }
    });
    actions.appendChild(saveAs);
  }
  if (typeof File !== 'undefined' && typeof navigator.share === 'function') {
    const file = new File([blob], filename, { type: 'image/png' });
    if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
      const share = document.createElement('button'); share.type = 'button'; share.textContent = 'Share image';
      share.addEventListener('click', async () => {
        try { await navigator.share({ files: [file], title: 'FPL VORTEX' }); cleanup(); }
        catch (error) { if (!(error instanceof Error && error.name === 'AbortError')) message.textContent = 'Sharing did not work. Try Download image instead.'; }
      });
      actions.appendChild(share);
    }
  }
  actions.appendChild(cancel); panel.append(heading, description, preview, actions, message); overlay.appendChild(panel);
  document.body.appendChild(overlay); document.addEventListener('keydown', onKeyDown); download.focus();
}
