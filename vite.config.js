import { defineConfig } from 'vite';

export default defineConfig({
  root: 'client',
  build: { outDir: '../dist', emptyOutDir: true, chunkSizeWarningLimit: 2000 },
  server: {
    port: 5173,
    host: true, // auch im LAN erreichbar (z. B. Handy/zweiter Laptop)
    proxy: { '/ws': { target: 'ws://localhost:3001', ws: true }, '/api': { target: 'http://localhost:3001' } },
  },
});
