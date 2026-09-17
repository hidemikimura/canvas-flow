import { defineConfig } from 'vite';

// `vite` / `vite preview` はデモ (index.html) を配信し、
// `vite build` はライブラリを dist/ に出力する。
export default defineConfig(({ command }) => ({
  root: '.',
  build:
    command === 'build'
      ? {
          lib: {
            entry: {
              index: 'src/index.js',
              core: 'src/core/editor.js',
              lit: 'src/lit/canvas-flow-editor.js',
            },
            formats: ['es'],
          },
          rollupOptions: { external: ['lit', /^lit\//] },
          outDir: 'dist',
          sourcemap: true,
        }
      : {},
  test: { environment: 'node' },
}));
