import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    // Polyfill for BigInt JSON serialization
    'globalThis.__DEV__': JSON.stringify(true),
  },
  server: {
    port: 3000,
  },
});
