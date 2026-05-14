import { test, expect } from '@playwright/test'
import { mockApi, shot, pickPlace, isSheetLayout } from './helpers'

// End-to-end coverage of the planner's user-facing functions. The backend is
// mocked (see helpers.ts) so runs are deterministic and don't need a live
// GraphHopper/Photon. Every test also drops a screenshot into .screenshots/
// so the same run doubles as a visual review across desktop/tablet/mobile.

test.beforeEach(async ({ page }) => {
  await mockApi(page)
})

test('loads and renders the planner', async ({ page }, testInfo) => {
  await page.goto('/')
  await expect(page.getByText('Schräglage Maps')).toBeVisible()
  // Routing presets are part of the initial shell.
  await expect(page.getByRole('button', { name: 'Kurven Plus', exact: true })).toBeVisible()
  await shot(page, testInfo, 'home')
})

test('searches places and calculates a route', async ({ page }, testInfo) => {
  await page.goto('/')
  await pickPlace(page, /Startpunkt/)
  await pickPlace(page, /Zielort/)
  // useRoute debounces 450ms then POSTs /api/route → stats block appears.
  await expect(page.locator('[class*="stats"]').first()).toBeVisible({ timeout: 8000 })
  await expect(page.locator('[class*="statValue"]').first()).toBeVisible()
  await shot(page, testInfo, 'route')
})

test('switches routing presets', async ({ page }, testInfo) => {
  await page.goto('/')
  const max = page.getByRole('button', { name: 'Kurven Max', exact: true })
  await max.click()
  await expect(max).toHaveClass(/presetActive/)
  await shot(page, testInfo, 'preset-max')

  const fastest = page.getByRole('button', { name: 'Schnellste Route', exact: true })
  await fastest.click()
  await expect(fastest).toHaveClass(/presetActive/)
})

test('toggles round-trip mode', async ({ page }, testInfo) => {
  await page.goto('/')
  // Mode switcher is a tablist (A→B / Rundkurs), not plain buttons.
  await page.getByRole('tab', { name: 'Rundkurs' }).click()
  // Round-trip block exposes a distance control.
  await expect(page.locator('[class*="roundTrip"]').first()).toBeVisible()
  await shot(page, testInfo, 'roundtrip')
})

test('collapses and expands route options', async ({ page }, testInfo) => {
  await page.goto('/')
  const head = page.locator('[class*="optionsHead"]')
  const body = page.locator('[class*="optionsBody"]')
  // Options start expanded on desktop, collapsed in the bottom-sheet layout —
  // so assert the toggle flips state rather than assuming a starting point.
  const startVisible = await body.isVisible()
  await head.click()
  await expect(body).toBeVisible({ visible: !startVisible })
  await shot(page, testInfo, 'options-toggled')
  await head.click()
  await expect(body).toBeVisible({ visible: startVisible })
})

test('opens the saved-items drawer and switches tabs', async ({ page }, testInfo) => {
  await page.goto('/')
  await page.locator('[class*="menuBtn"]').click()
  const drawer = page.getByRole('dialog')
  await expect(drawer).toBeVisible()
  await shot(page, testInfo, 'savemenu')
  // Tabs
  for (const tab of [/Presets/, /Orte/, /Routen/]) {
    await drawer.getByRole('tab', { name: tab }).click()
  }
})

