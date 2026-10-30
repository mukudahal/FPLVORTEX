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

/** The visible download action is a real user tap, compatible with mobile restrictions.
 * Always show a working local PNG link immediately; temporary server storage is
 * only an optional enhancement for devices with unreliable blob downloads.
 */
export async function savePngBlob(blob: Blob, filename: string): Promise<void> {
  await validatePng(blob);
  const safeFilename = (/^[\w][\w .-]{0,99}\.png$/i.test(filename) ? filename : 'fpl-vortex.png');
  const url = URL.createObjectURL(blob);
  const overlay = document.createElement('div');
  overlay.className = 'png-save-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Save PNG image');
  const panel = document.createElement('div'); panel.className = 'png-save-dialog';
  const heading = document.createElement('h2'); heading.textContent = 'Your PNG is ready';
  const description = document.createElement('p');
  description.textContent = 'Choose Download PNG to save the 16:9 image. On mobile you may also use Share or open the image and save it from your browser.';
  const preview = document.createElement('img');
  preview.src = url; preview.alt = 'Preview of your exported FPL VORTEX PNG';
  const actions = document.createElement('div'); actions.className = 'png-save-actions';
  const download = document.createElement('a');
  download.className = 'png-save-primary'; download.href = url;
  download.download = safeFilename; download.textContent = 'Download PNG';
  const openImage = document.createElement('a');
  openImage.href = url; openImage.target = '_blank'; openImage.rel = 'noopener noreferrer';
  openImage.textContent = 'Open image';
  const cancel = document.createElement('button');
  cancel.type = 'button'; cancel.textContent = 'Close';
  const message = document.createElement('p');
  message.className = 'png-save-message'; message.setAttribute('role', 'status');
  let finished = false;
  const cleanup = () => {
    if (finished) return;
    finished = true;
    document.removeEventListener('keydown', onKeyDown);
    overlay.remove();
    // Download managers may read a blob URL after the click handler returns.
    window.setTimeout(() => URL.revokeObjectURL(url), 300_000);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') cleanup();
  };
  download.addEventListener('click', () => { window.setTimeout(cleanup, 1000); });
  cancel.addEventListener('click', cleanup);
  actions.append(download, openImage);

  const picker = (window as PickerWindow).showSaveFilePicker;
  if (picker) {
    const saveAs = document.createElement('button');
    saveAs.type = 'button'; saveAs.textContent = 'Choose location';
    saveAs.addEventListener('click', async () => {
      try {
        const destination = await choosePngDestination(safeFilename);
        if (!destination) { message.textContent = 'Location picker unavailable. Use Download PNG instead.'; return; }
        const writable = await destination.createWritable();
        await writable.write(blob);
        await writable.close();
        cleanup();
      } catch (error) {
        if (!(error instanceof Error && error.name === 'AbortError')) message.textContent = 'Could not save there. Use Download PNG instead.';
      }
    });
    actions.appendChild(saveAs);
  }

  if (typeof File !== 'undefined' && typeof navigator.share === 'function') {
    const file = new File([blob], safeFilename, { type: 'image/png' });
    if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
      const share = document.createElement('button');
      share.type = 'button'; share.textContent = 'Share image';
      share.addEventListener('click', async () => {
        try { await navigator.share({ files: [file], title: 'FPL VORTEX' }); cleanup(); }
        catch (error) {
          if (!(error instanceof Error && error.name === 'AbortError')) message.textContent = 'Sharing did not work. Use Download PNG instead.';
        }
      });
      actions.appendChild(share);
    }
  }
  actions.appendChild(cancel);
  panel.append(heading, description, preview, actions, message);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  document.addEventListener('keydown', onKeyDown);
  download.focus();

  // Non-blocking: a slow or failing server cannot keep the Save dialog hidden.
  // A normal blob link is already usable. Upgrade it to a temporary HTTP link
  // for mobile browsers only if the upload succeeds before the user saves.
  void (async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch('/api/vortex/image-downloads?filename=' + encodeURIComponent(safeFilename), {
        method: 'POST', headers: { 'Content-Type': 'image/png' }, body: blob, signal: controller.signal,
      });
      if (!response.ok) return;
      const result: unknown = await response.json();
      if (finished || !result || typeof result !== 'object' || !('path' in result)) return;
      if (typeof result.path === 'string' && /^\/api\/vortex\/image-downloads\/[a-f0-9]{48}$/.test(result.path)) {
        download.href = result.path;
      }
    } catch {
      // Blob download and file sharing remain available without server storage.
    } finally {
      clearTimeout(timeout);
    }
  })();
}
