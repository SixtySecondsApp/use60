import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@graph': path.resolve(__dirname, '../../src/components/Pipeline/RelationshipGraph'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-router': ['react-router-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'ui-animation': ['framer-motion'],
        },
      },
    },
    chunkSizeWarningLimit: 500,
    minify: 'esbuild',
    target: 'es2020',
    cssCodeSplit: true,
  },
});
