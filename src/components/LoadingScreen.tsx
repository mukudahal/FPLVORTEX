import { Brand } from './Brand';

export function LoadingScreen({ detail = 'Syncing the live player universe…' }: { detail?: string }) {
  return (
    <div className="loading-screen" role="status" aria-live="polite">
      <div className="loading-screen__vortex">
        <span />
        <span />
        <span />
        <i />
      </div>
      <Brand />
      <strong>Starting the data engine</strong>
      <p>{detail}</p>
      <div className="loading-screen__bar"><span /></div>
    </div>
  );
}
