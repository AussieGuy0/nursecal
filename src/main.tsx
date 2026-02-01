import * as Sentry from '@sentry/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ToastProvider } from './context/ToastContext';
import './index.css';

Sentry.init({
  dsn: 'https://b5d29bc60300fac1d1fa0f37287f1685@o4510803064520704.ingest.us.sentry.io/4510803064782848',
  environment: import.meta.env.PROD ? 'production' : 'development',
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>
);
