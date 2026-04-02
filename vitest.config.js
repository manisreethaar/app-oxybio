import { defineConfig } from 'vitest/config';
import path from 'path';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.js'],
    include: ['tests/unit/**/*.test.{js,jsx,ts,tsx}'],
    exclude: ['tests/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['app/**/*.js', 'app/**/*.jsx', 'app/**/*.ts', 'app/**/*.tsx', 'components/**/*.js', 'components/**/*.jsx', 'context/**/*.js', 'lib/**/*.js'],
      exclude: ['**/*.test.js', '**/*.test.jsx', '**/loading.js', '**/loading.jsx', '**/layout.js', '**/globals.css', 'tests/**'],
      thresholds: {
        lines: 50,
        functions: 50,
        branches: 50,
        statements: 50,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
