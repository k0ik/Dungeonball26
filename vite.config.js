import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    chunkSizeWarningLimit: 800, // three.js alone is ~600 kB minified
  },
});
