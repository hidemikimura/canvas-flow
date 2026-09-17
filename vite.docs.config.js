import { defineConfig } from 'vite';

// docs/ を静的サイトとして公開するときのフォールバック用バンドル。
// lit まで含めて 1 ファイルにまとめ、外部 CDN に一切依存せずに動くようにする。
// 出力: docs/vendor/canvas-flow.js（docs/demo.html が CDN に届かないときに読む）
export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.js',
      formats: ['es'],
      fileName: () => 'canvas-flow.js',
    },
    outDir: 'docs/vendor',
    emptyOutDir: true,
    rollupOptions: { output: { inlineDynamicImports: true } },
    sourcemap: false,
  },
});