test('toggles dark theme from the drawer', async ({ page }, testInfo) => {
  await page.goto('/')
  await page.locator('[class*="menuBtn"]').click()
  // Theme buttons carry an aria-label ("Dunkel"/"Hell"), so that — not the
  // ☾/☀ glyph — is the accessible name.
  await page.getByRole('button', { name: 'Dunkel' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await shot(page, testInfo, 'dark')
})

test('saves a place and finds it in the drawer', async ({ page }) => {
  await page.goto('/')
  await pickPlace(page, /Startpunkt/)
  await page.getByTitle('Ort speichern').click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.locator('input').fill('Mein Startpunkt')
  await dialog.getByRole('button', { name: /Speichern/ }).click()
  // Action-feedback toast confirms the (otherwise silent) save.
  await expect(page.getByText('Ort gespeichert')).toBeVisible()
  // ...and it shows under the Orte tab.
  await page.locator('[class*="menuBtn"]').click()
  await page.getByRole('tab', { name: /Orte/ }).click()
  await expect(page.getByText('Mein Startpunkt')).toBeVisible()
})

test('reorders waypoints by dragging the grip', async ({ page }, testInfo) => {
  await page.goto('/')
  await pickPlace(page, /Startpunkt/, 0)   // → München
  await pickPlace(page, /Zielort/, 0)      // → Bad Tölz
  // Insert a via between start and end → 3 stops, drag grips appear.
  // (button[...] — `[class*="viaBtn"]` alone also matches the viaBtnRow wrapper.)
  await page.locator('button[class*="viaBtn"]').first().click()
  await pickPlace(page, /Zwischenziel/, 1)  // → München Hbf

  const grips = page.locator('[class*="gripBtn"]')
  await expect(grips).toHaveCount(3)
  await shot(page, testInfo, 'reorder-before')

  // Drag the via (row index 1) up onto the start row (index 0). Brief settles
  // let React attach the window-level pointer listeners between steps.
  const viaGrip = grips.nth(1)
  const gb = (await viaGrip.boundingBox())!
  const row0 = (await page.locator('[class*="inputRow"]').first().boundingBox())!
  await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(120)
  await page.mouse.move(row0.x + row0.width / 2, row0.y + row0.height / 2, { steps: 12 })
  await page.waitForTimeout(120)
  await page.mouse.up()

  // The via ("München Hbf") is now the first stop.
  await expect(page.getByPlaceholder('Startpunkt')).toHaveValue('München Hbf')
})

test('prompt dialog responds to Escape and Enter', async ({ page }) => {
  await page.goto('/')
  // The "save preset" (+★) button opens a PromptDialog.
  await page.locator('[class*="savePresetBtn"]').click()
  let dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()

  await page.locator('[class*="savePresetBtn"]').click()
  dialog = page.getByRole('dialog')
  await dialog.locator('input').fill('Mein Preset')
  await page.keyboard.press('Enter')
  await expect(dialog).toBeHidden()
})

test('starts and stops navigation', async ({ page }, testInfo) => {
  await page.goto('/')
  await pickPlace(page, /Startpunkt/)
  await pickPlace(page, /Zielort/)
  await expect(page.locator('[class*="stats"]').first()).toBeVisible({ timeout: 8000 })

  await page.getByRole('button', { name: /Los/ }).click()
  // NavOverlay replaces the panel; its Exit control is the tell.
  const exit = page.getByRole('button', { name: 'Exit' })
  await expect(exit).toBeVisible()
  await shot(page, testInfo, 'nav')

  // Route-preview simulator toggle (robot-head button).
  await page.getByRole('button', { name: /Vorschau/ }).click()
  await shot(page, testInfo, 'nav-sim')

  await exit.click()
  await expect(page.getByRole('button', { name: 'Kurven Plus', exact: true })).toBeVisible()
})

test('exposes GPX export and share once a route exists', async ({ page }) => {
  await page.goto('/')
  await pickPlace(page, /Startpunkt/)
  await pickPlace(page, /Zielort/)
  await expect(page.locator('[class*="stats"]').first()).toBeVisible({ timeout: 8000 })
  await expect(page.getByTitle('Route teilen')).toBeVisible()
  await expect(page.getByTitle('Als GPX exportieren')).toBeVisible()
})

test('bottom sheet drags up and down', async ({ page }, testInfo) => {
  await page.goto('/')
  test.skip(!(await isSheetLayout(page)), 'side-panel layout — no bottom sheet')

  const handle = page.locator('[class*="dragHandle"]')
  await expect(handle).toBeVisible()
  const box = (await handle.boundingBox())!

  // Drag up (toward y=0) → sheet grows.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2, 120, { steps: 12 })
  await page.mouse.up()
  await shot(page, testInfo, 'sheet-up')

  // Drag back down → sheet shrinks.
  const box2 = (await handle.boundingBox())!
  await page.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2)
  await page.mouse.down()
  await page.mouse.move(box2.x + box2.width / 2, page.viewportSize()!.height - 160, { steps: 12 })
  await page.mouse.up()
  await shot(page, testInfo, 'sheet-down')
})
