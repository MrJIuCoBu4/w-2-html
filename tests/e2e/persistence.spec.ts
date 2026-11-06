import { expect, test } from '@playwright/test'
import { getHtmlText, setSegment, setToggle, squash, typeVisual, waitForHtml } from './helpers'

test.describe('persistence', () => {
  test('auto-save restores the document after reload', async ({ page }) => {
    await page.goto('/')
    await typeVisual(page, 'Draft survives')
    await waitForHtml(page, (h) => h.includes('Draft survives'))
    await page.waitForTimeout(700) // 400ms debounce + margin

    await page.reload()
    const html = await waitForHtml(page, (h) => h.includes('Draft survives'))
    expect(squash(html)).toBe('<p>Draft survives</p>')
    const saved = await page.evaluate(() => localStorage.getItem('w2h-autosave-html'))
    expect(saved).toContain('Draft survives')
  })

  test('auto-save off does not persist the document', async ({ page }) => {
    await page.goto('/')
    await setToggle(page, 'Auto-save HTML')
    await typeVisual(page, 'Ephemeral')
    await waitForHtml(page, (h) => h.includes('Ephemeral'))
    await page.waitForTimeout(700)

    await page.reload()
    await page.waitForTimeout(500)
    const saved = await page.evaluate(() => localStorage.getItem('w2h-autosave-html'))
    expect(saved).toBeNull()
    expect(await getHtmlText(page)).toBe('')
  })

  test('settings persist across reloads', async ({ page }) => {
    await page.goto('/')
    await setSegment(page, 'entityEncoding', 'Numeric')
    await setToggle(page, 'Compact toolbar')

    await page.reload()
    // compactToolbar=false → Italic is on the main row without More Text
    await expect(page.locator('button[title="Italic (Ctrl+I)"]')).toBeVisible()
    await expect(page.locator('[data-testid="more-text"]')).toBeHidden()

    // numeric encoding still active: symbol → &#169;, letters stay UTF-8
    await page.locator('.visual-prose').click()
    await page.keyboard.insertText('©')
    const html = await waitForHtml(page, (h) => h.includes('&#169;'))
    expect(squash(html)).toBe('<p>&#169;</p>')
  })

  test('mobile preview is a session toggle and resets on reload', async ({ page }) => {
    await page.goto('/')
    await page.locator('.visual-toggle input[type="checkbox"]').nth(1).click()
    await expect(page.locator('.visual-stage')).toHaveClass(/visual-stage--mobile/)

    await page.reload()
    await expect(page.locator('.visual-stage')).not.toHaveClass(/visual-stage--mobile/)
  })

  test('showCodePane=false restores as collapsed on reload', async ({ page }) => {
    await page.goto('/')
    await page.locator('.visual-toggle input[type="checkbox"]').nth(2).click()
    await expect(page.locator('.editor-grid')).toHaveClass(/editor-grid--visual\b/)

    await page.reload()
    await expect(page.locator('.editor-grid')).toHaveClass(/editor-grid--visual\b/)
    const settings = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('w2h-settings') ?? '{}'),
    )
    expect(settings.showCodePane).toBe(false)
  })
})
