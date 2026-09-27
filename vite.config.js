import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // three.js alone is ~500 kB minified; that's expected for this project.
    chunkSizeWarningLimit: 800,
  },
});
