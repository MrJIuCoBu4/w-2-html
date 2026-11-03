export type PasteMode = 'keep' | 'remove' | 'ask'
export type FontSizeUnit = 'px' | 'pt'
export type TextDirection = 'ltr' | 'rtl'
export type EntityEncoding = 'named' | 'numeric' | 'raw'
export type EditorHeight = 300 | 400 | 500 | 600 | 700

/** App preferences persisted in localStorage. */
export type AppSettings = {
  pasteMode: PasteMode
  fontSizeUnit: FontSizeUnit
  compactToolbar: boolean
  imageSizeInHtml: boolean
  editorHeight: EditorHeight
  direction: TextDirection
  entityEncoding: EntityEncoding
  fullPageHtml: boolean
  autoCloseTags: boolean
  showLineNumbers: boolean
  lineWrapping: boolean
  codeFolding: boolean
  autoSaveHtml: boolean
  customCss: string
  customFontNames: string
  customFontUrls: string
  /** Header toggles (Visual editor title row). */
  mobilePreview: boolean
  showCodePane: boolean
  /** Embed images as base64 when inserting via toolbar Image button. */
  embedImages: boolean
}

export const SETTINGS_KEY = 'w2h-settings'
export const AUTO_SAVE_HTML_KEY = 'w2h-autosave-html'

export const DEFAULT_SETTINGS: AppSettings = {
  pasteMode: 'ask',
  fontSizeUnit: 'px',
  compactToolbar: true,
  imageSizeInHtml: true,
  editorHeight: 400,
  direction: 'ltr',
  entityEncoding: 'named',
  fullPageHtml: false,
  autoCloseTags: true,
  showLineNumbers: true,
  lineWrapping: true,
  codeFolding: true,
  autoSaveHtml: true,
  customCss: '',
  customFontNames: '',
  customFontUrls: '',
  mobilePreview: false,
  showCodePane: true,
  embedImages: false,
}

export const EDITOR_HEIGHTS: EditorHeight[] = [300, 400, 500, 600, 700]

function isEditorHeight(n: unknown): n is EditorHeight {
  return EDITOR_HEIGHTS.includes(n as EditorHeight)
}

export function readSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    const parsed = JSON.parse(raw) as Record<string, unknown>
    // Drop removed / legacy fields.
    const legacyKeys = [
      'theme',
      'copyAfterCleanup',
      'showCleanupOptions',
      'imagesPanelOpen',
      'editMode',
      'gotoHtmlElement',
      'foldBase64Images',
    ] as const
    let droppedLegacy = false
    for (const key of legacyKeys) {
      if (Object.prototype.hasOwnProperty.call(parsed, key)) {
        delete parsed[key]
        droppedLegacy = true
      }
    }
    const merged: AppSettings = {
      ...DEFAULT_SETTINGS,
      ...(parsed as Partial<AppSettings>),
    }
    if (!isEditorHeight(merged.editorHeight)) {
      merged.editorHeight = DEFAULT_SETTINGS.editorHeight
    }
    // Mobile preview is a session toggle — never restore it from storage so the
    // visual pane stays full-width (equal dual panes) on load.
    const needsRewrite = droppedLegacy || merged.mobilePreview
    if (merged.mobilePreview) {
      merged.mobilePreview = false
    }
    if (needsRewrite) {
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged))
      } catch {
        /* ignore */
      }
    }
    return merged
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function writeSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    /* ignore quota / private mode */
  }
}

export function readAutoSavedHtml(): string | null {
  try {
    return localStorage.getItem(AUTO_SAVE_HTML_KEY)
  } catch {
    return null
  }
}

export function writeAutoSavedHtml(html: string): void {
  try {
    localStorage.setItem(AUTO_SAVE_HTML_KEY, html)
  } catch {
    /* ignore */
  }
}

/** Parse custom font names (`Lato#Open Sans`). */
export function parseCustomFontNames(raw: string): string[] {
  return raw
    .split('#')
    .map((n) => n.trim())
    .filter(Boolean)
}

/**
 * Scope Visual Editor custom CSS under `.visual-prose`.
 * Property-only snippets become a rule; full stylesheets get selectors prefixed
 * (PRO accepts tag/class rules like `p { color: red }`).
 */
export function buildScopedCustomCss(
  css: string,
  scope = '.visual-prose',
): string {
  const trimmed = css.trim()
  if (!trimmed) return ''
  if (!trimmed.includes('{')) {
    return `${scope} {\n${trimmed}\n}`
  }
  return trimmed.replace(/(^|})\s*([^{}@]+?)\s*\{/g, (match, brace, selectors) => {
    const list = String(selectors)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (list.length === 0) return match
    // Keyframe steps — leave alone
    if (list.every((t) => t === 'from' || t === 'to' || /^\d+(\.\d+)?%$/.test(t))) {
      return match
    }
    const scoped = list
      .map((t) => {
        if (t.startsWith(scope)) return t
        if (t === ':root' || t === 'html' || t === 'body') return scope
        return `${scope} ${t}`
      })
      .join(', ')
    return `${brace}\n${scoped} {`
  })
}

