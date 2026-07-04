import { defineConfig, devices } from '@playwright/test';

const FRONTEND_PORT = 5174;
const BACKEND_PORT = 8003;
const FRONTEND_URL = `http://127.0.0.1:${FRONTEND_PORT}`;
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: isCI ? 1 : 0,
  reporter: isCI ? 'list' : 'html',
  use: {
    baseURL: FRONTEND_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: [
    {
      // Backend: applies migrations, seeds a deterministic E2E user/tenant/
      // account, then serves on the same port the Vite dev proxy expects.
      command:
        'python manage.py migrate --noinput && python manage.py seed_e2e && python manage.py runserver 127.0.0.1:' +
        BACKEND_PORT +
        ' --noreload',
      cwd: '../backend',
      // Any side-effect-free, unauthenticated GET that returns 200 works here —
      // this is just a readiness probe, not part of the test flow.
      url: `${BACKEND_URL}/admin/login/`,
      reuseExistingServer: !isCI,
      timeout: 120_000,
      env: {
        DJANGO_SECRET_KEY: process.env.DJANGO_SECRET_KEY || 'e2e-insecure-key-not-for-production',
        DJANGO_DEBUG: 'true',
        E2E_USER_EMAIL: process.env.E2E_USER_EMAIL || 'e2e@example.com',
        E2E_USER_PASSWORD: process.env.E2E_USER_PASSWORD || 'E2ePlaywright!123',
      },
    },
    {
      // Frontend: Vite dev server proxies /api to BACKEND_PORT (see vite.config.ts).
      command: 'npm run dev',
      url: FRONTEND_URL,
      reuseExistingServer: !isCI,
      timeout: 60_000,
    },
  ],
});
