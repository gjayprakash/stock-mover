import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App';
import { MovesFileProvider } from './data/useMovesFile';
import { ApprovalsProvider } from './data/approvals';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <MovesFileProvider>
        <ApprovalsProvider>
          <App />
        </ApprovalsProvider>
      </MovesFileProvider>
    </BrowserRouter>
  </StrictMode>,
);
