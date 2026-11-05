import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import type { Editor } from '@tiptap/react'
import {
  formatExportHtml,
  type EntityEncoding,
  type FontSizeUnit,
} from '../lib/settings'
import {
  FaAlignCenter,
  FaAlignJustify,
  FaAlignLeft,
  FaAlignRight,
  FaBold,
  FaCode,
  FaCopy,
  FaEllipsisV,
  FaEraser,
  FaFile,
  FaFont,
  FaImage,
  FaIndent,
  FaItalic,
  FaLink,
  FaListOl,
  FaListUl,
  FaMinus,
  FaOutdent,
  FaPaintBrush,
  FaPlus,
  FaQuoteLeft,
  FaQuoteRight,
  FaRedo,
  FaSmile,
  FaStrikethrough,
  FaSubscript,
  FaSuperscript,
  FaTable,
  FaUnderline,
  FaUndo,
  FaVideo,
  Icon,
  ICON_SIZE_SM,
} from '../icons'
import { TableInsertGrid } from './TableInsertGrid'
import {
  BULLET_LIST_STYLES,
  ORDERED_LIST_STYLES,
  type BulletListStyle,
  type OrderedListStyle,
} from '../lib/listStyles'
import { BASIC_EMOJIS, SPECIAL_CHAR_GROUPS } from '../lib/specialChars'
import { UrlInsertPopup } from './UrlInsertPopup'

type Props = {
  editor: Editor | null
  /** When true, secondary formatting stays behind More Text. */
  compact?: boolean
  fontSizeUnit?: FontSizeUnit
  /** Extra font families from Settings → Appearance. */
  customFonts?: string[]
  /** Persist natural width/height on inserted images when possible. */
  imageSizeInHtml?: boolean
  /** Prefer data-URL embeds when inserting remote images (best-effort). */
  embedImages?: boolean
  entityEncoding?: EntityEncoding
  fullPageHtml?: boolean
}

async function maybeEmbedImageUrl(url: string): Promise<string> {
  if (!url || url.startsWith('data:') || url.startsWith('blob:')) return url
  try {
    const res = await fetch(url)
    if (!res.ok) return url
    const blob = await res.blob()
    if (!blob.type.startsWith('image/')) return url
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || url))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })
  } catch {
    return url
  }
}

function loadImageNaturalSize(
  src: string,
): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const width = img.naturalWidth
      const height = img.naturalHeight
      resolve(width > 0 && height > 0 ? { width, height } : null)
    }
    img.onerror = () => resolve(null)
    img.src = src
  })
}

type MorePanel = 'text' | null
type OpenMenu =
  | 'align'
  | 'insert'
  | 'table'
  | 'fontFamily'
  | 'fontSize'
  | 'textColor'
  | 'highlight'
  | 'paragraphFormat'
  | 'lineHeight'
  | 'olStyle'
  | 'ulStyle'
  | 'specialChars'
  | 'emojis'
  | null

type UrlPopupKind = 'link' | 'image' | 'video' | null

const FONT_FAMILIES = [
  'Arial',
  'Arial Black',
  'Calibri',
  'Comic Sans MS',
  'Courier New',
  'Georgia',
  'Helvetica',
  'Impact',
  'Tahoma',
  'Times New Roman',
  'Trebuchet MS',
  'Verdana',
]

const FONT_SIZES = [
  8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 22, 24, 26, 28, 30, 36, 48,
  60, 72, 96,
]

const TEXT_COLORS = [
  '#000000',
  '#434343',
  '#666666',
  '#999999',
  '#ffffff',
  '#980000',
  '#ff0000',
  '#ff9900',
  '#ffff00',
  '#00ff00',
  '#00ffff',
  '#4a86e8',
  '#0000ff',
  '#9900ff',
  '#ff00ff',
]

const HIGHLIGHT_COLORS = [
  '#ffff00',
  '#00ff00',
  '#00ffff',
  '#ff00ff',
  '#0000ff',
  '#ff9900',
  '#ff0000',
  '#980000',
  '#cccccc',
  '#ffffff',
]

const LINE_HEIGHTS: { label: string; value: string | null }[] = [
  { label: 'Default', value: null },
  { label: 'Single', value: '1' },
  { label: '1.15', value: '1.15' },
  { label: '1.5', value: '1.5' },
  { label: 'Double', value: '2' },
]

function Btn({
  onClick,
  active,
  disabled,
  title,
  children,
  className = '',
  'aria-expanded': ariaExpanded,
  'aria-haspopup': ariaHaspopup,
  'data-testid': dataTestId,
}: {
  onClick: () => void
  active?: boolean
  disabled?: boolean
  title: string
  children: ReactNode
  className?: string
  'aria-expanded'?: boolean
  'aria-haspopup'?: boolean | 'menu' | 'listbox' | 'dialog'
  'data-testid'?: string
}) {
  return (
    <button
      type="button"
      className={`tb-btn${active ? ' is-active' : ''}${className ? ` ${className}` : ''}`}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-expanded={ariaExpanded}
      aria-haspopup={ariaHaspopup}
      data-testid={dataTestId}
    >
      {children}
    </button>
  )
}

