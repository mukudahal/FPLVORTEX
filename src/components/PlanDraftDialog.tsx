import { useEffect, useRef } from 'react';

/** Native HTML dialog supplies focus containment, Escape and focus restoration. */
export function PlanDraftDialog({ onCancel, onDiscard }: { onCancel: () => void; onDiscard: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} className="plan-draft-dialog" aria-labelledby="plan-draft-title" onCancel={event => { event.preventDefault(); onCancel(); }}>
    <h3 id="plan-draft-title">Unsaved Plan changes</h3>
    <p>Save your plan first, or discard these draft changes.</p>
    <div className="button-row"><button type="button" className="button button--primary" autoFocus onClick={onCancel}>Keep editing</button><button type="button" className="button button--ghost" onClick={onDiscard}>Discard draft</button></div>
  </dialog>;
}
