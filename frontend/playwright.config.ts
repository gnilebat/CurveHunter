import { defineConfig } from '@playwright/test'

// E2E + visual-review config. Three viewport "projects" so every test runs at
// desktop / tablet / mobile sizes. The app's layout pivots on
// `(orientation: portrait) and (max-width: 1024px)` — so desktop gets the side
// panel, tablet-portrait and mobile get the bottom sheet.
//
//   npx playwright test            run everything
//   npx playwright test --project=mobile
//
// Screenshots land in .screenshots/<project>-<name>.png (see e2e/helpers.ts).
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,        // shared preview server; keep it calm
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  reporter: [['list']],

  // Always serve a fresh production build so screenshots reflect current code.
  webServer: {
    command: 'npm run build && npm run preview',
    port: 4173,
    reuseExistingServer: false,
    timeout: 120_000
  },

  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure'
  },

  projects: [
    {
      name: 'desktop',
      use: { viewport: { width: 1366, height: 860 } }
    },
    {
      name: 'tablet',
      // iPad-ish portrait → triggers the bottom-sheet layout, wider variant.
      use: { viewport: { width: 834, height: 1112 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
    },
    {
      name: 'mobile',
      // iPhone-13-equivalent metrics on Chromium (so only one browser engine
      // needs installing). Portrait + narrow → bottom-sheet layout.
      use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }
    }
  ]
})
