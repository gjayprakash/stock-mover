import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// API_PORT lets two worktrees run side by side (each with its own API).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // changeOrigin false: the API sees the browser's Host (localhost:5173), which matches Origin, so the
  // CSRF check passes for signed-in writes, and links the API builds (driver pair links) point at the dev server.
  server: { proxy: { '/api': { target: `http://localhost:${process.env.API_PORT ?? 3000}`, changeOrigin: false } } },
});
