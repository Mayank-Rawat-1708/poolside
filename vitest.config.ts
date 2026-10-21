import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['apps/*/test/**/*.test.ts'],
          exclude: ['**/*.integration.test.ts', '**/node_modules/**'],
          passWithNoTests: true,
        },
      },
      {
        test: {
          name: 'integration',
          include: ['apps/*/test/**/*.integration.test.ts'],
          testTimeout: 60_000,
          // Integration tests share one Postgres; run files serially.
          fileParallelism: false,
        },
      },
    ],
  },
});
