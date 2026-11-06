import { expect, test } from '@playwright/test'
import { pasteHtml, setSegment, squash, waitForHtml } from './helpers'

const WORD_HTML = [
  '<html><body>',
  '<!--[if gte mso 9]><xml><w:WordDocument></w:WordDocument></xml><![endif]-->',
  '<p class="MsoNormal" style="margin:0cm;mso-margin-top-alt:auto">',
  "<span style=\"font-size:12.0pt;background:transparent\">Hello <b>World</b></span>",
  '</p>',
  '<p class="MsoHeading2" style="mso-pagination:none;text-indent:18.0pt">Big text</p>',
  '</body></html>',
].join('')

test.describe('paste handling', () => {
  test('default Ask mode prompts on Word-like HTML and Clean strips markup', async ({
    page,
  }) => {
    await page.goto('/')
    await pasteHtml(page, WORD_HTML)

    const modal = page.locator('[data-testid="paste-ask-modal"]')
    await expect(modal).toBeVisible()
    await page.locator('[data-testid="paste-clean"]').click()
    await expect(modal).toBeHidden()

    const html = await waitForHtml(page, (h) => h.includes('Big text'))
    // Junk gone, semantics kept
    expect(html).not.toContain('Mso')
    expect(html).not.toContain('mso-')
    expect(html).not.toContain('font-size')
    expect(html).not.toContain('<!--')
    expect(squash(html)).toContain('<h2>Big text</h2>')
    expect(squash(html)).toContain('Hello <strong>World</strong>')
  })

  test('Ask mode with Keep preserves Word formatting', async ({ page }) => {
    await page.goto('/')
    await pasteHtml(page, WORD_HTML)

    await expect(page.locator('[data-testid="paste-ask-modal"]')).toBeVisible()
    await page.locator('[data-testid="paste-keep"]').click()

    const html = await waitForHtml(page, (h) => h.includes('Big text'))
    expect(squash(html)).toContain('font-size: 12pt')
    expect(squash(html)).toContain('Hello <strong>World</strong>')
    expect(html).not.toContain('mso-')
  })

  test('Ask mode with Cancel discards the paste', async ({ page }) => {
    await page.goto('/')
    await pasteHtml(page, WORD_HTML)

    await expect(page.locator('[data-testid="paste-ask-modal"]')).toBeVisible()
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.locator('[data-testid="paste-ask-modal"]')).toBeHidden()

    await page.waitForTimeout(500)
    const html = await waitForHtml(page, () => true)
    expect(html.trim()).toBe('')
  })

  test('Clean mode strips Word junk without prompting', async ({ page }) => {
    await page.goto('/')
    await setSegment(page, 'pasteMode', 'Clean')
    await pasteHtml(page, WORD_HTML)

    await expect(page.locator('[data-testid="paste-ask-modal"]')).toBeHidden()
    const html = await waitForHtml(page, (h) => h.includes('Big text'))
    expect(html).not.toContain('Mso')
    expect(html).not.toContain('mso-')
    expect(squash(html)).toContain('<h2>Big text</h2>')
  })

  test('Keep mode preserves inline formatting without prompting', async ({ page }) => {
    await page.goto('/')
    await setSegment(page, 'pasteMode', 'Keep')
    await pasteHtml(page, WORD_HTML)

    await expect(page.locator('[data-testid="paste-ask-modal"]')).toBeHidden()
    const html = await waitForHtml(page, (h) => h.includes('Big text'))
    expect(squash(html)).toContain('font-size: 12pt')
  })

  test('plain web HTML paste never triggers the Word prompt', async ({ page }) => {
    await page.goto('/')
    await pasteHtml(page, '<p><em>plain</em> web content</p>')

    await expect(page.locator('[data-testid="paste-ask-modal"]')).toBeHidden()
    const html = await waitForHtml(page, (h) => h.includes('web content'))
    expect(squash(html)).toContain('<em>plain</em>')
  })

  test('pasted images are dropped even in Keep mode', async ({ page }) => {
    await page.goto('/')
    await setSegment(page, 'pasteMode', 'Keep')
    await pasteHtml(
      page,
      '<p><img src="https://example.com/i.png" alt="pic">Caption text</p>',
    )

    const html = await waitForHtml(page, (h) => h.includes('Caption'))
    expect(html).not.toContain('<img')
    expect(squash(html)).toContain('Caption text')
  })
})
