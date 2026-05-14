import { type Page, type TestInfo } from '@playwright/test'
import { SEARCH_RESULTS, SEARCH_RESULTS_END, ROUTE_RESPONSE } from './fixtures'

/**
 * Intercept the backend so tests are deterministic and don't need a live
 * GraphHopper / Photon. Must be called before `page.goto`.
 *
 * `/api/search` alternates between two result sets so the start and end inputs
 * get distinct suggestions; `/api/route` always returns the fixture route.
 */
export async function mockApi(page: Page) {
  let searchCalls = 0
  await page.route('**/api/search**', async (route) => {
    const body = searchCalls++ % 2 === 0 ? SEARCH_RESULTS : SEARCH_RESULTS_END
    await route.fulfill({ json: body })
  })
  await page.route('**/api/route', async (route) => {
    await route.fulfill({ json: ROUTE_RESPONSE })
  })
}

/** Screenshot helper — writes .screenshots/<project>-<name>.png */
export async function shot(page: Page, testInfo: TestInfo, name: string) {
  await page.screenshot({
    path: `.screenshots/${testInfo.project.name}-${name}.png`,
    animations: 'disabled'
  })
}

/** Pick a place in a SearchInput identified by its placeholder. */
export async function pickPlace(page: Page, placeholder: RegExp | string, index = 0) {
  const input = page.getByPlaceholder(placeholder)
  await input.click()
  await input.fill('Münch')
  // SearchInput debounces 300ms before hitting /api/search. Match the <li>
  // rows only — `[class*="item"]` alone also catches itemBody/itemName children.
  const item = page.locator('[class*="dropdown"] li[class*="item"]').nth(index)
  await item.waitFor({ state: 'visible', timeout: 5000 })
  await item.click()
}

/** True when the app is in bottom-sheet (mobile/tablet-portrait) layout. */
export async function isSheetLayout(page: Page): Promise<boolean> {
  return (await page.locator('[class*="bottomSheet"]').count()) > 0
}