/**
 * Paragraph Format must SET (not toggle) the block type.
 *
 * TipTap's setNode() only calls clearNodes() when *no* selected textblock can
 * become a heading. A doc-wide selection that includes a list item *and* a
 * trailing empty <p> returns canSetBlock=true (empty p converts), skips the
 * lift, and only the empty p becomes <h3> while the list title stays <p>.
 * Always clearNodes() first so list items lift, then set markup on each
 * selected textblock (skip empty blocks when applying headings).
 */
/** If caret is empty, expand to the whole current textblock so font marks apply. */
function ensureTextSelection(editor: Editor) {
  const { empty, $from } = editor.state.selection
  if (!empty) return editor.chain().focus()
  const parent = $from.parent
  if (!parent.isTextblock || parent.content.size === 0) {
    return editor.chain().focus()
  }
  const from = $from.start()
  const to = $from.end()
  return editor.chain().focus().setTextSelection({ from, to })
}

function applyParagraphFormat(
  editor: Editor,
  format: 'paragraph' | 1 | 2 | 3 | 4,
) {
  return editor
    .chain()
    .focus()
    .clearNodes()
    .command(({ tr, dispatch }) => {
      if (!dispatch) return true
      const type =
        format === 'paragraph'
          ? tr.doc.type.schema.nodes.paragraph
          : tr.doc.type.schema.nodes.heading
      if (!type) return false
      const attrs = format === 'paragraph' ? {} : { level: format }

      const { from, to } = tr.selection
      const targets: number[] = []
      tr.doc.nodesBetween(from, to, (node, pos) => {
        if (!node.isTextblock) return
        if (node.type.name !== 'paragraph' && node.type.name !== 'heading') return
        // Don't turn TipTap's trailing empty <p> into an empty <hN>.
        if (format !== 'paragraph' && node.content.size === 0) return
        targets.push(pos)
      })

      if (targets.length === 0) {
        const $from = tr.selection.$from
        for (let d = $from.depth; d > 0; d--) {
          const node = $from.node(d)
          if (node.isTextblock) {
            targets.push($from.before(d))
            break
          }
        }
      }

      for (const pos of targets) {
        const node = tr.doc.nodeAt(pos)
        if (!node) continue
        const nextAttrs =
          format === 'paragraph'
            ? { ...node.attrs, indent: node.attrs.indent ?? 0 }
            : { ...node.attrs, ...attrs }
        tr.setNodeMarkup(pos, type, nextAttrs)
      }
      dispatch(tr)
      return true
    })
    .run()
}

