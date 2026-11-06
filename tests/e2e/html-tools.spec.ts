import { expect, test } from '@playwright/test'
import { getHtmlText, setHtml, squash, waitForHtml } from './helpers'

test.describe('HTML tools', () => {
  test('prettify formats minified markup with indentation', async ({ page }) => {
    await page.goto('/')
    await setHtml(page, '<p>a</p><ul><li>x</li><li>y</li></ul>')
    await waitForHtml(page, (h) => h.includes('<li>x</li>'))

    await page.locator('button[title="Prettify HTML code"]').click()
    const html = await waitForHtml(page, (h) => h.includes('\n'))
    expect(html.split('\n').length).toBeGreaterThan(3)
    expect(html).toContain('  <li>x</li>')
    expect(html).toContain('  <li>y</li>')
  })

  test('compress collapses the document to one line', async ({ page }) => {
    await page.goto('/')
    await setHtml(page, '<p>hello</p>\n<p>world</p>')
    await waitForHtml(page, (h) => h.includes('world'))

    await page.locator('button[title="Compress HTML code"]').click()
    const html = await waitForHtml(page, (h) => !h.includes('\n'))
    expect(html).toBe('<p>hello</p><p>world</p>')
  })

  test('undo reverts prettify and redo restores it', async ({ page }) => {
    await page.goto('/')
    const minified = '<p>a</p><ul><li>x</li></ul>'
    await setHtml(page, minified)
    await waitForHtml(page, (h) => h.includes('<li>x</li>'))
    // Let the HTML typing debounce commit the pre-prettify state.
    await page.waitForTimeout(700)

    await page.locator('button[title="Prettify HTML code"]').click()
    const pretty = await waitForHtml(page, (h) => h.includes('\n'))
    expect(pretty).toContain('  <li>x</li>')

    await page.locator('.html-tools button[title="Undo"]').click()
    const back = await waitForHtml(page, (h) => !h.includes('\n'))
    expect(back).toBe(minified)

    await page.locator('.html-tools button[title="Redo"]').click()
    const again = await waitForHtml(page, (h) => h.includes('\n'))
    expect(again).toContain('  <li>x</li>')
  })

  test('HTML-pane typing has debounced shared history', async ({ page }) => {
    await page.goto('/')
    await setHtml(page, '<p>a</p>')
    await waitForHtml(page, (h) => h.includes('<p>a</p>'))
    await page.waitForTimeout(700) // commit snapshot before typing

    const cm = page.locator('.cm-content')
    await cm.click()
    await page.keyboard.press('Control+End')
    await page.keyboard.insertText('X')
    await waitForHtml(page, (h) => h.endsWith('X'))

    await page.locator('.html-tools button[title="Undo"]').click()
    await waitForHtml(page, (h) => !h.endsWith('X'))
    const html = await getHtmlText(page)
    expect(squash(html)).toBe('<p>a</p>')

    await page.locator('.html-tools button[title="Redo"]').click()
    await waitForHtml(page, (h) => h.endsWith('X'))
  })

  test('find opens the CodeMirror search panel focused', async ({ page }) => {
    await page.goto('/')
    await setHtml(page, '<p>needle one</p><p>needle two</p>')
    await waitForHtml(page, (h) => h.includes('needle two'))

    await page.locator('[data-testid="html-find"]').click()
    const search = page.locator('.cm-panel input[name="search"]')
    await expect(search).toBeVisible()
    await expect(search).toBeFocused()
  })

  test('find/replace opens the panel with replace focused and replaces matches', async ({
    page,
  }) => {
    await page.goto('/')
    await setHtml(page, '<p>alpha</p><p>alpha</p>')
    await waitForHtml(page, (h) => h.includes('alpha'))

    await page.locator('[data-testid="html-find-replace"]').click()
    const replace = page.locator('.cm-panel input[name="replace"]')
    await expect(replace).toBeFocused()

    await page.locator('.cm-panel input[name="search"]').fill('alpha')
    await replace.fill('beta')
    await page.locator('.cm-panel button[name="replaceAll"]').click()

    await waitForHtml(page, (h) => !h.includes('alpha'))
    const html = await getHtmlText(page)
    expect(html).toContain('beta')
  })

  test('whitespace view toggles aria-pressed state', async ({ page }) => {
    await page.goto('/')
    const btn = page.locator('[data-testid="html-whitespace"]')
    await expect(btn).toHaveAttribute('aria-pressed', 'false')
    await btn.click()
    await expect(btn).toHaveAttribute('aria-pressed', 'true')
    await btn.click()
    await expect(btn).toHaveAttribute('aria-pressed', 'false')
  })

  test('A+ / A− buttons change the code editor font size', async ({ page }) => {
    await page.goto('/')
    const before = await page.locator('.html-cm').evaluate((el) => el.style.fontSize)
    await page.locator('button[title="Code editor bigger font"]').click()
    const bigger = await page.locator('.html-cm').evaluate((el) => el.style.fontSize)
    expect(Number.parseInt(bigger, 10)).toBe(Number.parseInt(before, 10) + 1)

    await page.locator('button[title="Code editor smaller font"]').click()
    const smaller = await page.locator('.html-cm').evaluate((el) => el.style.fontSize)
    expect(smaller).toBe(before)
  })

  test('fullscreen button expands the HTML pane', async ({ page }) => {
    await page.goto('/')
    const btn = page.locator('button[title="Full screen HTML editor"]')
    await btn.click()
    await expect(page.locator('.editor-grid')).toHaveClass(/editor-grid--html-full/)
    await expect(page.locator('.pane-html')).toHaveClass(/pane-html--full/)
    await btn.click()
    await expect(page.locator('.editor-grid')).not.toHaveClass(/editor-grid--html-full/)
  })
})