/** Wrap fragment as full HTML document when preference is on. */
export function wrapFullPageHtml(bodyHtml: string): string {
  return [
    '<!DOCTYPE html>',
    '<html>',
    '<head>',
    '<meta charset="utf-8">',
    '<title></title>',
    '</head>',
    '<body>',
    bodyHtml,
    '</body>',
    '</html>',
  ].join('\n')
}

/**
 * Named entities for special symbols only (typography, currency, math, arrows).
 * Letters of any language stay UTF-8 — never &eacute; / &#1092;.
 */
const NAMED_ENTITIES: Record<number, string> = {
  0xa0: '&nbsp;',
  0xa1: '&iexcl;',
  0xa2: '&cent;',
  0xa3: '&pound;',
  0xa4: '&curren;',
  0xa5: '&yen;',
  0xa6: '&brvbar;',
  0xa7: '&sect;',
  0xa8: '&uml;',
  0xa9: '&copy;',
  0xaa: '&ordf;',
  0xab: '&laquo;',
  0xac: '&not;',
  0xad: '&shy;',
  0xae: '&reg;',
  0xaf: '&macr;',
  0xb0: '&deg;',
  0xb1: '&plusmn;',
  0xb2: '&sup2;',
  0xb3: '&sup3;',
  0xb4: '&acute;',
  0xb5: '&micro;',
  0xb6: '&para;',
  0xb7: '&middot;',
  0xb8: '&cedil;',
  0xb9: '&sup1;',
  0xba: '&ordm;',
  0xbb: '&raquo;',
  0xbc: '&frac14;',
  0xbd: '&frac12;',
  0xbe: '&frac34;',
  0xbf: '&iquest;',
  /* Latin-1 letters — French / DE / ES / IT / PT layouts */
  0xc0: '&Agrave;',
  0xc1: '&Aacute;',
  0xc2: '&Acirc;',
  0xc3: '&Atilde;',
  0xc4: '&Auml;',
  0xc5: '&Aring;',
  0xc6: '&AElig;',
  0xc7: '&Ccedil;',
  0xc8: '&Egrave;',
  0xc9: '&Eacute;',
  0xca: '&Ecirc;',
  0xcb: '&Euml;',
  0xcc: '&Igrave;',
  0xcd: '&Iacute;',
  0xce: '&Icirc;',
  0xcf: '&Iuml;',
  0xd0: '&ETH;',
  0xd1: '&Ntilde;',
  0xd2: '&Ograve;',
  0xd3: '&Oacute;',
  0xd4: '&Ocirc;',
  0xd5: '&Otilde;',
  0xd6: '&Ouml;',
  0xd7: '&times;',
  0xd8: '&Oslash;',
  0xd9: '&Ugrave;',
  0xda: '&Uacute;',
  0xdb: '&Ucirc;',
  0xdc: '&Uuml;',
  0xdd: '&Yacute;',
  0xde: '&THORN;',
  0xdf: '&szlig;',
  0xe0: '&agrave;',
  0xe1: '&aacute;',
  0xe2: '&acirc;',
  0xe3: '&atilde;',
  0xe4: '&auml;',
  0xe5: '&aring;',
  0xe6: '&aelig;',
  0xe7: '&ccedil;',
  0xe8: '&egrave;',
  0xe9: '&eacute;',
  0xea: '&ecirc;',
  0xeb: '&euml;',
  0xec: '&igrave;',
  0xed: '&iacute;',
  0xee: '&icirc;',
  0xef: '&iuml;',
  0xf0: '&eth;',
  0xf1: '&ntilde;',
  0xf2: '&ograve;',
  0xf3: '&oacute;',
  0xf4: '&ocirc;',
  0xf5: '&otilde;',
  0xf6: '&ouml;',
  0xf7: '&divide;',
  0xf8: '&oslash;',
  0xf9: '&ugrave;',
  0xfa: '&uacute;',
  0xfb: '&ucirc;',
  0xfc: '&uuml;',
  0xfd: '&yacute;',
  0xfe: '&thorn;',
  0xff: '&yuml;',
  0x152: '&OElig;',
  0x153: '&oelig;',
  0x160: '&Scaron;',
  0x161: '&scaron;',
  0x178: '&Yuml;',
  0x192: '&fnof;',
  0x3c0: '&pi;',
  0x2013: '&ndash;',
  0x2014: '&mdash;',
  0x2018: '&lsquo;',
  0x2019: '&rsquo;',
  0x201a: '&sbquo;',
  0x201c: '&ldquo;',
  0x201d: '&rdquo;',
  0x201e: '&bdquo;',
  0x2020: '&dagger;',
  0x2021: '&Dagger;',
  0x2022: '&bull;',
  0x2026: '&hellip;',
  0x2030: '&permil;',
  0x2032: '&prime;',
  0x2033: '&Prime;',
  0x2039: '&lsaquo;',
  0x203a: '&rsaquo;',
  0x20ac: '&euro;',
  0x2111: '&image;',
  0x2118: '&weierp;',
  0x211c: '&real;',
  0x2122: '&trade;',
  0x2135: '&alefsym;',
  0x2153: '&frac13;',
  0x2154: '&frac23;',
  0x2190: '&larr;',
  0x2191: '&uarr;',
  0x2192: '&rarr;',
  0x2193: '&darr;',
  0x2194: '&harr;',
  0x2195: '&varr;',
  0x21b5: '&crarr;',
  0x21d0: '&lArr;',
  0x21d1: '&uArr;',
  0x21d2: '&rArr;',
  0x21d3: '&dArr;',
  0x21d4: '&hArr;',
  0x2200: '&forall;',
  0x2202: '&part;',
  0x2203: '&exist;',
  0x2205: '&empty;',
  0x2207: '&nabla;',
  0x2208: '&isin;',
  0x2209: '&notin;',
  0x220b: '&ni;',
  0x220f: '&prod;',
  0x2211: '&sum;',
  0x2212: '&minus;',
  0x2217: '&lowast;',
  0x221a: '&radic;',
  0x221d: '&prop;',
  0x221e: '&infin;',
  0x2220: '&ang;',
  0x2227: '&and;',
  0x2228: '&or;',
  0x2229: '&cap;',
  0x222a: '&cup;',
  0x222b: '&int;',
  0x2234: '&there4;',
  0x2245: '&cong;',
  0x2248: '&asymp;',
  0x2260: '&ne;',
  0x2261: '&equiv;',
  0x2264: '&le;',
  0x2265: '&ge;',
  0x2282: '&sub;',
  0x2283: '&sup;',
  0x2284: '&nsub;',
  0x2286: '&sube;',
  0x2287: '&supe;',
  0x2295: '&oplus;',
  0x2297: '&otimes;',
  0x22a5: '&perp;',
  0x25ca: '&loz;',
}

