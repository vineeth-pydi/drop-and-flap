import { defineConfig, devices } from '@playwright/test';

const preview = process.env.PLAYWRIGHT_PREVIEW === 'true';
const port = preview ? 4173 : 5173;
const basePath = process.env.VITE_BASE_PATH || '/';
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${port}${basePath}`;

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  testIgnore: '**/form-integration.spec.ts',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
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
    command: `node node_modules/vite/bin/vite.js ${preview ? 'preview ' : ''}--host 127.0.0.1 --port ${port} --configLoader runner`,
    env: { VITE_BASE_PATH: basePath },
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
