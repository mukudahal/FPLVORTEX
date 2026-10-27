import { useEffect } from 'react';
import { Check, X } from 'lucide-react';

interface ToastProps {
  message: string;
  onClose: () => void;
  tone?: 'success' | 'error' | 'info';
}

export function Toast({ message, onClose, tone = 'success' }: ToastProps) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, 3600);
    return () => window.clearTimeout(timer);
  }, [message, onClose]);
  return (
    <div className={`toast toast--${tone}`} role="status" aria-live="polite">
      <span className="toast__icon">{tone === 'error' ? <X size={15} /> : <Check size={15} />}</span>
      <span>{message}</span>
      <button type="button" onClick={onClose} aria-label="Dismiss notification"><X size={14} /></button>
    </div>
  );
}