function Menu({
  open,
  onClose,
  children,
  className = '',
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  className?: string
}) {
  const hostRef = useRef<HTMLSpanElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [coords, setCoords] = useState<{
    top: number
    left: number
    minWidth: number
  } | null>(null)
  // Drop stale coordinates as soon as `open` flips, during render.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    setCoords(null)
  }

  const place = useCallback(() => {
    const dropdown = hostRef.current?.closest('.tb-dropdown') as HTMLElement | null
    const trigger =
      (dropdown?.querySelector(':scope > .tb-btn') as HTMLElement | null) ?? dropdown
    if (!trigger) return
    const r = trigger.getBoundingClientRect()
    const menuW = Math.max(
      r.width,
      className.includes('tb-menu--table-insert')
        ? 186
        : className.includes('tb-menu--swatches')
          ? /* 5×22px + gaps + menu pad ≈ 134; place() only needs a floor */
            134
          : className.includes('tb-menu--picker')
            ? 360
          : className.includes('tb-menu--paragraph-format')
            ? 168
            : className.includes('tb-menu--align') || className.includes('tb-menu--list')
              ? r.width
              : 140,
    )
    let left = Math.min(r.left, window.innerWidth - menuW - 8)
    left = Math.max(8, left)
    let top = r.bottom + 2
    const estimatedH = className.includes('tb-menu--picker')
      ? Math.min(560, window.innerHeight - 32)
      : className.includes('tb-menu--scroll')
        ? 240
        : 200
    if (top + estimatedH > window.innerHeight - 8 && r.top > estimatedH + 8) {
      top = Math.max(8, r.top - estimatedH - 2)
    }
    setCoords({ top, left, minWidth: menuW })
  }, [className])

  useLayoutEffect(() => {
    if (!open) return
    // Measure after commit, then position: setState must not run synchronously
    // inside the effect (it would cascade an extra render before paint).
    queueMicrotask(place)
  }, [open, place, children])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (menuRef.current?.contains(t)) return
      const dropdown = hostRef.current?.closest('.tb-dropdown')
      if (dropdown?.contains(t)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const onReposition = () => place()
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onReposition)
    window.addEventListener('scroll', onReposition, true)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onReposition)
      window.removeEventListener('scroll', onReposition, true)
    }
  }, [open, onClose, place])

  return (
    <>
      <span ref={hostRef} className="tb-menu-host" hidden aria-hidden />
      {open && coords
        ? createPortal(
            <div
              ref={menuRef}
              className={`tb-menu tb-menu--portal${className ? ` ${className}` : ''}`}
              role="menu"
              style={{
                position: 'fixed',
                top: coords.top,
                left: coords.left,
                // Hug-content menus: CSS width:max-content — inline minWidth
                // was forcing empty slack.
                ...(className.includes('tb-menu--align') ||
                className.includes('tb-menu--list') ||
                className.includes('tb-menu--paragraph-format') ||
                className.includes('tb-menu--swatches')
                  ? {}
                  : { minWidth: coords.minWidth }),
                zIndex: 2000,
              }}
              onMouseDown={(e) => e.preventDefault()}
            >
              {children}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}

export function Toolbar({
  editor,
  compact = true,
  fontSizeUnit = 'px',
  customFonts = [],
  imageSizeInHtml = true,
  embedImages = false,
  entityEncoding = 'named',
  fullPageHtml = false,
}: Props) {
  const [moreState, setMoreState] = useState<MorePanel>(null)
  // Full toolbar always shows the text row, so a stored panel is ignored there.
  const more = compact ? moreState : null
  const [menu, setMenu] = useState<OpenMenu>(null)
  const [urlPopup, setUrlPopup] = useState<UrlPopupKind>(null)
  const [toast, setToast] = useState<{
    text: string
    ok: boolean
    leaving?: boolean
  } | null>(null)
  const toastGen = useRef(0)
  const [, setTick] = useState(0)

  useEffect(() => {
    if (!toast || toast.leaving) return
    const gen = toastGen.current
    const hold = window.setTimeout(() => {
      if (toastGen.current !== gen) return
      setToast((t) => (t ? { ...t, leaving: true } : null))
    }, 1800)
    return () => window.clearTimeout(hold)
  }, [toast])

  useEffect(() => {
    if (!editor) return
    const bump = () => setTick((t) => t + 1)
    editor.on('selectionUpdate', bump)
    editor.on('transaction', bump)
    return () => {
      editor.off('selectionUpdate', bump)
      editor.off('transaction', bump)
    }
  }, [editor])

  const textOpen = compact ? more === 'text' : true

  const closeMenu = useCallback(() => setMenu(null), [])

  const toggleMore = (panel: MorePanel) => {
    setMenu(null)
    setMoreState((prev) => (prev === panel ? null : panel))
  }

  const toggleMenu = (id: OpenMenu) => {
    setMenu((prev) => (prev === id ? null : id))
  }

  if (!editor) {
    return <div className="toolbar toolbar--disabled" />
  }

  const openLinkPopup = () => setUrlPopup('link')
  const openImagePopup = () => setUrlPopup('image')
  const openVideoPopup = () => {
    setMenu(null)
    setUrlPopup('video')
  }

  const insertTable = (rows: number, cols: number) => {
    editor
      .chain()
      .focus()
      .insertTable({ rows, cols, withHeaderRow: false })
      .run()
    closeMenu()
  }

  const insertHr = () => {
    editor.chain().focus().setHorizontalRule().run()
    setMenu(null)
  }

  const insertChar = (ch: string) => {
    editor.chain().focus().insertContent(ch).run()
  }

  const clearDoc = () => {
    if (!window.confirm('Clear the document?')) return
    editor.commands.clearContent(true)
  }

  const copyHtml = async () => {
    toastGen.current += 1
    try {
      const payload = formatExportHtml(editor.getHTML(), {
        entityEncoding,
        fullPageHtml,
      })
      await navigator.clipboard.writeText(payload)
      setToast({ text: 'HTML copied to clipboard', ok: true })
    } catch {
      setToast({ text: 'Could not copy HTML', ok: false })
    }
    setMenu(null)
  }

  const quoteIncrease = () => {
    editor.chain().focus().wrapIn('blockquote').run()
  }

  const quoteDecrease = () => {
    editor.chain().focus().lift('blockquote').run()
  }

  const currentFont = (
    (editor.getAttributes('textStyle').fontFamily as string | undefined) ||
    'Times New Roman'
  ).replace(/^["']|["']$/g, '')
  const currentSizeRaw = editor.getAttributes('textStyle').fontSize as string | undefined
  const currentSize = currentSizeRaw ? parseInt(currentSizeRaw, 10) : 16

  const paragraphFormatLabel = (() => {
    if (editor.isActive('heading', { level: 1 })) return 'Heading 1'
    if (editor.isActive('heading', { level: 2 })) return 'Heading 2'
    if (editor.isActive('heading', { level: 3 })) return 'Heading 3'
    if (editor.isActive('heading', { level: 4 })) return 'Heading 4'
    if (editor.isActive('codeBlock')) return 'Code'
    if (editor.isActive('blockquote')) return 'Blockquote'
    return 'Normal'
  })()

  const indentLevel =
    (editor.isActive('heading')
      ? (editor.getAttributes('heading').indent as number)
      : (editor.getAttributes('paragraph').indent as number)) || 0

  const linkHref = (editor.getAttributes('link').href as string | undefined) || 'https://'

  const textMarkButtons = (
    <>
      <Btn
        title="Italic (Ctrl+I)"
        active={editor.isActive('italic')}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Icon i={FaItalic} />
      </Btn>
      <Btn
        title="Underline (Ctrl+U)"
        active={editor.isActive('underline')}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <Icon i={FaUnderline} />
      </Btn>
      <Btn
        title="Strikethrough"
        active={editor.isActive('strike')}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <Icon i={FaStrikethrough} />
      </Btn>
    </>
  )

  return (
    <div className={`toolbar-stack${compact ? '' : ' toolbar-stack--full'}`}>
      <div className="toolbar toolbar-row" role="toolbar" aria-label="Formatting">
        <Btn title="New Document" onClick={clearDoc}>
          <span className="tb-new-icon" aria-hidden>
            <Icon i={FaFile} />
            <Icon i={FaPlus} size={ICON_SIZE_SM} className="tb-new-plus" />
          </span>
        </Btn>
        <Btn
          title="Bold (Ctrl+B)"
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Icon i={FaBold} />
        </Btn>
        {!compact ? textMarkButtons : null}
        {compact ? (
          <Btn
            title="More Text"
            active={more === 'text'}
            aria-expanded={more === 'text'}
            aria-haspopup="menu"
            onClick={() => toggleMore('text')}
            className="tb-more-btn"
            data-testid="more-text"
          >
            <span className="tb-more-glyph" aria-hidden>
              <Icon i={FaFont} />
              <Icon i={FaEllipsisV} size={ICON_SIZE_SM} className="tb-more-dots-icon" />
            </span>
          </Btn>
        ) : null}

        <span className="tb-sep" />

        <div className="tb-dropdown">
          <Btn
            title="Align"
            active={menu === 'align'}
            aria-expanded={menu === 'align'}
            aria-haspopup="menu"
            onClick={() => toggleMenu('align')}
          >
            <Icon i={FaAlignLeft} />
            <span className="tb-caret" aria-hidden>
              ▾
            </span>
          </Btn>
          <Menu open={menu === 'align'} onClose={closeMenu} className="tb-menu--align">
            {(
              [
                ['left', FaAlignLeft, 'Align left'],
                ['center', FaAlignCenter, 'Align center'],
                ['right', FaAlignRight, 'Align right'],
                ['justify', FaAlignJustify, 'Justify'],
              ] as const
            ).map(([align, AlignIcon, label]) => (
              <button
                key={align}
                type="button"
                role="menuitem"
                className={`tb-menu-item${editor.isActive({ textAlign: align }) ? ' is-active' : ''}`}
                onClick={() => {
                  editor.chain().focus().setTextAlign(align).run()
                  closeMenu()
                }}
              >
                <Icon i={AlignIcon} /> {label}
              </button>
            ))}
          </Menu>
        </div>

        <div className="tb-dropdown">
          <Btn
            title="Ordered List"
            active={editor.isActive('orderedList') || menu === 'olStyle'}
            aria-expanded={menu === 'olStyle'}
            aria-haspopup="menu"
            onClick={() => toggleMenu('olStyle')}
            data-testid="ordered-list"
          >
            <Icon i={FaListOl} />
            <span className="tb-caret" aria-hidden>
              ▾
            </span>
          </Btn>
          <Menu open={menu === 'olStyle'} onClose={closeMenu} className="tb-menu--list">
            {editor.isActive('orderedList') ? (
              <button
                type="button"
                role="menuitem"
                className="tb-menu-item"
                data-testid="ol-remove"
                onClick={() => {
                  editor.chain().focus().toggleOrderedList().run()
                  closeMenu()
                }}
              >
                Remove list
              </button>
            ) : null}
            {ORDERED_LIST_STYLES.map(({ label, value }) => {
              const sample =
                value === 'lower-alpha'
                  ? 'a.'
                  : value === 'upper-alpha'
                    ? 'A.'
                    : value === 'lower-greek'
                      ? 'α.'
                      : value === 'lower-roman'
                        ? 'i.'
                        : value === 'upper-roman'
                          ? 'I.'
                          : '1.'
              return (
                <button
                  key={value}
                  type="button"
                  role="menuitem"
                  className="tb-menu-item tb-menu-item--list-style"
                  data-testid={`ol-style-${value}`}
                  onClick={() => {
                    editor.commands.setOrderedListStyle(value as OrderedListStyle)
                    closeMenu()
                  }}
                >
                  <span className="tb-ol-sample" aria-hidden>
                    {sample}
                  </span>
                  {label}
                </button>
              )
            })}
          </Menu>
        </div>

        <div className="tb-dropdown">
          <Btn
            title="Unordered List"
            active={editor.isActive('bulletList') || menu === 'ulStyle'}
            aria-expanded={menu === 'ulStyle'}
            aria-haspopup="menu"
            onClick={() => toggleMenu('ulStyle')}
            data-testid="unordered-list"
          >
            <Icon i={FaListUl} />
            <span className="tb-caret" aria-hidden>
              ▾
            </span>
          </Btn>
          <Menu open={menu === 'ulStyle'} onClose={closeMenu} className="tb-menu--list">
            {editor.isActive('bulletList') ? (
              <button
                type="button"
                role="menuitem"
                className="tb-menu-item"
                data-testid="ul-remove"
                onClick={() => {
                  editor.chain().focus().toggleBulletList().run()
                  closeMenu()
                }}
              >
                Remove list
              </button>
            ) : null}
            {BULLET_LIST_STYLES.map(({ label, value }) => (
              <button
                key={value}
                type="button"
                role="menuitem"
                className="tb-menu-item tb-menu-item--list-style"
                data-testid={`ul-style-${value}`}
                onClick={() => {
                  editor.commands.setBulletListStyle(value as BulletListStyle)
                  closeMenu()
                }}
              >
                <span
                  className={`tb-list-marker tb-list-marker--${value === 'default' ? 'default' : value}`}
                  aria-hidden
                />
                {label}
              </button>
            ))}
          </Menu>
        </div>

        <span className="tb-sep" />

        <Btn
          title="Insert Link"
          active={editor.isActive('link') || urlPopup === 'link'}
          onClick={openLinkPopup}
          data-testid="insert-link"
        >
          <Icon i={FaLink} />
        </Btn>
        <Btn title="Insert Image" onClick={openImagePopup} data-testid="insert-image">
          <Icon i={FaImage} />
        </Btn>
        <div className="tb-dropdown">
          <Btn
            title="Insert Table"
            active={menu === 'table'}
            aria-expanded={menu === 'table'}
            aria-haspopup="menu"
            onClick={() => toggleMenu('table')}
            data-testid="insert-table"
          >
            <Icon i={FaTable} />
          </Btn>
          <Menu
            open={menu === 'table'}
            onClose={closeMenu}
            className="tb-menu--table-insert"
          >
            <TableInsertGrid onPick={insertTable} />
          </Menu>
        </div>

        <div className="tb-dropdown">
          <Btn
            title="More Rich"
            active={menu === 'insert'}
            aria-expanded={menu === 'insert'}
            aria-haspopup="menu"
            onClick={() => toggleMenu('insert')}
            className="tb-more-btn"
            data-testid="more-rich"
          >
            <span className="tb-more-rich-icon" aria-hidden>
              <Icon i={FaPlus} />
              <Icon i={FaEllipsisV} size={ICON_SIZE_SM} className="tb-more-dots-icon" />
            </span>
          </Btn>
          <Menu open={menu === 'insert'} onClose={closeMenu} className="tb-menu--rich">
            <button
              type="button"
              role="menuitem"
              className="tb-menu-item"
              data-testid="insert-video"
              onClick={openVideoPopup}
            >
              <Icon i={FaVideo} /> Insert Video
            </button>
            <button
              type="button"
              role="menuitem"
              className="tb-menu-item"
              data-testid="insert-hr"
              onClick={insertHr}
            >
              <Icon i={FaMinus} /> Horizontal line
            </button>
            <button
              type="button"
              role="menuitem"
              className="tb-menu-item"
              onClick={() => {
                editor.chain().focus().toggleCodeBlock().run()
                closeMenu()
              }}
            >
              <Icon i={FaCode} /> Code block
            </button>
            <button
              type="button"
              role="menuitem"
              className="tb-menu-item"
              data-testid="special-chars"
              onClick={() => {
                setMenu('specialChars')
              }}
            >
              Ω Special Characters
            </button>
            <button
              type="button"
              role="menuitem"
              className="tb-menu-item"
              data-testid="emojis"
              onClick={() => {
                setMenu('emojis')
              }}
            >
              <Icon i={FaSmile} /> Emojis
            </button>
          </Menu>
          <Menu
            open={menu === 'specialChars'}
            onClose={closeMenu}
            className="tb-menu--picker"
          >
            {SPECIAL_CHAR_GROUPS.map((group) => (
              <div key={group.title} className="tb-picker-group">
                <div className="tb-picker-title">{group.title}</div>
                <div className="tb-picker-grid">
                  {group.chars.map((ch) => (
                    <button
                      key={`${group.title}-${ch.codePointAt(0)}`}
                      type="button"
                      className="tb-picker-cell"
                      title={`${ch} (U+${(ch.codePointAt(0) ?? 0).toString(16).toUpperCase()})`}
                      onClick={() => {
                        insertChar(ch)
                        closeMenu()
                      }}
                    >
                      {ch}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </Menu>
          <Menu open={menu === 'emojis'} onClose={closeMenu} className="tb-menu--picker">
            <div className="tb-picker-grid tb-picker-grid--emoji">
              {BASIC_EMOJIS.map((ch) => (
                <button
                  key={ch}
                  type="button"
                  className="tb-picker-cell"
                  title={ch}
                  onClick={() => {
                    insertChar(ch)
                    closeMenu()
                  }}
                >
                  {ch}
                </button>
              ))}
            </div>
          </Menu>
        </div>

        <span className="tb-sep" />

        <Btn
          title="Undo (Ctrl+Z)"
          disabled={!editor.can().undo()}
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Icon i={FaUndo} className="tb-icon-balance" />
        </Btn>
        <Btn
          title="Redo (Ctrl+Shift+Z)"
          disabled={!editor.can().redo()}
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Icon i={FaRedo} className="tb-icon-balance" />
        </Btn>
        <Btn
          title="Copy HTML"
          onClick={() => void copyHtml()}
          className="tb-hide-narrow"
        >
          <Icon i={FaCopy} className="tb-icon-balance" />
        </Btn>
      </div>

      <div
        className={`toolbar-more-wrap${textOpen ? ' is-open' : ''}`}
        data-testid="more-text-panel"
        aria-hidden={!textOpen}
        {...(!textOpen ? { inert: true } : {})}
      >
        <div className="toolbar-more-clip">
        <div
          className="toolbar toolbar-row toolbar-more"
          role="toolbar"
          aria-label="More Text"
        >
          {compact ? textMarkButtons : null}
          <Btn
            title="Subscript"
            active={editor.isActive('subscript')}
            onClick={() => editor.chain().focus().toggleSubscript().run()}
          >
            <Icon i={FaSubscript} />
          </Btn>
          <Btn
            title="Superscript"
            active={editor.isActive('superscript')}
            onClick={() => editor.chain().focus().toggleSuperscript().run()}
          >
            <Icon i={FaSuperscript} />
          </Btn>

          <div className="tb-dropdown">
            <Btn
              title="Font Family"
              active={menu === 'fontFamily'}
              aria-expanded={menu === 'fontFamily'}
              aria-haspopup="listbox"
              onClick={() => toggleMenu('fontFamily')}
              className="tb-btn--wide"
            >
              <span className="tb-select-label">{currentFont}</span>
              <span className="tb-caret" aria-hidden>
                ▾
              </span>
            </Btn>
            <Menu open={menu === 'fontFamily'} onClose={closeMenu} className="tb-menu--scroll">
              <button
                type="button"
                role="menuitem"
                className="tb-menu-item"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  ensureTextSelection(editor).unsetFontFamily().run()
                  closeMenu()
                }}
              >
                Default
              </button>
              {[
                ...customFonts.filter(
                  (f) => !FONT_FAMILIES.some((b) => b.toLowerCase() === f.toLowerCase()),
                ),
                ...FONT_FAMILIES,
              ].map((font) => (
                <button
                  key={font}
                  type="button"
                  role="menuitem"
                  className={`tb-menu-item tb-menu-item--font${currentFont === font ? ' is-active' : ''}`}
                  style={{ fontFamily: `"${font}", sans-serif` }}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    // Quote multi-word families so CSS + TipTap validation accept them.
                    const value = /\s/.test(font) ? `"${font}"` : font
                    ensureTextSelection(editor).setFontFamily(value).run()
                    closeMenu()
                  }}
                >
                  <span className="tb-font-preview" style={{ fontFamily: `"${font}", sans-serif` }}>
                    Aa
                  </span>
                  <span>{font}</span>
                </button>
              ))}
            </Menu>
          </div>

          <div className="tb-dropdown">
            <Btn
              title={`Font Size (${fontSizeUnit})`}
              active={menu === 'fontSize'}
              aria-expanded={menu === 'fontSize'}
              aria-haspopup="listbox"
              onClick={() => toggleMenu('fontSize')}
              className="tb-btn--size"
            >
              <span className="tb-select-label">
                {currentSize}
                {fontSizeUnit}
              </span>
              <span className="tb-caret" aria-hidden>
                ▾
              </span>
            </Btn>
            <Menu open={menu === 'fontSize'} onClose={closeMenu} className="tb-menu--scroll">
              {FONT_SIZES.map((size) => (
                <button
                  key={size}
                  type="button"
                  role="menuitem"
                  className={`tb-menu-item tb-menu-item--size${currentSize === size ? ' is-active' : ''}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    ensureTextSelection(editor)
                      .setFontSize(`${size}${fontSizeUnit}`)
                      .run()
                    closeMenu()
                  }}
                >
                  <span style={{ fontSize: `${Math.min(size, 22)}${fontSizeUnit}` }}>
                    {size}
                    {fontSizeUnit}
                  </span>
                </button>
              ))}
            </Menu>
          </div>

          <div className="tb-dropdown">
            <Btn
              title="Paragraph Format"
              active={menu === 'paragraphFormat'}
              aria-expanded={menu === 'paragraphFormat'}
              aria-haspopup="listbox"
              onClick={() => toggleMenu('paragraphFormat')}
              className="tb-btn--wide"
            >
              <span className="tb-select-label">{paragraphFormatLabel}</span>
              <span className="tb-caret" aria-hidden>
                ▾
              </span>
            </Btn>
            <Menu
              open={menu === 'paragraphFormat'}
              onClose={closeMenu}
              className="tb-menu--paragraph-format"
            >
              <button
                type="button"
                role="menuitem"
                className={`tb-menu-item tb-menu-item--pf tb-menu-item--pf-normal${
                  !editor.isActive('heading') &&
                  !editor.isActive('codeBlock') &&
                  !editor.isActive('blockquote')
                    ? ' is-active'
                    : ''
                }`}
                onClick={() => {
                  applyParagraphFormat(editor, 'paragraph')
                  closeMenu()
                }}
              >
                Normal
              </button>
              {([1, 2, 3, 4] as const).map((level) => (
                <button
                  key={level}
                  type="button"
                  role="menuitem"
                  className={`tb-menu-item tb-menu-item--pf tb-menu-item--pf-h${level}${
                    editor.isActive('heading', { level }) ? ' is-active' : ''
                  }`}
                  onClick={() => {
                    applyParagraphFormat(editor, level)
                    closeMenu()
                  }}
                >
                  Heading {level}
                </button>
              ))}
              <button
                type="button"
                role="menuitem"
                className={`tb-menu-item tb-menu-item--pf tb-menu-item--pf-code${
                  editor.isActive('codeBlock') ? ' is-active' : ''
                }`}
                onClick={() => {
                  editor.chain().focus().toggleCodeBlock().run()
                  closeMenu()
                }}
              >
                Code
              </button>
              <button
                type="button"
                role="menuitem"
                className={`tb-menu-item tb-menu-item--pf tb-menu-item--pf-quote${
                  editor.isActive('blockquote') ? ' is-active' : ''
                }`}
                onClick={() => {
                  editor.chain().focus().toggleBlockquote().run()
                  closeMenu()
                }}
              >
                Blockquote
              </button>
            </Menu>
          </div>

          <div className="tb-dropdown">
            <Btn
              title="Line Height"
              active={menu === 'lineHeight'}
              aria-expanded={menu === 'lineHeight'}
              aria-haspopup="listbox"
              onClick={() => toggleMenu('lineHeight')}
            >
              <span className="tb-lineheight-icon" aria-hidden>
                ⇕
              </span>
            </Btn>
            <Menu open={menu === 'lineHeight'} onClose={closeMenu}>
              {LINE_HEIGHTS.map(({ label, value }) => (
                <button
                  key={label}
                  type="button"
                  role="menuitem"
                  className="tb-menu-item"
                  onClick={() => {
                    if (value === null) {
                      editor.chain().focus().unsetBlockLineHeight().run()
                    } else {
                      editor.chain().focus().setBlockLineHeight(value).run()
                    }
                    closeMenu()
                  }}
                >
                  {label}
                </button>
              ))}
            </Menu>
          </div>

          <Btn
            title="Decrease Indent"
            disabled={indentLevel <= 0 && !editor.can().liftListItem('listItem')}
            onClick={() => editor.chain().focus().outdent().run()}
          >
            <Icon i={FaOutdent} />
          </Btn>
          <Btn title="Increase Indent" onClick={() => editor.chain().focus().indent().run()}>
            <Icon i={FaIndent} />
          </Btn>

          <Btn
            title="Decrease Quote"
            disabled={!editor.isActive('blockquote')}
            onClick={quoteDecrease}
            data-testid="blockquote-decrease"
          >
            <Icon i={FaQuoteLeft} />
          </Btn>
          <Btn
            title="Increase Quote"
            active={editor.isActive('blockquote')}
            onClick={quoteIncrease}
            data-testid="blockquote-increase"
          >
            <Icon i={FaQuoteRight} />
          </Btn>

          <span className="tb-sep" />

          <div className="tb-dropdown">
            <Btn
              title="Text Color"
              active={menu === 'textColor'}
              aria-expanded={menu === 'textColor'}
              aria-haspopup="dialog"
              onClick={() => toggleMenu('textColor')}
            >
              <span className="tb-color-btn" aria-hidden>
                A
                <span
                  className="tb-color-bar"
                  style={{
                    background:
                      (editor.getAttributes('textStyle').color as string) || '#000',
                  }}
                />
              </span>
            </Btn>
            <Menu open={menu === 'textColor'} onClose={closeMenu} className="tb-menu--swatches">
              <button
                type="button"
                className="tb-menu-item"
                onClick={() => {
                  editor.chain().focus().unsetColor().run()
                  closeMenu()
                }}
              >
                Remove color
              </button>
              <div className="tb-swatches">
                {TEXT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className="tb-swatch"
                    style={{ background: c }}
                    title={c}
                    aria-label={c}
                    onClick={() => {
                      editor.chain().focus().setColor(c).run()
                      closeMenu()
                    }}
                  />
                ))}
              </div>
            </Menu>
          </div>

          <div className="tb-dropdown">
            <Btn
              title="Background Color"
              active={menu === 'highlight' || editor.isActive('highlight')}
              aria-expanded={menu === 'highlight'}
              aria-haspopup="dialog"
              onClick={() => toggleMenu('highlight')}
            >
              <Icon i={FaPaintBrush} />
            </Btn>
            <Menu open={menu === 'highlight'} onClose={closeMenu} className="tb-menu--swatches">
              <button
                type="button"
                className="tb-menu-item"
                onClick={() => {
                  editor.chain().focus().unsetHighlight().run()
                  closeMenu()
                }}
              >
                Remove highlight
              </button>
              <div className="tb-swatches">
                {HIGHLIGHT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className="tb-swatch"
                    style={{ background: c }}
                    title={c}
                    aria-label={c}
                    onClick={() => {
                      editor.chain().focus().toggleHighlight({ color: c }).run()
                      closeMenu()
                    }}
                  />
                ))}
              </div>
            </Menu>
          </div>

          <Btn
            title="Clear Formatting"
            onClick={() => {
              // PRO: clear colors/fonts/extras — keep headings, bold, and links.
              // Never clearNodes() / unsetBold() — that removed <h3> / <strong>.
              if (editor.state.selection.empty) {
                editor.commands.selectAll()
              }
              editor
                .chain()
                .focus()
                .unsetItalic()
                .unsetUnderline()
                .unsetStrike()
                .unsetCode()
                .unsetColor()
                .unsetHighlight()
                .unsetFontFamily()
                .unsetFontSize()
                .unsetSubscript()
                .unsetSuperscript()
                .run()
              editor.commands.unsetBlockLineHeight()
              const { state } = editor
              const { from, to } = state.selection
              let tr = state.tr
              let changed = false
              state.doc.nodesBetween(from, to, (node, pos) => {
                if (
                  node.type.name !== 'paragraph' &&
                  node.type.name !== 'heading' &&
                  node.type.name !== 'listItem'
                ) {
                  return
                }
                const indent = Number(node.attrs.indent) || 0
                const hasLine = Boolean(node.attrs.lineHeight)
                if (indent === 0 && !hasLine) return
                const next: Record<string, unknown> = { ...node.attrs, indent: 0 }
                if ('lineHeight' in node.attrs) next.lineHeight = null
                tr = tr.setNodeMarkup(pos, undefined, next)
                changed = true
              })
              if (changed) editor.view.dispatch(tr)
            }}
            data-testid="clear-formatting"
          >
            <Icon i={FaEraser} />
          </Btn>
        </div>
        </div>
      </div>

      <UrlInsertPopup
        open={urlPopup === 'link'}
        title="Insert Link"
        initialValue={linkHref}
        allowEmpty
        emptyHint="Leave empty to remove the link."
        confirmLabel={editor.isActive('link') ? 'Update' : 'Insert'}
        testId="link-popup"
        onClose={() => setUrlPopup(null)}
        onConfirm={(url) => {
          if (!url) {
            editor.chain().focus().extendMarkRange('link').unsetLink().run()
          } else {
            editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
          }
          setUrlPopup(null)
        }}
      />
      <UrlInsertPopup
        open={urlPopup === 'image'}
        title="Insert Image"
        confirmLabel="Insert"
        testId="image-popup"
        onClose={() => setUrlPopup(null)}
        onConfirm={(url) => {
          void (async () => {
            if (!url || !editor) {
              setUrlPopup(null)
              return
            }
            let src = url
            if (embedImages) {
              src = await maybeEmbedImageUrl(url)
            }
            const attrs: { src: string; width?: number; height?: number } = { src }
            if (imageSizeInHtml) {
              const size = await loadImageNaturalSize(src)
              if (size) {
                attrs.width = size.width
                attrs.height = size.height
              }
            }
            editor.chain().focus().setImage(attrs).run()
            setUrlPopup(null)
          })()
        }}
      />
      <UrlInsertPopup
        open={urlPopup === 'video'}
        title="Insert Video"
        label="Video URL"
        placeholder="https://www.youtube.com/watch?v=…"
        confirmLabel="Insert"
        testId="video-popup"
        onClose={() => setUrlPopup(null)}
        onConfirm={(url) => {
          if (url) editor.chain().focus().setIframeVideo({ src: url }).run()
          setUrlPopup(null)
        }}
      />

      {toast
        ? createPortal(
            <div
              className={`app-toast${toast.ok ? ' app-toast--ok' : ' app-toast--err'}${
                toast.leaving ? ' app-toast--out' : ''
              }`}
              role="status"
              aria-live="polite"
              data-testid="copy-toast"
              onAnimationEnd={(e) => {
                if (e.animationName !== 'app-toast-out') return
                setToast(null)
              }}
            >
              {toast.text}
            </div>,
            document.body,
          )
        : null}

    </div>
  )
}
