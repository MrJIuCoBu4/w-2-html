import { expect, test } from '@playwright/test'
import { getHtmlText, setHtml, squash, typeVisual, waitForHtml } from './helpers'

test.describe('app shell', () => {
  test('renders both panes with headers and zeroed stats', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Visual HTML Editor' })).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'HTML Editor', exact: true }),
    ).toBeVisible()
    await expect(page.locator('[data-testid="visual-pane"]')).toBeVisible()

    const footer = page.locator('.pane-footer.visual-footer')
    await expect(footer).toContainText('Words: 0')
    await expect(footer).toContainText('Characters: 0')
    expect(await getHtmlText(page)).toBe('')
  })

  test('stats track typing in the visual pane', async ({ page }) => {
    await page.goto('/')
    await typeVisual(page, 'Hello brave world')
    await waitForHtml(page, (h) => h.includes('Hello brave world'))

    const footer = page.locator('.pane-footer.visual-footer')
    await expect(footer).toContainText('Words: 3')
    await expect(footer).toContainText('Characters: 17')

    const codeLen = await page.locator('.code-length strong').textContent()
    // <p>Hello brave world</p> = 24 chars
    expect(Number(codeLen)).toBe(24)
  })

  test('gutter buttons cycle pane layout: both → html → both', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.pane-html')).toBeVisible()

    // First gutter button: expand HTML editor (both → html only)
    await page.locator('.pane-gutter-btn').first().click()
    const grid = page.locator('.editor-grid')
    await expect(grid).toHaveClass(/editor-grid--html\b/)

    // Same button again: html → both
    await page.locator('.pane-gutter-btn').first().click()
    await expect(grid).toHaveClass(/editor-grid--both/)

    // Second gutter button: both → visual only (HTML collapsed)
    await page.locator('.pane-gutter-btn').nth(1).click()
    await expect(grid).toHaveClass(/editor-grid--visual\b/)
  })

  test('code pane toggle in visual header collapses the HTML pane', async ({
    page,
  }) => {
    await page.goto('/')
    // Third header toggle: show/hide code editor
    const toggles = page.locator('.visual-toggle input[type="checkbox"]')
    await toggles.nth(2).click()

    // The pane collapses via width 0 (not display:none) — assert the layout
    const pane = page.locator('.pane-html')
    await expect(page.locator('.editor-grid')).toHaveClass(/editor-grid--visual\b/)
    // Collapse is animated (320ms transition): wait for the width to settle
    await expect
      .poll(async () => pane.evaluate((el) => el.getBoundingClientRect().width))
      .toBeLessThan(10)

    // Turning it back on restores the pane (via `both` focus)
    await toggles.nth(2).click()
    await expect(page.locator('.editor-grid')).toHaveClass(/editor-grid--both/)
    await expect
      .poll(async () => pane.evaluate((el) => el.getBoundingClientRect().width))
      .toBeGreaterThan(100)
  })

  test('mobile preview toggle constrains the visual stage', async ({ page }) => {
    await page.goto('/')
    const stage = page.locator('.visual-stage')
    const before = await stage.evaluate((el) => el.getBoundingClientRect().width)

    await page.locator('.visual-toggle input[type="checkbox"]').nth(1).click()
    const after = await stage.evaluate((el) => el.getBoundingClientRect().width)

    expect(after).toBeLessThan(before)
    expect(await stage.getAttribute('class')).toContain('visual-stage--mobile')
  })

  test('HTML code length reflects pane content', async ({ page }) => {
    await page.goto('/')
    await setHtml(page, '<p>ab</p>')
    await waitForHtml(page, (h) => squash(h).includes('<p>ab</p>'))
    await expect(page.locator('.code-length strong')).toHaveText('9')
  })
})
