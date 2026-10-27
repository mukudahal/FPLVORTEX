import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('FPL VORTEX crashed:', error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="fatal-error" role="alert">
        <div className="fatal-error__card">
          <span className="fatal-error__icon"><AlertTriangle size={26} /></span>
          <h1>Something interrupted the data vortex.</h1>
          <p>The application hit an unexpected error. Reloading usually restores the live dashboard.</p>
          <pre>{this.state.error.message}</pre>
          <button className="button button--primary" onClick={() => window.location.reload()} type="button">
            <RotateCcw size={16} /> Reload app
          </button>
        </div>
      </div>
    );
  }
}
