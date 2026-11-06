import { NAMED_ENTITIES } from './settings'

/** Normalize HTML for equality checks to avoid sync feedback loops. */
export function normalizeHtml(html: string): string {
  return html
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, '&nbsp;')
    .replace(/\s+/g, ' ')
    .replace(/>\s+</g, '><')
    .trim()
}

export function htmlEquals(a: string, b: string): boolean {
  if (normalizeHtml(a) === normalizeHtml(b)) return true
  // Treat `&copy;` and `©` (etc.) as the same so entity encoding does not
  // fight Visual↔HTML sync.
  try {
    const canon = (html: string) => {
      const doc = new DOMParser().parseFromString(
        `<!DOCTYPE html><html><body>${html}</body></html>`,
        'text/html',
      )
      if (doc.querySelector('parsererror')) return normalizeHtml(html)
      return normalizeHtml(doc.body.innerHTML)
    }
    return canon(a) === canon(b)
  } catch {
    return false
  }
}

/** Try parsing HTML fragment; returns error message or null if OK. */
export function validateHtml(html: string): string | null {
  try {
    const doc = new DOMParser().parseFromString(
      `<!DOCTYPE html><html><body>${html}</body></html>`,
      'text/html',
    )
    const err = doc.querySelector('parsererror')
    if (err) return err.textContent?.trim() || 'Invalid HTML'
    return null
  } catch (e) {
    return e instanceof Error ? e.message : 'Invalid HTML'
  }
}

/** Entity name → code point, for decoding text before counting. */
const NAMED_ENTITY_CODES: Record<string, number> = (() => {
  const map: Record<string, number> = { amp: 38, lt: 60, gt: 62, quot: 34, apos: 39 }
  for (const [code, entity] of Object.entries(NAMED_ENTITIES)) {
    // Entity spelling is case-sensitive (&Eacute; ≠ &eacute;).
    map[entity.slice(1, -1)] = Number(code)
  }
  return map
})()

const ENTITY_RE = /&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|([a-zA-Z][a-zA-Z0-9]*));/g

function codePointToString(code: number, fallback: string): string {
  if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return fallback
  try {
    return String.fromCodePoint(code)
  } catch {
    return fallback
  }
}

/** Decode numeric and named entities (`&eacute;` → `é`) for text stats. */
export function decodeHtmlEntities(text: string): string {
  if (!text.includes('&')) return text
  return text.replace(ENTITY_RE, (full, dec, hex, name) => {
    if (dec) return codePointToString(Number(dec), full)
    if (hex) return codePointToString(Number.parseInt(hex, 16), full)
    const code = NAMED_ENTITY_CODES[name as string]
    return code === undefined ? full : codePointToString(code, full)
  })
}

export function countWords(text: string): number {
  const t = decodeHtmlEntities(text.replace(/<[^>]+>/g, ' ')).trim()
  if (!t) return 0
  return t.split(/\s+/).filter(Boolean).length
}

export function countChars(text: string): number {
  // Code points, not UTF-16 units — an emoji counts as one character.
  return Array.from(decodeHtmlEntities(text.replace(/<[^>]+>/g, ''))).length
}

const EMPTY_P_RE =
  /<p(\s[^>]*)?>\s*(?:&nbsp;|\u00a0|\s)*(?:<br\s*\/?>\s*)?<\/p>/gi

/**
 * HTML export: blank lines as PRO-style `<p><br></p>`.
 * TipTap getHTML() emits empty `<p></p>`; Word paste uses `&nbsp;`.
 */
export function normalizeEmptyParagraphs(html: string): string {
  return html.replace(EMPTY_P_RE, '<p$1><br></p>')
}

/**
 * Editor input: blank lines as empty `<p></p>` (no HardBreak).
 * `<p><br></p>` in TipTap becomes hard_break + ProseMirror-trailingBreak
 * → two visual blank lines for one spacer.
 */
export function emptyParagraphsForEditor(html: string): string {
  return html.replace(EMPTY_P_RE, '<p$1></p>')
}

