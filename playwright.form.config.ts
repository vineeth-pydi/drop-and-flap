import { defineConfig, devices } from '@playwright/test';

const baseURL = 'http://127.0.0.1:5174';

export default defineConfig({
  testDir: './tests',
  testMatch: 'form-integration.spec.ts',
  outputDir: 'test-results/form-integration',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 5000 },
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/form-integration', open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    reducedMotion: 'reduce',
  },
  projects: [{
    name: 'chromium',
    use: {
      ...devices['Desktop Chrome'],
      launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
        : undefined,
    },
  }],
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5174 --strictPort --configLoader runner',
    env: { VITE_BASE_PATH: '/' },
    url: `${baseURL}/tests/harness/form.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
