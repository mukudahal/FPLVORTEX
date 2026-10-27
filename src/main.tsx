import { createRoot } from 'react-dom/client';
import App from './App';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import '../brand-kit/design-tokens.css';
import './styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root element was not found.');

createRoot(container).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>,
);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.warn('Service worker registration failed:', error);
    });
  });
}
