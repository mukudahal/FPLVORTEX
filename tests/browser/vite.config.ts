import { defineConfig } from 'vite';

export default defineConfig({
  // Browser-only PNG regression harness. This config is never used for production builds.
  appType: 'mpa',
  root: process.cwd(),
  server: { host: '127.0.0.1', port: 5174, strictPort: true },
});
