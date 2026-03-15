import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
    alias: {
      '@dcc-amm/core': path.resolve(__dirname, '../amm-core/src/index.ts'),
      '@dcc-amm/sdk': path.resolve(__dirname, '../amm-sdk/src/index.ts'),
    },
  },
  server: {
    port: 2000,
  },
});
