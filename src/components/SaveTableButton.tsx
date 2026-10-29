import { useState } from 'react';
import { Download } from 'lucide-react';
import { downloadTablePng, type PngTable } from '../lib/tablePng';

export function SaveTableButton({ getTables, filename, onError }: { getTables: () => PngTable[]; filename: string; onError: (message: string) => void }) {
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (saving) return;
    setSaving(true);
    try { await downloadTablePng(getTables(), filename); }
    catch (error) { onError(error instanceof Error ? error.message : 'Could not save PNG.'); }
    finally { setSaving(false); }
  };
  return <button type="button" className="save-table-button" onClick={() => void save()} disabled={saving} aria-label="Save complete table data as a single PNG image" title="Download complete table data as one PNG"><Download size={15} />{saving ? 'Saving…' : 'Save'}</button>;
}