function isEffectivelyEmptyParagraph(el: Element): boolean {
  if (el.tagName !== 'P') return false
  if (el.querySelector('img, iframe, video, object, embed, br, hr')) return false
  const text = (el.textContent || '').replace(/\u00a0/g, ' ').trim()
  return text.length === 0
}

/**
 * Froala/PRO-like list HTML: unwrap `<li><p>…</p></li>` → `<li>…</li>`,
 * keep nested lists, and drop empty `<p>` inside list items.
 * TipTap still edits with paragraphs inside list items; this only affects serialized HTML.
 */
export function unwrapListItemParagraphs(html: string): string {
  if (!html || !/<li[\s>]/i.test(html)) return html
  try {
    const doc = new DOMParser().parseFromString(
      `<!DOCTYPE html><html><body>${html}</body></html>`,
      'text/html',
    )
    const body = doc.body
    body.querySelectorAll('li').forEach((li) => {
      const directChildren = Array.from(li.children)
      for (const child of directChildren) {
        if (child.tagName !== 'P') continue
        if (isEffectivelyEmptyParagraph(child)) {
          child.remove()
          continue
        }
        const parent = child.parentNode
        if (!parent) continue
        while (child.firstChild) {
          parent.insertBefore(child.firstChild, child)
        }
        child.remove()
      }
    })
    return body.innerHTML
  } catch {
    return html
  }
}

const INDENT_STEP_PX = 40

function listItemIndentLevel(li: Element): number {
  const data = li.getAttribute('data-indent')
  if (data != null && data !== '') {
    const n = parseInt(data, 10)
    if (!Number.isNaN(n) && n > 0) return n
  }
  const ml = (li as HTMLElement).style?.marginLeft
  if (ml) {
    const px = parseInt(ml, 10)
    if (!Number.isNaN(px) && px > 0) return Math.round(px / INDENT_STEP_PX)
  }
  return 0
}

function clearListItemIndentAttrs(li: HTMLElement) {
  li.removeAttribute('data-indent')
  li.style.removeProperty('margin-left')
  if (!li.getAttribute('style')?.trim()) li.removeAttribute('style')
}

/**
 * Convert flat sibling `<li data-indent>` / margin-left lists into real nested
 * `<ul>/<ol>` trees (PRO-style). Clears indent attrs afterward.
 *
 * Example: levels 0,2,2,5 →
 *   <li>A<ul><li><ul><li>B</li><li>C<ul><li><ul><li><ul><li>D</li></ul></li></ul></li></ul></li></ul></li></ul></li>
 * (skipped levels become empty wrapper <li><ul>…</ul></li>, matching PRO depth.)
 */
