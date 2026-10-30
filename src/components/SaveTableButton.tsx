import { useState } from 'react';
import { Download } from 'lucide-react';
import { downloadTablePng, type PngTable } from '../lib/tablePng';

export function SaveTableButton({ getTables, onSave, filename, onError }: { getTables?: () => PngTable[]; onSave?: () => Promise<void>; filename: string; onError: (message: string) => void }) {
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (saving) return;
    setSaving(true);
    try { if (onSave) await onSave(); else if (getTables) await downloadTablePng(getTables(), filename); else throw new Error('Nothing to save.'); }
    catch (error) { if (!(error instanceof Error && error.name === 'AbortError')) onError(error instanceof Error ? error.message : 'Could not save PNG.'); }
    finally { setSaving(false); }
  };
  return <button type="button" className="save-table-button" onClick={() => void save()} disabled={saving} aria-label="Save as a PNG image" title="Save as a PNG image"><Download size={15} />{saving ? 'Saving…' : 'Save'}</button>;
}
