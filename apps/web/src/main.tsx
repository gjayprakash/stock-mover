import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App';
import { MovesFileProvider } from './data/useMovesFile';
import { ApprovalsProvider } from './data/approvals';
import { AuthProvider } from './features/login/auth';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <MovesFileProvider>
          <ApprovalsProvider>
            <App />
          </ApprovalsProvider>
        </MovesFileProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
