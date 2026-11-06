import { expect, test } from '@playwright/test'
import { getHtmlText, setHtml, squash, typeVisual, visual, waitForHtml } from './helpers'

test.describe('visual → HTML sync', () => {
  test('typing produces prettified HTML in the code pane', async ({ page }) => {
    await page.goto('/')
    await typeVisual(page, 'Hello')
    const html = await waitForHtml(page, (h) => h.includes('Hello'))
    expect(squash(html)).toBe('<p>Hello</p>')
  })

  test('multi-paragraph text serializes as separate paragraphs', async ({ page }) => {
    await page.goto('/')
    await typeVisual(page, 'One')
    await page.keyboard.press('Enter')
    await page.keyboard.type('Two')
    const html = await waitForHtml(page, (h) => h.includes('Two'))
    expect(squash(html)).toBe('<p>One</p> <p>Two</p>')
  })

  test('blank line exports as <p><br></p> (PRO spacer)', async ({ page }) => {
    await page.goto('/')
    await typeVisual(page, 'One')
    await page.keyboard.press('Enter') // start of the blank paragraph
    await page.keyboard.press('Enter') // empty paragraph below
    await page.keyboard.type('Two')
    const html = await waitForHtml(
      page,
      (h) => h.includes('Two') && /<p>\s*<br\s*\/?>\s*<\/p>/.test(h),
    )
    // Exactly one spacer between the two paragraphs
    expect(html.match(/<br\s*\/?>/g)?.length).toBe(1)
  })

  test('undo/redo buttons in HTML tools restore previous content', async ({
    page,
  }) => {
    await page.goto('/')
    const undo = page.locator('.html-tools button[title="Undo"]')
    const redo = page.locator('.html-tools button[title="Redo"]')

    await typeVisual(page, 'A')
    await waitForHtml(page, (h) => squash(h) === '<p>A</p>')
    await typeVisual(page, 'B')
    await waitForHtml(page, (h) => squash(h) === '<p>AB</p>')

    // Visual keystrokes push history eagerly — undo one char at a time.
    await expect(undo).toBeEnabled()
    await undo.click()
    await waitForHtml(page, (h) => squash(h) === '<p>A</p>')

    await expect(redo).toBeEnabled()
    await redo.click()
    await waitForHtml(page, (h) => squash(h) === '<p>AB</p>')
  })
})

test.describe('HTML → Visual sync', () => {
  test('editing the code pane updates the rendered document', async ({ page }) => {
    await page.goto('/')
    await setHtml(page, '<h2>Title</h2><p>Body text</p>')
    await waitForHtml(page, (h) => h.includes('Title'))

    const doc = await visual(page).innerHTML()
    expect(squash(doc)).toContain('<h2>Title</h2>')
    expect(squash(doc)).toContain('<p>Body text</p>')
  })

  test('invalid mid-typing HTML still renders progressively', async ({ page }) => {
    await page.goto('/')
    await setHtml(page, '<p>First</p>')
    await waitForHtml(page, (h) => h.includes('First'))

    // Append an unclosed tag — DOMParser auto-closes it; visual stays usable.
    await page.locator('.cm-content').click()
    await page.keyboard.press('Control+End')
    await page.keyboard.insertText('<p>Second')
    await waitForHtml(page, (h) => h.includes('Second'))
    const doc = await visual(page).innerHTML()
    expect(squash(doc)).toContain('Second')
  })

  test('flat data-indent lists nest into real <ul> trees', async ({ page }) => {
    await page.goto('/')
    await setHtml(
      page,
      '<ul><li>A</li><li data-indent="1">B</li><li data-indent="1">C</li></ul>',
    )
    // The HTML pane itself normalizes on sync (onHtmlChange re-serializes).
    const html = await waitForHtml(page, (h) => h.includes('<ul>') && !h.includes('data-indent'))
    expect(squash(html)).toBe('<ul> <li>A<ul> <li>B</li> <li>C</li> </ul> </li> </ul>')
  })

  test('legacy numeric letter entities decode to UTF-8 on load', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('w2h-settings', JSON.stringify({ autoSaveHtml: true }))
      localStorage.setItem('w2h-autosave-html', '<p>Привет &#1092;</p>')
    })
    await page.goto('/')
    const html = await waitForHtml(page, (h) => h.includes('Привет'))
    expect(html).toContain('ф')
    expect(html).not.toContain('&#')
  })
})
