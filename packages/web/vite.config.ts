import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  root: __dirname,
  base: command === 'build' ? './' : '/',
  plugins: [react()],
  build: {
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
