import { expect, test } from '@playwright/test'
import { setSegment, squash, typeVisual, waitForHtml } from './helpers'

test.describe('character encoding of the code pane', () => {
  test('named mode: western letters and symbols become named entities', async ({
    page,
  }) => {
    await page.goto('/')
    await typeVisual(page, 'café')
    const html = await waitForHtml(page, (h) => h.includes('caf'))
    expect(squash(html)).toBe('<p>caf&eacute;</p>')
  })

  test('named mode: © becomes &copy;', async ({ page }) => {
    await page.goto('/')
    await page.locator('.visual-prose').click()
    await page.keyboard.insertText('©')
    const html = await waitForHtml(page, (h) => h.includes('copy'))
    expect(squash(html)).toBe('<p>&copy;</p>')
  })

  test('named mode: Cyrillic letters stay UTF-8', async ({ page }) => {
    await page.goto('/')
    await typeVisual(page, 'Привет')
    const html = await waitForHtml(page, (h) => h.includes('Привет'))
    expect(squash(html)).toBe('<p>Привет</p>')
    expect(html).not.toContain('&#')
  })

  test('numeric mode: symbols become numeric entities, letters stay UTF-8', async ({
    page,
  }) => {
    await page.goto('/')
    await setSegment(page, 'entityEncoding', 'Numeric')
    await typeVisual(page, '©ф')
    const html = await waitForHtml(page, (h) => h.includes('&#169;'))
    expect(squash(html)).toBe('<p>&#169;ф</p>')
  })

  test('raw mode: no entity encoding at all', async ({ page }) => {
    await page.goto('/')
    await setSegment(page, 'entityEncoding', 'Raw UTF-8')
    await typeVisual(page, 'café ©')
    const html = await waitForHtml(page, (h) => h.includes('café'))
    expect(squash(html)).toBe('<p>café ©</p>')
    expect(html).not.toContain('&')
  })

  test('switching encoding re-encodes the existing code pane', async ({ page }) => {
    await page.goto('/')
    await page.locator('.visual-prose').click()
    await page.keyboard.insertText('©')
    await waitForHtml(page, (h) => h.includes('&copy;'))

    // named → numeric: symbol becomes a numeric reference
    await setSegment(page, 'entityEncoding', 'Numeric')
    const numeric = await waitForHtml(page, (h) => h.includes('&#169;'))
    expect(squash(numeric)).toBe('<p>&#169;</p>')

    // numeric → raw: literal character
    await setSegment(page, 'entityEncoding', 'Raw UTF-8')
    const raw = await waitForHtml(page, (h) => !h.includes('&'))
    expect(squash(raw)).toBe('<p>©</p>')

    // raw → named again
    await setSegment(page, 'entityEncoding', 'Named')
    const named = await waitForHtml(page, (h) => h.includes('&copy;'))
    expect(squash(named)).toBe('<p>&copy;</p>')
  })
})
