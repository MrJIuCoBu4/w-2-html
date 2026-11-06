import type { Page } from '@playwright/test'

/** ProseMirror contenteditable in the visual pane. */
export function visual(page: Page) {
  return page.locator('.visual-prose')
}

/** CodeMirror editable surface in the HTML pane. */
export function cm(page: Page) {
  return page.locator('.cm-content')
}

/**
 * Read the HTML pane text. CodeMirror splits the doc into `.cm-line` blocks,
 * so `textContent` alone would lose line breaks — join lines explicitly.
 * An empty doc renders the CM placeholder inside the first line; report ''.
 */
export async function getHtmlText(page: Page): Promise<string> {
  return cm(page).evaluate((el) => {
    if (el.querySelector('.cm-placeholder')) return ''
    return Array.from(el.querySelectorAll('.cm-line'))
      .map((line) => line.textContent ?? '')
      .join('\n')
  })
}

/** Wait until the HTML pane content satisfies the predicate. */
export async function waitForHtml(
  page: Page,
  predicate: (html: string) => boolean,
  timeout = 10_000,
): Promise<string> {
  const start = Date.now()
  for (;;) {
    const text = await getHtmlText(page)
    if (predicate(text)) return text
    if (Date.now() - start > timeout) {
      throw new Error(
        `HTML pane did not satisfy predicate within ${timeout}ms. Last content:\n${text}`,
      )
    }
    await page.waitForTimeout(100)
  }
}

/**
 * Replace the whole HTML pane document. `insertText` inserts the payload as a
 * single input event, which avoids the per-keystroke auto-close-tag logic.
 */
export async function setHtml(page: Page, html: string): Promise<void> {
  await cm(page).click()
  await page.keyboard.press('Control+a')
  await page.keyboard.insertText(html)
}

/** Type into the visual editor at the caret. */
export async function typeVisual(page: Page, text: string): Promise<void> {
  await visual(page).click()
  await page.keyboard.type(text)
}

/** Dispatch a synthetic paste (text/html + text/plain) on the visual editor. */
export async function pasteHtml(
  page: Page,
  html: string,
  plain = html.replace(/<[^>]+>/g, ''),
): Promise<void> {
  await page.evaluate(
    ({ html, plain }) => {
      const target = document.querySelector('.visual-prose')
      if (!target) throw new Error('visual editor not found')
      const dt = new DataTransfer()
      dt.setData('text/html', html)
      dt.setData('text/plain', plain)
      const ev = new ClipboardEvent('paste', {
        clipboardData: dt,
        bubbles: true,
        cancelable: true,
      })
      target.dispatchEvent(ev)
    },
    { html, plain },
  )
}

/** Open Settings and click a segmented-control option by group name. */
export async function setSegment(
  page: Page,
  group: string,
  label: string,
): Promise<void> {
  await page.locator('.visual-gear').click()
  await page
    .locator(`.settings-seg[aria-label="${group}"]`)
    .getByRole('radio', { name: label })
    .click()
  await page.locator('.settings-close').click()
}

/** Open Settings and flip a toggle by its label text. */
export async function setToggle(
  page: Page,
  label: string,
): Promise<void> {
  await page.locator('.visual-gear').click()
  // Click the label (the checkbox itself is covered by decorative spans).
  await page.locator('.settings-toggle', { hasText: label }).first().click()
  await page.locator('.settings-close').click()
}

/** Strip whitespace so assertions survive prettify/indent differences. */
export function squash(html: string): string {
  return html.replace(/\s+/g, ' ').trim()
}

/**
 * TipTap keeps a trailing empty paragraph after non-paragraph blocks
 * (trailingNode plugin), serialized as `<p><br></p>`. Remove it so
 * assertions can target the meaningful document body.
 */
export function stripTrailingSpacer(html: string): string {
  return squash(html).replace(/\s*<p><br\s*\/?><\/p>\s*$/, '')
}
