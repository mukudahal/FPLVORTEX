/** Browsers with a native save picker let the user choose a location. Others use Downloads. */
type Writable = { write: (blob: Blob) => Promise<void>; close: () => Promise<void> };
type Handle = { createWritable: () => Promise<Writable> };
type PickerWindow = Window & { showSaveFilePicker?: (options: object) => Promise<Handle> };

export async function choosePngDestination(filename: string): Promise<Handle | null> {
  const picker = (window as PickerWindow).showSaveFilePicker;
  if (!picker) return null;
  try {
    return await picker.call(window, { suggestedName: filename, types: [{ description: 'PNG image', accept: { 'image/png': ['.png'] } }] });
  } catch (error) {
    // Embedded previews can be forbidden from opening the picker; downloads still work.
    if (error instanceof Error && error.name === 'SecurityError') return null;
    throw error;
  }
}

export async function savePngBlob(blob: Blob, filename: string, destination: Handle | null): Promise<void> {
  if (destination) {
    const writable = await destination.createWritable();
    await writable.write(blob);
    await writable.close();
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
