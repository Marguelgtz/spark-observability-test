import { defineConfig, devices } from '@playwright/test';

const remoteBaseURL = process.env.SPARK_PERF_BASE_URL?.replace(/\/$/, '');
const storageState = process.env.SPARK_PERF_STORAGE_STATE;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: remoteBaseURL ?? 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    ...(storageState ? { storageState } : {}),
  },
  // A measurement run against a deployed Worker must neither start nor silently
  // target local Vite. Normal e2e keeps the existing local server behavior.
  ...(remoteBaseURL ? {} : {
    webServer: {
      command: 'pnpm exec vite --host 127.0.0.1 --port 4173',
      url: 'http://127.0.0.1:4173/app',
      reuseExistingServer: true,
    },
  }),
  projects: [
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } } },
    {
      name: 'mobile',
      use: {
        ...devices['iPhone 13'],
        browserName: 'chromium',
        viewport: { width: 390, height: 844 }
      }
    }
  ],
  outputDir: 'test-results/playwright'
});
