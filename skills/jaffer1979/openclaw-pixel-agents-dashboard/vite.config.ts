import react from '@vitejs/plugin-react';
import { protectDashboard } from './server/dashboardAccess';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), { name: 'dashboard-access', configureServer(server) { server.middlewares.use(protectDashboard); } }],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5061,
    proxy: {
      '/ws': {
        target: 'ws://127.0.0.1:5070',
        ws: true,
      },
      '/assets': {
        target: 'http://127.0.0.1:5070',
      },
      '/api': {
        target: 'http://127.0.0.1:5070',
      },
    },
  },
});
