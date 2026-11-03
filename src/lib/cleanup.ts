import { html as beautifyHtml } from 'js-beautify'

export type CleanupOptions = {
  emptyTags: boolean
  tagsWithWhitespace: boolean
  emptyAttributes: boolean
  dataAttributes: boolean
  dirAttributes: boolean
  stripComments: boolean
  stripScriptsIframesJs: boolean
  emptyNewLines: boolean
  stripAllAttributes: boolean
  stripTagIds: boolean
  stripLinks: boolean
  stripTables: boolean
  stripForms: boolean
  indent: boolean
  nbspToSpace: boolean
  compress: boolean
}

export const DEFAULT_CLEANUP_OPTIONS: CleanupOptions = {
  emptyTags: true,
  tagsWithWhitespace: true,
  emptyAttributes: true,
  dataAttributes: true,
  dirAttributes: true,
  stripComments: true,
  stripScriptsIframesJs: true,
  emptyNewLines: true,
  stripAllAttributes: false,
  stripTagIds: false,
  stripLinks: false,
  stripTables: false,
  stripForms: false,
  indent: false,
  nbspToSpace: false,
  compress: false,
}

export const CLEANUP_OPTION_LABELS: { key: keyof CleanupOptions; label: string }[] = [
  { key: 'emptyTags', label: 'empty tags' },
  { key: 'tagsWithWhitespace', label: 'tags with whitespace' },
  { key: 'emptyAttributes', label: 'empty attributes' },
  { key: 'dataAttributes', label: 'data attributes' },
  { key: 'dirAttributes', label: 'dir attributes' },
  { key: 'stripComments', label: 'comments' },
  { key: 'stripScriptsIframesJs', label: 'js code scripts / iframes' },
  { key: 'emptyNewLines', label: 'empty new lines' },
  { key: 'stripAllAttributes', label: 'all tag attributes' },
  { key: 'stripTagIds', label: 'tag IDs' },
  { key: 'stripLinks', label: 'links' },
  { key: 'stripTables', label: 'tables' },
  { key: 'stripForms', label: 'forms' },
  { key: 'indent', label: 'indent' },
  { key: 'nbspToSpace', label: 'nbsp → space' },
  { key: 'compress', label: 'compress' },
]

const VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
])

const KEEP_EMPTY = new Set(['td', 'th', 'tr', 'br', 'hr', 'img', 'input', 'iframe'])

function parseFragment(html: string): { doc: Document; body: HTMLElement } {
  const doc = new DOMParser().parseFromString(
    `<!DOCTYPE html><html><body>${html}</body></html>`,
    'text/html',
  )
  return { doc, body: doc.body }
}

function serializeBody(body: HTMLElement): string {
  return body.innerHTML
}

function removeComments(root: Node): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT)
  const nodes: Comment[] = []
  let n = walker.nextNode()
  while (n) {
    nodes.push(n as Comment)
    n = walker.nextNode()
  }
  for (const c of nodes) c.remove()
}

function unwrap(el: Element): void {
  const parent = el.parentNode
  if (!parent) return
  while (el.firstChild) parent.insertBefore(el.firstChild, el)
  parent.removeChild(el)
}

function isEffectivelyEmpty(el: Element): boolean {
  if (KEEP_EMPTY.has(el.tagName.toLowerCase()) || VOID_TAGS.has(el.tagName.toLowerCase())) {
    return false
  }
  const text = (el.textContent || '').replace(/\u00a0/g, ' ').trim()
  if (text.length > 0) return false
  if (el.querySelector('img, br, hr, input, iframe, video, audio, svg, canvas')) return false
  return true
}

function walkElements(root: Element, fn: (el: Element) => void): void {
  const list = Array.from(root.querySelectorAll('*')).reverse()
  for (const el of list) fn(el)
}

export function cleanupHtml(html: string, options: CleanupOptions): string {
  let working = html

  if (options.stripComments) {
    working = working.replace(/<!--[\s\S]*?-->/g, '')
  }

  if (options.nbspToSpace) {
    working = working.replace(/&nbsp;/gi, ' ').replace(/\u00a0/g, ' ')
  }

  const { body } = parseFragment(working)

  if (options.stripComments) {
    removeComments(body)
  }

  if (options.stripScriptsIframesJs) {
    body.querySelectorAll('script, iframe, object, embed, noscript').forEach((el) => el.remove())
    walkElements(body, (el) => {
      for (const attr of Array.from(el.attributes)) {
        if (/^on/i.test(attr.name)) el.removeAttribute(attr.name)
        if (
          (attr.name === 'href' || attr.name === 'src') &&
          /^\s*javascript:/i.test(attr.value)
        ) {
          el.removeAttribute(attr.name)
        }
      }
    })
  }

  if (options.stripForms) {
    body.querySelectorAll('form, input, textarea, select, button, fieldset, legend, label').forEach(
      (el) => {
        if (el.tagName.toLowerCase() === 'label') unwrap(el)
        else el.remove()
      },
    )
  }

  if (options.stripTables) {
    body.querySelectorAll('table').forEach((table) => {
      const text = document.createElement('p')
      text.textContent = table.textContent || ''
      table.replaceWith(text)
    })
    body.querySelectorAll('thead, tbody, tfoot, tr, td, th, caption, colgroup, col').forEach((el) => {
      if (el.isConnected) unwrap(el)
    })
  }

  if (options.stripLinks) {
    body.querySelectorAll('a').forEach((a) => unwrap(a))
  }

  walkElements(body, (el) => {
    if (options.stripAllAttributes) {
      while (el.attributes.length > 0) {
        el.removeAttribute(el.attributes[0].name)
      }
      return
    }

    if (options.stripTagIds) {
      el.removeAttribute('id')
    }

    if (options.dataAttributes) {
      for (const attr of Array.from(el.attributes)) {
        if (attr.name.startsWith('data-')) el.removeAttribute(attr.name)
      }
    }

    if (options.dirAttributes) {
      el.removeAttribute('dir')
    }

    if (options.emptyAttributes) {
      for (const attr of Array.from(el.attributes)) {
        if (attr.value.trim() === '') el.removeAttribute(attr.name)
      }
    }
  })

  if (options.emptyTags || options.tagsWithWhitespace) {
    let changed = true
    while (changed) {
      changed = false
      walkElements(body, (el) => {
        if (!el.isConnected) return
        if (options.emptyTags || options.tagsWithWhitespace) {
          if (isEffectivelyEmpty(el)) {
            el.remove()
            changed = true
          }
        }
      })
    }
  }

  let result = serializeBody(body)

  if (options.emptyNewLines) {
    result = result.replace(/(\r?\n){2,}/g, '\n').replace(/^\s+|\s+$/g, '')
  }

  if (options.indent && !options.compress) {
    result = beautifyHtml(result, {
      indent_size: 2,
      wrap_line_length: 0,
      preserve_newlines: true,
      max_preserve_newlines: 1,
      end_with_newline: false,
    })
  }

  if (options.compress) {
    result = minifyHtml(result)
  }

  return result
}

export function prettifyHtml(html: string): string {
  return beautifyHtml(html, {
    indent_size: 2,
    wrap_line_length: 0,
    preserve_newlines: true,
    max_preserve_newlines: 2,
    end_with_newline: false,
  })
}

export function minifyHtml(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\r?\n/g, '')
    .replace(/>\s+</g, '><')
    .replace(/\s{2,}/g, ' ')
    .trim()
}
