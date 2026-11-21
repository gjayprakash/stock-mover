import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App';
import { MovesFileProvider } from './data/useMovesFile';
import { ApprovalsProvider } from './data/approvals';
import { AuthProvider } from './features/auth/auth';

// Driver phone app (/pair, /driver): its own minimal UI, no sidebar, loaded on its own.
const DriverApp = lazy(() => import('./driver/DriverApp'));
const isDriver = /^\/(pair|driver)(\/|$)/.test(window.location.pathname);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isDriver ? (
      <Suspense fallback={null}>
        <DriverApp />
      </Suspense>
    ) : (
    <BrowserRouter>
      <AuthProvider>
        <MovesFileProvider>
          <ApprovalsProvider>
            <App />
          </ApprovalsProvider>
        </MovesFileProvider>
      </AuthProvider>
    </BrowserRouter>
    )}
  </StrictMode>,
);
