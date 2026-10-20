import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { mapsLibraryPlugin } from './scripts/maps-library';
export default defineConfig({
  plugins: [react(), mapsLibraryPlugin()],
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ['**/playwright-report/**', '**/test-results/**', '**/artifacts/**', '**/maps/**'],
    },
  },
  preview: { port: 4173, strictPort: true },
});
