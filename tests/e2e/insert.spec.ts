import { expect, test } from '@playwright/test'
import { setHtml, squash, typeVisual, waitForHtml } from './helpers'

test.describe('insert link / image / video', () => {
  test('link popup inserts an anchor with safe rel/target', async ({ page }) => {
    await page.goto('/')
    await typeVisual(page, 'site')
    await page.keyboard.press('Control+a')

    await page.locator('[data-testid="insert-link"]').click()
    const popup = page.locator('[data-testid="link-popup"]')
    await expect(popup).toBeVisible()
    await page.locator('[data-testid="link-popup-input"]').fill('https://example.com')
    await page.locator('[data-testid="link-popup-confirm"]').click()

    const html = await waitForHtml(page, (h) => h.includes('<a'))
    expect(squash(html)).toContain('href="https://example.com"')
    expect(squash(html)).toContain('rel="noopener noreferrer"')
    expect(squash(html)).toContain('target="_blank"')
    expect(squash(html)).toContain('>site</a>')
  })

  test('image popup inserts an img tag', async ({ page }) => {
    await page.goto('/')
    await page.locator('[data-testid="insert-image"]').click()
    await expect(page.locator('[data-testid="image-popup"]')).toBeVisible()
    await page.locator('[data-testid="image-popup-input"]').fill('pic.png')
    await page.locator('[data-testid="image-popup-confirm"]').click()

    const html = await waitForHtml(page, (h) => h.includes('<img'))
    expect(squash(html)).toContain('src="pic.png"')
  })

  test('video popup converts a YouTube watch URL to an embed iframe', async ({
    page,
  }) => {
    await page.goto('/')
    await page.locator('[data-testid="more-rich"]').click()
    await page.locator('[data-testid="insert-video"]').click()
    await expect(page.locator('[data-testid="video-popup"]')).toBeVisible()
    await page
      .locator('[data-testid="video-popup-input"]')
      .fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    await page.locator('[data-testid="video-popup-confirm"]').click()

    const html = await waitForHtml(page, (h) => h.includes('<iframe'))
    expect(squash(html)).toContain('src="https://www.youtube.com/embed/dQw4w9WgXcQ"')
    expect(squash(html)).toContain('data-iframe-video')
  })

  test('raw iframe HTML round-trips into the wrapped video node', async ({ page }) => {
    await page.goto('/')
    await setHtml(page, '<iframe src="https://www.youtube.com/embed/xyz"></iframe>')
    // Visual parses the iframe into the IframeVideo node; the code pane keeps
    // the user's input as typed (echo suppression by design).
    const doc = await page
      .locator('.visual-prose')
      .evaluate((el) => el.innerHTML)
    expect(squash(doc)).toContain('data-iframe-video')
    expect(squash(doc)).toContain('src="https://www.youtube.com/embed/xyz"')
  })
})

test.describe('insert table / hr / chars', () => {
  test('table grid inserts an N×M table', async ({ page }) => {
    await page.goto('/')
    await page.locator('[data-testid="insert-table"]').click()
    await expect(page.locator('[data-testid="table-insert-grid"]')).toBeVisible()
    // 2 rows × 3 cols
    await page.locator('.table-insert-cell[data-row="2"][data-col="3"]').click()

    const html = await waitForHtml(page, (h) => h.includes('<table'))
    expect(squash(html)).toContain('<table')
    expect((html.match(/<td/g) ?? []).length).toBe(6)
    expect(squash(html)).toContain('<tbody>')
  })

  test('caret in a table shows the bubble toolbar', async ({ page }) => {
    await page.goto('/')
    await page.locator('[data-testid="insert-table"]').click()
    await page.locator('.table-insert-cell[data-row="2"][data-col="2"]').click()
    await page.keyboard.type('cell')
    await waitForHtml(page, (h) => h.includes('cell'))
    await page.locator('.visual-prose td').first().click()
    await expect(page.locator('[data-testid="table-bubble"]')).toBeVisible()
  })

  // Regression: `.visual-stage > div { flex: 1 }` used to stretch the floating
  // bubble to the full pane height, and it never re-placed on stage resize.
  test('table bubble keeps content height and follows stage resize', async ({
    page,
  }) => {
    await page.goto('/')
    await page.locator('[data-testid="insert-table"]').click()
    await page.locator('.table-insert-cell[data-row="2"][data-col="2"]').click()
    await page.locator('.visual-prose td').first().click()
    await page.keyboard.type('cell')

    const bubble = page.locator('[data-testid="table-bubble"]')
    const stage = page.locator('.visual-stage')
    await expect(bubble).toBeVisible()

    const box = await bubble.boundingBox()
    const stageBox = await stage.boundingBox()
    expect(box).not.toBeNull()
    expect(stageBox).not.toBeNull()
    // Content height, not the whole pane
    expect(box!.height).toBeLessThan(120)
    expect(box!.height).toBeLessThan(stageBox!.height * 0.5)

    // Mobile preview shrinks the stage without an editor transaction
    const wide = stageBox!.width
    await page.locator('.visual-toggle input[type="checkbox"]').nth(1).click()
    await expect
      .poll(async () => (await stage.boundingBox())?.width ?? wide)
      .toBeLessThan(wide)
    await page.waitForTimeout(300)

    const narrowStage = await stage.boundingBox()
    const moved = await bubble.boundingBox()
    await expect(bubble).toBeVisible()
    expect(moved!.x).toBeGreaterThanOrEqual(narrowStage!.x - 1)
    expect(moved!.x + moved!.width).toBeLessThanOrEqual(
      narrowStage!.x + narrowStage!.width + 1,
    )
  })

  test('horizontal line inserts an <hr>', async ({ page }) => {
    await page.goto('/')
    await page.locator('[data-testid="more-rich"]').click()
    await page.locator('[data-testid="insert-hr"]').click()
    const html = await waitForHtml(page, (h) => h.includes('<hr'))
    expect(squash(html)).toContain('<hr>')
  })

  test('code block wraps typed text in <pre><code>', async ({ page }) => {
    await page.goto('/')
    await page.locator('[data-testid="more-rich"]').click()
    await page.getByRole('menuitem', { name: 'Code block' }).click()
    await page.keyboard.type('x = 1')
    const html = await waitForHtml(page, (h) => h.includes('<pre'))
    expect(squash(html)).toContain('<pre>')
    expect(squash(html)).toContain('x = 1')
  })

  test('special character © exports as &copy; in named mode', async ({ page }) => {
    await page.goto('/')
    await page.locator('[data-testid="more-rich"]').click()
    await page.locator('[data-testid="special-chars"]').click()
    await page.locator('.tb-picker-cell', { hasText: '©' }).first().click()

    const html = await waitForHtml(page, (h) => h.includes('&copy;'))
    expect(squash(html)).toBe('<p>&copy;</p>')
  })

  test('emoji picker inserts raw UTF-8 emoji', async ({ page }) => {
    await page.goto('/')
    await page.locator('[data-testid="more-rich"]').click()
    await page.locator('[data-testid="emojis"]').click()
    await page.locator('.tb-picker-cell[title="😀"]').click()

    const html = await waitForHtml(page, (h) => h.includes('😀'))
    expect(html).not.toContain('&#')
  })
})