/**
 * Letters / marks / digits of any script (Cyrillic, Latin, CJK, Arabic…).
 * Never become numeric &#…; — only named entities when one exists (é → &eacute;).
 */
function isLanguageCharacter(code: number): boolean {
  const ch = String.fromCodePoint(code)
  return /^\p{L}$/u.test(ch) || /^\p{M}$/u.test(ch) || /^\p{N}$/u.test(ch)
}

/**
 * CJK punctuation / fullwidth forms — leave as UTF-8 (no useful named entities).
 */
function isCjkSymbolCodePoint(code: number): boolean {
  return (
    (code >= 0x3000 && code <= 0x303f) || // CJK punctuation
    (code >= 0xff00 && code <= 0xffef) // Halfwidth / fullwidth forms
  )
}

/** Expand numeric `&#…;` for letters/CJK symbols back to UTF-8 (never leave &#1092;). */
function expandLanguageNumericEntities(html: string): string {
  const expand = (code: number, full: string) => {
    if (!Number.isFinite(code) || code <= 0) return full
    if (isLanguageCharacter(code) || isCjkSymbolCodePoint(code)) {
      return String.fromCodePoint(code)
    }
    return full
  }
  return html
    .replace(/&#(\d+);/g, (full, n: string) => expand(Number(n), full))
    .replace(/&#x([0-9a-fA-F]+);/g, (full, h: string) =>
      expand(Number.parseInt(h, 16), full),
    )
}

/**
 * Decode entities via DOM, then (re)encode per mode.
 * Named: FR/DE/ES letters & Western symbols → &eacute; / &copy; …
 * Letters without a named entity (RU, CJK, …) stay UTF-8 — never &#N;.
 * Numeric: symbols → &#N;; all letters stay UTF-8.
 */
export function applyEntityEncoding(
  html: string,
  mode: EntityEncoding,
): string {
  let decoded = html
  try {
    const doc = new DOMParser().parseFromString(
      `<!DOCTYPE html><html><body>${html}</body></html>`,
      'text/html',
    )
    if (!doc.querySelector('parsererror')) {
      decoded = doc.body.innerHTML
    }
  } catch {
    /* keep original */
  }
  decoded = expandLanguageNumericEntities(decoded)
  if (mode === 'raw') return decoded
  return decoded.replace(/[^\x00-\x7F]/gu, (ch) => {
    const code = ch.codePointAt(0)!
    if (isCjkSymbolCodePoint(code)) return ch
    const named = NAMED_ENTITIES[code]
    if (mode === 'named') {
      if (named) return named
      return ch
    }
    // numeric — letters never become &#N;
    if (isLanguageCharacter(code)) return ch
    return `&#${code};`
  })
}

/** Encode entities then optionally wrap as full page — toolbar Copy. */
export function formatExportHtml(
  html: string,
  settings: Pick<AppSettings, 'entityEncoding' | 'fullPageHtml'>,
): string {
  const out = applyEntityEncoding(html, settings.entityEncoding)
  if (settings.fullPageHtml) return wrapFullPageHtml(out)
  return out
}
