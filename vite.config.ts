import { defineConfig } from 'vite';

// base './' keeps every asset URL relative, so the export works from an
// IPFS gateway subpath, an ENS name or any static folder.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsInlineLimit: 0,
    sourcemap: false,
    target: 'es2020',
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
  },
} as never);
