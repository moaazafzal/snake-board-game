import { defineConfig } from 'vite';

// Relative base so the build works on GitHub Pages under /snake-board-game/ and anywhere else.
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: { manualChunks: (id) => (id.includes('node_modules/three') ? 'three' : undefined) },
    },
  },
  test: { include: ['tests/**/*.test.js'] },
});
