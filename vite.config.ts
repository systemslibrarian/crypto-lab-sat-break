import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: '/crypto-lab-sat-break/',
  build: { target: 'es2022' },
  worker: { format: 'es' },
  test: { include: ['src/**/*.test.ts'], environment: 'node', testTimeout: 120_000 },
});
