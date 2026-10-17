import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { videoExportServer } from './scripts/video-export-server';
export default defineConfig({
  plugins: [react(), videoExportServer()],
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ['**/playwright-report/**', '**/test-results/**', '**/artifacts/**', '**/maps/**'],
    },
  },
  preview: { port: 4173, strictPort: true },
});
