import { expect, test } from '@playwright/test'
import { squash, stripTrailingSpacer, typeVisual, waitForHtml } from './helpers'

type Page = import('@playwright/test').Page

/** Compact toolbar hides secondary formatting behind More Text. */
async function openMoreText(page: Page) {
  const btn = page.locator('[data-testid="more-text"]')
  if (await btn.isVisible()) {
    const panel = page.locator('[data-testid="more-text-panel"]')
    if ((await panel.getAttribute('aria-hidden')) !== 'false') {
      await btn.click()
    }
    await expect(panel).toHaveAttribute('aria-hidden', 'false')
  }
}

test.describe('inline formatting', () => {
  test('bold wraps selected text in <strong>', async ({ page }) => {
    await page.goto('/')
    await typeVisual(page, 'bold me')
    await page.keyboard.press('Control+a')
    await page.locator('button[title="Bold (Ctrl+B)"]').click()

    const html = await waitForHtml(page, (h) => h.includes('<strong>'))
    expect(squash(html)).toBe('<p><strong>bold me</strong></p>')
    // Toolbar state reflects active mark
    await expect(page.locator('button[title="Bold (Ctrl+B)"]')).toHaveClass(/is-active/)
  })

  test('italic / underline / strikethrough from the More Text panel', async ({
    page,
  }) => {
    await page.goto('/')
    await typeVisual(page, 'mix')
    await page.keyboard.press('Control+a')
    await openMoreText(page)

    await page.locator('button[title="Italic (Ctrl+I)"]').click()
    await page.locator('button[title="Underline (Ctrl+U)"]').click()
    await page.locator('button[title="Strikethrough"]').click()

    const html = await waitForHtml(page, (h) => h.includes('<u>'))
    // Mark order follows schema registration (em > s > u), not click order
    expect(squash(html)).toBe('<p><em><s><u>mix</u></s></em></p>')
  })

  test('text color and highlight apply inline styles', async ({ page }) => {
    await page.goto('/')
    await typeVisual(page, 'red')
    await page.keyboard.press('Control+a')
    await openMoreText(page)

    await page.locator('button[title="Text Color"]').click()
    await page.locator('.tb-swatch[title="#ff0000"]').click()
    await waitForHtml(page, (h) => h.includes('color:'))

    await openMoreText(page)
    await page.locator('button[title="Background Color"]').click()
    await page.locator('.tb-swatch[title="#ffff00"]').first().click()

    const html = await waitForHtml(page, (h) => h.includes('background-color'))
    // ProseMirror normalizes hex colors to rgb()
    expect(squash(html)).toContain('color: rgb(255, 0, 0)')
    expect(squash(html)).toContain('background-color: rgb(255, 255, 0)')
  })

  test('font size from the More Text panel (px unit)', async ({ page }) => {
    await page.goto('/')
    await typeVisual(page, 'big')
    await page.keyboard.press('Control+a')
    await openMoreText(page)

    await page.locator('button[title="Font Size (px)"]').click()
    await page.locator('.tb-menu-item--size', { hasText: '18px' }).first().click()

    const html = await waitForHtml(page, (h) => h.includes('font-size'))
    expect(squash(html)).toBe('<p><span style="font-size: 18px">big</span></p>')
  })

  test('clear formatting keeps bold but drops colors', async ({ page }) => {
    await page.goto('/')
    await typeVisual(page, 'styled')
    await page.keyboard.press('Control+a')
    await page.locator('button[title="Bold (Ctrl+B)"]').click()
    await openMoreText(page)
    await page.locator('button[title="Text Color"]').click()
    await page.locator('.tb-swatch[title="#ff0000"]').click()
    await waitForHtml(page, (h) => h.includes('color:'))

    await openMoreText(page)
    await page.locator('[data-testid="clear-formatting"]').click()

    const html = await waitForHtml(page, (h) => !h.includes('color:'))
    expect(squash(html)).toBe('<p><strong>styled</strong></p>')
  })
})

