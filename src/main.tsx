import * as Sentry from '@sentry/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './context/ToastContext';
import './index.css';

// NOTE: do not reload on `controllerchange`. Reloading there interrupts
// whatever the page is doing — including the opening /api/auth/me request —
// and the guard against repeating it only lives as long as the page, so a
// controller change on each load reloads forever. The app instead survives a
// dropped request by retrying it (see utils/api.ts).

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.PROD ? 'production' : 'development',
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ErrorBoundary>
  </StrictMode>,
);