export function nestFlatIndentedLists(html: string): string {
  if (!html || !/<li[\s>]/i.test(html)) return html
  if (!/data-indent|margin-left\s*:/i.test(html)) return html
  try {
    const doc = new DOMParser().parseFromString(
      `<!DOCTYPE html><html><body>${html}</body></html>`,
      'text/html',
    )
    const body = doc.body

    type NestNode = { level: number; li: HTMLElement; children: NestNode[] }

    /**
     * Mount outline nodes into a list. Level gaps become shared empty
     * <li><ul>…</ul></li> bridges so siblings at the same indent stay together.
     */
    const mountChildren = (
      nodes: NestNode[],
      intoList: Element,
      parentLevel: number,
      listTag: string,
    ) => {
      let i = 0
      while (i < nodes.length) {
        const n = nodes[i]
        const directLevel = parentLevel + 1
        if (n.level <= directLevel) {
          intoList.appendChild(n.li)
          if (n.children.length > 0) {
            const inner = doc.createElement(listTag)
            n.li.appendChild(inner)
            mountChildren(n.children, inner, n.level, listTag)
          }
          i += 1
          continue
        }
        // Gap: one shared bridge, then remount remaining from parentLevel+1.
        const bridgeLi = doc.createElement('li')
        bridgeLi.setAttribute('data-list-bridge', '1')
        const bridgeList = doc.createElement(listTag)
        bridgeLi.appendChild(bridgeList)
        intoList.appendChild(bridgeLi)
        mountChildren(nodes.slice(i), bridgeList, parentLevel + 1, listTag)
        break
      }
    }

    const processList = (list: Element) => {
      Array.from(list.children).forEach((child) => {
        if (child.tagName !== 'LI') return
        Array.from(child.children).forEach((c) => {
          if (c.tagName === 'UL' || c.tagName === 'OL') processList(c)
        })
      })

      const items = Array.from(list.children).filter(
        (c) => c.tagName === 'LI',
      ) as HTMLElement[]
      if (items.length === 0) return
      if (!items.some((li) => listItemIndentLevel(li) > 0)) {
        items.forEach(clearListItemIndentAttrs)
        return
      }

      const root: NestNode[] = []
      const stack: { level: number; children: NestNode[] }[] = [
        { level: -1, children: root },
      ]

      for (const li of items) {
        const level = listItemIndentLevel(li)
        clearListItemIndentAttrs(li)
        while (stack.length > 1 && stack[stack.length - 1].level >= level) {
          stack.pop()
        }
        const node: NestNode = { level, li, children: [] }
        stack[stack.length - 1].children.push(node)
        stack.push(node)
      }

      const listTag = list.tagName.toLowerCase()
      while (list.firstChild) list.removeChild(list.firstChild)
      mountChildren(root, list, -1, listTag)
    }

    body.querySelectorAll('ul, ol').forEach((list) => {
      if (list.parentElement?.closest('ul, ol')) return
      processList(list)
    })

    return body.innerHTML
  } catch {
    return html
  }
}

/**
 * Drop the trailing empty paragraph TipTap's `trailingNode` keeps after
 * non-paragraph blocks (headings, lists, quotes, tables, code). It is editor
 * chrome, not content, and would export as a stray blank line. A blank line
 * the user typed after a paragraph is left untouched.
 */
function stripTrailingEditorSpacer(html: string): string {
  if (!/<p(?:\s[^>]*)?>\s*(?:<br\s*\/?>\s*)?<\/p>\s*$/i.test(html)) return html
  try {
    const doc = new DOMParser().parseFromString(
      `<!DOCTYPE html><html><body>${html}</body></html>`,
      'text/html',
    )
    const body = doc.body
    const last = body.lastElementChild
    if (!last || last.tagName !== 'P') return html
    const prev = last.previousElementSibling
    // trailingNode only appends when the last block is not a paragraph.
    if (!prev || prev.tagName === 'P') return html
    if ((last.textContent || '').replace(/\u00a0/g, ' ').trim()) return html
    if (last.querySelector('img, iframe, video, object, embed, hr')) return html
    if (last.querySelectorAll('br').length > 1) return html
    last.remove()
    return body.innerHTML
  } catch {
    return html
  }
}

/** Visual→HTML sync: normalize blank lines + Froala-like list serialization. */
export function serializeVisualHtml(html: string): string {
  return stripTrailingEditorSpacer(
    stripNoopSpanStyles(
      unwrapListItemParagraphs(nestFlatIndentedLists(normalizeEmptyParagraphs(html))),
    ).replace(/\s*data-list-bridge="1"/gi, ''),
  )
}

/**
 * TipTap listItem schema is `paragraph block*`. Froala-like HTML may be
 * `<li><ul>…</ul></li>` after serialize strips the empty leading `<p>`.
 * Re-inject it before setContent so deep nesting survives Visual↔HTML sync.
 * Also converts legacy flat data-indent lists into nested trees, and
 * collapses spacer `<p><br></p>` to empty `<p>` for single-line blanks.
 */
