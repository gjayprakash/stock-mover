import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// API_PORT lets two worktrees run side by side (each with its own API).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: { '/api': `http://localhost:${process.env.API_PORT ?? 3000}` } },
});
