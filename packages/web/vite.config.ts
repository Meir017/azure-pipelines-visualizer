import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const isLib = process.env.BUILD_LIB === '1';

export default defineConfig(({ command }) => ({
  root: __dirname,
  base: command === 'build' && !isLib ? './' : '/',
  plugins: [react()],
  build: isLib
    ? {
        emptyOutDir: true,
        outDir: 'dist/lib',
        lib: {
          entry: resolve(__dirname, 'src/index.ts'),
          formats: ['es'],
          fileName: 'index',
        },
        rollupOptions: {
          external: [
            'react',
            'react-dom',
            'react/jsx-runtime',
            '@xyflow/react',
            '@meirblachman/azure-pipelines-visualizer-core',
            '@dagrejs/dagre',
            '@monaco-editor/react',
            'monaco-editor',
            'highlight.js',
            'zustand',
          ],
        },
      }
    : {
        emptyOutDir: true,
        chunkSizeWarningLimit: 1500,
        rollupOptions: {
          output: {
            manualChunks: {
              'react-vendor': ['react', 'react-dom'],
              reactflow: ['@xyflow/react'],
            },
          },
        },
      },
}));