test.describe('block formatting', () => {
  test('paragraph format sets heading 1 and back to normal', async ({ page }) => {
    await page.goto('/')
    await typeVisual(page, 'Title')
    await page.keyboard.press('Control+a')
    await openMoreText(page)

    await page.locator('button[title="Paragraph Format"]').click()
    await page.getByRole('menuitem', { name: 'Heading 1' }).click()
    // TipTap's trailingNode keeps an empty paragraph after the heading
    const heading = await waitForHtml(page, (h) => h.includes('<h1>'))
    expect(stripTrailingSpacer(heading)).toBe('<h1>Title</h1>')

    await openMoreText(page)
    await page.locator('button[title="Paragraph Format"]').click()
    await page.getByRole('menuitem', { name: 'Normal' }).click()
    const normal = await waitForHtml(page, (h) => !h.includes('<h1>'))
    expect(stripTrailingSpacer(normal)).toBe('<p>Title</p>')
  })

  test('align center writes text-align style', async ({ page }) => {
    await page.goto('/')
    await typeVisual(page, 'centered')
    await page.keyboard.press('Control+a')
    await page.locator('button[title="Align"]').click()
    await page.getByRole('menuitem', { name: 'Align center' }).click()

    const html = await waitForHtml(page, (h) => h.includes('text-align'))
    // The DOM round-trip appends a trailing semicolon to the style value
    expect(squash(html)).toBe('<p style="text-align: center;">centered</p>')
  })

  test('line height 1.5 writes block style', async ({ page }) => {
    await page.goto('/')
    await typeVisual(page, 'spaced')
    await page.keyboard.press('Control+a')
    await openMoreText(page)
    await page.locator('button[title="Line Height"]').click()
    await page.getByRole('menuitem', { name: '1.5' }).click()

    const html = await waitForHtml(page, (h) => h.includes('line-height'))
    expect(squash(html)).toBe('<p style="line-height: 1.5;">spaced</p>')
  })

  test('blockquote wraps the paragraph', async ({ page }) => {
    await page.goto('/')
    await typeVisual(page, 'quote me')
    await openMoreText(page)
    await page.locator('[data-testid="blockquote-increase"]').click()

    const html = await waitForHtml(page, (h) => h.includes('<blockquote>'))
    expect(stripTrailingSpacer(html)).toBe(
      '<blockquote> <p>quote me</p> </blockquote>',
    )

    await openMoreText(page)
    await page.locator('[data-testid="blockquote-decrease"]').click()
    const lifted = await waitForHtml(page, (h) => !h.includes('<blockquote>'))
    expect(stripTrailingSpacer(lifted)).toBe('<p>quote me</p>')
  })

  test('increase/decrease indent adjusts margin-left by 40px steps', async ({
    page,
  }) => {
    await page.goto('/')
    await typeVisual(page, 'ind')
    await openMoreText(page)

    await page.locator('button[title="Increase Indent"]').click()
    await page.locator('button[title="Increase Indent"]').click()
    const two = await waitForHtml(page, (h) => h.includes('margin-left: 80px'))
    expect(squash(two)).toBe('<p style="margin-left: 80px;">ind</p>')

    await page.locator('button[title="Decrease Indent"]').click()
    const one = await waitForHtml(page, (h) => h.includes('margin-left: 40px'))
    expect(squash(one)).toBe('<p style="margin-left: 40px;">ind</p>')
  })
})

test.describe('lists', () => {
  test('ordered list with lower-alpha style serializes type="a"', async ({
    page,
  }) => {
    await page.goto('/')
    await page.locator('[data-testid="ordered-list"]').click()
    await page.getByRole('menuitem', { name: 'Lower Alpha' }).click()
    await page.keyboard.type('First')
    await page.keyboard.press('Enter')
    await page.keyboard.type('Second')

    const html = await waitForHtml(page, (h) => h.includes('Second'))
    expect(stripTrailingSpacer(html)).toBe(
      '<ol type="a"> <li>First</li> <li>Second</li> </ol>',
    )
  })

  test('bullet list with square style serializes list-style-type', async ({
    page,
  }) => {
    await page.goto('/')
    await page.locator('[data-testid="unordered-list"]').click()
    await page.getByRole('menuitem', { name: 'Square' }).click()
    await page.keyboard.type('Item')

    const html = await waitForHtml(page, (h) => h.includes('list-style-type'))
    expect(stripTrailingSpacer(html)).toBe(
      '<ul style="list-style-type: square;"> <li>Item</li> </ul>',
    )
  })

  test('Tab nests a list item under the previous sibling', async ({ page }) => {
    await page.goto('/')
    await page.locator('[data-testid="unordered-list"]').click()
    await page.getByRole('menuitem', { name: 'Default' }).click()
    await page.keyboard.type('Alpha')
    await page.keyboard.press('Enter')
    await page.keyboard.type('Beta')
    await page.keyboard.press('Tab')

    const html = await waitForHtml(
      page,
      (h) => squash(h).includes('Beta') && squash(h).includes('Alpha<ul>'),
    )
    expect(stripTrailingSpacer(html)).toBe(
      '<ul> <li>Alpha<ul> <li>Beta</li> </ul> </li> </ul>',
    )
  })

  test('Shift+Tab lifts a nested item back', async ({ page }) => {
    await page.goto('/')
    await page.locator('[data-testid="unordered-list"]').click()
    await page.getByRole('menuitem', { name: 'Default' }).click()
    await page.keyboard.type('Alpha')
    await page.keyboard.press('Enter')
    await page.keyboard.type('Beta')
    await page.keyboard.press('Tab')
    await waitForHtml(page, (h) => squash(h).includes('Alpha<ul>'))
    await page.keyboard.press('Shift+Tab')

    const html = await waitForHtml(page, (h) => !squash(h).includes('Alpha<ul>'))
    expect(stripTrailingSpacer(html)).toBe('<ul> <li>Alpha</li> <li>Beta</li> </ul>')
  })

  test('ordered-list menu offers Remove list and toggles off', async ({ page }) => {
    await page.goto('/')
    await page.locator('[data-testid="ordered-list"]').click()
    await page.getByRole('menuitem', { name: 'Default' }).click()
    await page.keyboard.type('Item')
    await waitForHtml(page, (h) => h.includes('<ol>'))

    await page.locator('[data-testid="ordered-list"]').click()
    await page.locator('[data-testid="ol-remove"]').click()
    const html = await waitForHtml(page, (h) => !h.includes('<ol>'))
    expect(stripTrailingSpacer(html)).toBe('<p>Item</p>')
  })
})
