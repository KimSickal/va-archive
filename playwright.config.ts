import { defineConfig } from '@playwright/test';

/** 화면 스모크 테스트. 가상의 fixture 데이터로 빌드한 사이트를 대상으로 한다. */
export default defineConfig({
  testDir: 'tests/e2e',
  use: { baseURL: 'http://localhost:4173/', trace: 'off' },
  webServer: {
    command:
      'npx tsx scripts/build-data.ts --root tests/fixtures/data && npx vite build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
