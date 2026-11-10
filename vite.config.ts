import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        scoreboard: resolve(import.meta.dirname, 'scoreboard.html'),
        how: resolve(import.meta.dirname, 'how-it-works.html'),
        study: resolve(import.meta.dirname, 'study.html'),
      },
    },
  },
  worker: { format: 'es' },
});