export function prepareHtmlForEditor(html: string): string {
  if (!html) return html
  const withEmpty = emptyParagraphsForEditor(html)
  if (!/<li[\s>]/i.test(withEmpty)) return withEmpty
  try {
    const nested = nestFlatIndentedLists(withEmpty)
    const doc = new DOMParser().parseFromString(
      `<!DOCTYPE html><html><body>${nested}</body></html>`,
      'text/html',
    )
    const body = doc.body
    body.querySelectorAll('li').forEach((li) => {
      const first = li.firstElementChild
      if (!first) return
      const tag = first.tagName
      if (tag === 'UL' || tag === 'OL') {
        const p = doc.createElement('p')
        li.insertBefore(p, first)
      }
    })
    return emptyParagraphsForEditor(body.innerHTML)
  } catch {
    return withEmpty
  }
}

/** Heuristic: clipboard HTML looks like Microsoft Word / Office / Google Docs paste. */
export function looksLikeWordHtml(html: string): boolean {
  if (!html) return false
  return (
    /class=("|&quot;)?Mso/i.test(html) ||
    /mso-/i.test(html) ||
    /xmlns:o=/i.test(html) ||
    /xmlns:w=/i.test(html) ||
    /<!--\[if\s+gte?\s+mso/i.test(html) ||
    /urn:schemas-microsoft-com/i.test(html) ||
    /docs-internal-guid/i.test(html)
  )
}

/** Remove images from pasted HTML (toolbar Insert Image stays available). */
export function stripPastedImages(html: string): string {
  if (!html) return html
  return html
    .replace(/<img\b[^>]*>/gi, '')
    .replace(/<picture\b[^>]*>[\s\S]*?<\/picture>/gi, '')
    .replace(/<source\b[^>]*>/gi, '')
    .replace(/<v:imagedata\b[^>]*>/gi, '')
}

/**
 * Word/Google Docs often wrap text in `<span style="background-color: transparent">`.
 * Drop no-op backgrounds and unwrap spans that only carried that junk.
 */
export function stripNoopSpanStyles(html: string): string {
  if (!html || !/<span[\s>]/i.test(html)) return html
  try {
    const doc = new DOMParser().parseFromString(
      `<!DOCTYPE html><html><body>${html}</body></html>`,
      'text/html',
    )
    const body = doc.body

    const isNoopBg = (value: string) => {
      const v = value.trim().toLowerCase()
      return (
        !v ||
        v === 'transparent' ||
        v === 'initial' ||
        v === 'inherit' ||
        v === 'unset' ||
        v === 'rgba(0, 0, 0, 0)' ||
        v === 'rgba(0,0,0,0)'
      )
    }

    body.querySelectorAll('span').forEach((span) => {
      const style = span.getAttribute('style')
      if (style) {
        const kept = style
          .split(';')
          .map((part) => part.trim())
          .filter(Boolean)
          .filter((decl) => {
            const m = /^background(?:-color)?\s*:\s*(.+)$/i.exec(decl)
            if (m && isNoopBg(m[1])) return false
            return true
          })
        if (kept.length === 0) span.removeAttribute('style')
        else span.setAttribute('style', kept.join('; '))
      }

      // Unwrap span with no attrs left (decorative Word wrapper).
      if (!span.getAttribute('style') && !span.getAttribute('class') && span.attributes.length === 0) {
        const parent = span.parentNode
        if (!parent) return
        while (span.firstChild) parent.insertBefore(span.firstChild, span)
        parent.removeChild(span)
      }
    })

    return body.innerHTML
  } catch {
    return html
      .replace(/background-color\s*:\s*transparent\s*;?/gi, '')
      .replace(/background\s*:\s*transparent\s*;?/gi, '')
      .replace(/<span\s+style=("|' )\s*\1>/gi, '')
      .replace(/<span\s+style="\s*">/gi, '')
      .replace(/<span\s+style='\s*'>/gi, '')
  }
}

/** True when the clipboard carries image files (screenshot / Copy image). */
export function clipboardHasImageFiles(data: DataTransfer | null | undefined): boolean {
  if (!data) return false
  if (data.files && data.files.length > 0) {
    for (const f of Array.from(data.files)) {
      if (f.type.startsWith('image/')) return true
    }
  }
  if (data.items && data.items.length > 0) {
    for (const item of Array.from(data.items)) {
      if (item.kind === 'file' && item.type.startsWith('image/')) return true
    }
  }
  return false
}

/**
 * Strip Word/Office paste junk, but keep semantic structure the PRO editor keeps:
 * headings (h1–h4 / MsoHeading*) and bold (<b>/<strong> / font-weight:bold).
 */
export function cleanWordPaste(html: string): string {
  let out = stripNoopSpanStyles(stripPastedImages(html))

  // Word heading paragraphs → real <hN> before class stripping.
  out = out.replace(
    /<p\b([^>]*)\bclass=(["'])([^"']*)\2([^>]*)>([\s\S]*?)<\/p>/gi,
    (full, _pre, _q, cls, _post, inner) => {
      const m = /(?:MsoHeading|heading|Heading)\s*([1-4])\b/i.exec(cls)
      if (!m) return full
      const level = m[1]
      return `<h${level}>${inner}</h${level}>`
    },
  )

  // Inline font-weight:bold|700 → <strong> before style stripping.
  out = out.replace(
    /<span\b([^>]*\bstyle=(["'])[^"']*font-weight\s*:\s*(?:bold|700)[^"']*\2[^>]*)>([\s\S]*?)<\/span>/gi,
    (_full, _attrs, _q, inner) => `<strong>${inner}</strong>`,
  )
  out = out.replace(
    /<(p|li|td|th|h[1-6])\b([^>]*)\bstyle=(["'])([^"']*font-weight\s*:\s*(?:bold|700)[^"']*)\3([^>]*)>/gi,
    (_full, tag, pre, q, style, post) => {
      const cleaned = style
        .replace(/font-weight\s*:\s*(?:bold|700)\s*;?/gi, '')
        .trim()
      const styleAttr = cleaned ? ` style=${q}${cleaned}${q}` : ''
      return `<${tag}${pre}${styleAttr}${post} data-w2h-bold="1">`
    },
  )
  // Wrap contents of blocks marked data-w2h-bold (simple single-pass for common paste).
  out = out.replace(
    /<(p|li|td|th|h[1-6])\b([^>]*?)\sdata-w2h-bold="1"([^>]*)>([\s\S]*?)<\/\1>/gi,
    (_full, tag, pre, post, inner) => {
      if (/^\s*<(strong|b)\b/i.test(inner)) {
        return `<${tag}${pre}${post}>${inner}</${tag}>`
      }
      return `<${tag}${pre}${post}><strong>${inner}</strong></${tag}>`
    },
  )

  out = out.replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, '')
  out = out.replace(/<!--[\s\S]*?-->/g, '')
  out = out.replace(/<\/?(o|w|m):[^>]*>/gi, '')
  // Quoted `class="Mso…"` and unquoted `class=Mso…`; the trailing \1 keeps
  // the closing quote so tags are not corrupted into `<p" style=…>`.
  out = out.replace(/\s*class=("|&quot;)?Mso[^"'\s>]*\1?/gi, '')
  out = out.replace(/\s*style="[^"]*mso-[^"]*"/gi, (m) => {
    const cleaned = m
      .replace(/mso-[^:;"]+:[^;"]+;?/gi, '')
      .replace(/font-family:[^;"]*;?/gi, '')
    if (/style="\s*"/.test(cleaned) || /style=""/.test(cleaned)) return ''
    return cleaned
  })
  // Drop empty / decorative spans; keep <strong>/<b>/<hN> intact.
  out = out.replace(/<span[^>]*>\s*<\/span>/gi, '')
  out = out.replace(/<\/?span[^>]*>/gi, '')
  // Blank lines → empty <p> for TipTap insert (HTML pane still gets <p><br></p> via serialize).
  out = emptyParagraphsForEditor(out)
  return out
}
