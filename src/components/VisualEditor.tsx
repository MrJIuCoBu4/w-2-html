import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { ListItem } from '@tiptap/extension-list'
import Image from '@tiptap/extension-image'
import TextAlign from '@tiptap/extension-text-align'
import Placeholder from '@tiptap/extension-placeholder'
import { TableKit } from '@tiptap/extension-table'
import { TableCellWithBg, TableHeaderWithBg } from '../lib/tableCellBg'
import { TextStyleKit } from '@tiptap/extension-text-style'
import Highlight from '@tiptap/extension-highlight'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import type { Editor } from '@tiptap/react'
import {
  FaCode,
  FaCog,
  FaMobileAlt,
  FaSlidersH,
  Icon,
  ICON_SIZE_MD,
  type IconType,
} from '../icons'
import { Toolbar } from './Toolbar'
import { PasteAskModal } from './PasteAskModal'
import { TableBubbleToolbar } from './TableBubbleToolbar'
import { Indent } from '../lib/indent'
import { BlockLineHeight } from '../lib/blockLineHeight'
import { IframeVideo } from '../lib/iframeVideo'
import { ListStyles } from '../lib/listStyles'
import {
  cleanWordPaste,
  clipboardHasImageFiles,
  countChars,
  countWords,
  emptyParagraphsForEditor,
  htmlEquals,
  looksLikeWordHtml,
  prepareHtmlForEditor,
  serializeVisualHtml,
  stripNoopSpanStyles,
  stripPastedImages,
} from '../lib/sync'
import {
  buildScopedCustomCss,
  parseCustomFontNames,
  type AppSettings,
} from '../lib/settings'

/** Enter splits items; Tab / Shift-Tab owned solely by Indent (one level per press). */
const ListItemKeys = ListItem.extend({
  addKeyboardShortcuts() {
    return {
      Enter: () => this.editor.commands.splitListItem(this.name),
    }
  },
})

type Props = {
  html: string
  onChange: (html: string) => void
  settings: AppSettings
  onSettingsChange: (patch: Partial<AppSettings>) => void
  onOpenSettings: () => void
  onEditorReady?: (editor: Editor | null) => void
}

type HeaderToggleKey = 'compactToolbar' | 'mobilePreview' | 'showCodePane'

const HEADER_TOGGLES: {
  key: HeaderToggleKey
  title: string
  icon: IconType
}[] = [
  {
    key: 'compactToolbar',
    title: 'Compact toolbar (on = More Text row)',
    icon: FaSlidersH,
  },
  { key: 'mobilePreview', title: 'Switch mobile view', icon: FaMobileAlt },
  { key: 'showCodePane', title: 'Show or hide code editor', icon: FaCode },
]

export function VisualEditor({
  html,
  onChange,
  settings,
  onSettingsChange,
  onOpenSettings,
  onEditorReady,
}: Props) {
  const settingsRef = useRef(settings)
  // Mirror settings for paste handlers; layout effects run before any user event.
  useLayoutEffect(() => {
    settingsRef.current = settings
  }, [settings])
  const editorRef = useRef<Editor | null>(null)
  const styleTagRef = useRef<HTMLStyleElement | null>(null)
  const fontLinksRef = useRef<HTMLLinkElement[]>([])
  const [pastePending, setPastePending] = useState<string | null>(null)
  const pasteInsertPos = useRef<number | null>(null)

  const insertPasteHtml = useCallback((ed: Editor, fragment: string) => {
    const pos = pasteInsertPos.current
    pasteInsertPos.current = null
    // Empty <p><br></p> → <p></p> so TipTap doesn't render hardBreak + trailingBreak (2 lines).
    const safe = emptyParagraphsForEditor(fragment)
    if (pos != null) {
      ed.chain().focus().insertContentAt(pos, safe).run()
    } else {
      ed.chain().focus().insertContent(safe).run()
    }
  }, [])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
        listItem: false,
        link: {
          openOnClick: false,
          HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
        },
      }),
      ListItemKeys,
      Image.configure({ allowBase64: true }),
      TextAlign.configure({
        types: ['heading', 'paragraph', 'tableCell', 'tableHeader'],
      }),
      Placeholder.configure({
        placeholder: 'Start by typing or pasting your text into the editor…',
      }),
      TableKit.configure({
        table: {
          resizable: false,
          HTMLAttributes: { style: 'width: 100%' },
        },
        tableCell: false,
        tableHeader: false,
      }),
      TableCellWithBg,
      TableHeaderWithBg,
      TextStyleKit,
      Highlight.configure({ multicolor: true }),
      Subscript,
      Superscript,
      Indent,
      BlockLineHeight,
      IframeVideo,
      ListStyles,
    ],
    content: html || '<p></p>',
    editable: true,
    onCreate: ({ editor: ed }) => {
      editorRef.current = ed
    },
    onDestroy: () => {
      editorRef.current = null
    },
    editorProps: {
      attributes: {
        class: 'visual-prose',
        spellcheck: 'true',
        dir: settings.direction,
      },
      handlePaste(view, event) {
        const ed = editorRef.current
        const clip = event.clipboardData
        const htmlData = clip?.getData('text/html') || ''
        const plain = clip?.getData('text/plain') || ''
        const hasImageFile = clipboardHasImageFiles(clip)

        // Never paste clipboard images — text/HTML only (toolbar Image still works).
        if (hasImageFile) {
          event.preventDefault()
          const textOnly =
            emptyParagraphsForEditor(stripNoopSpanStyles(stripPastedImages(htmlData))) ||
            plain
          if (textOnly.trim()) {
            ed?.chain().focus().insertContent(textOnly).run()
          }
          return true
        }

        if (!htmlData) return false

        const sanitizePaste = (raw: string) =>
          emptyParagraphsForEditor(stripNoopSpanStyles(stripPastedImages(raw)))

        const mode = settingsRef.current.pasteMode
        if (mode === 'keep') {
          const cleaned = sanitizePaste(htmlData)
          if (cleaned === htmlData) return false
          event.preventDefault()
          ed?.chain().focus().insertContent(cleaned).run()
          return true
        }
        if (mode === 'remove') {
          event.preventDefault()
          const cleaned = cleanWordPaste(htmlData)
          ed?.chain().focus().insertContent(cleaned).run()
          return true
        }

        // ask — only prompt for Word/Office-like HTML
        if (looksLikeWordHtml(htmlData)) {
          event.preventDefault()
          pasteInsertPos.current = view.state.selection.from
          setPastePending(sanitizePaste(htmlData))
          return true
        }

        const cleaned = sanitizePaste(htmlData)
        if (cleaned !== htmlData) {
          event.preventDefault()
          ed?.chain().focus().insertContent(cleaned).run()
          return true
        }
        return false
      },
      transformPastedHTML(pasted) {
        const mode = settingsRef.current.pasteMode
        const cleaned = emptyParagraphsForEditor(
          stripNoopSpanStyles(stripPastedImages(pasted)),
        )
        if (mode === 'remove') return cleanWordPaste(cleaned)
        return cleaned
      },
    },
    onUpdate: ({ editor: ed }) => {
      onChange(ed.getHTML())
    },
  })

  useEffect(() => {
    editorRef.current = editor
    if (import.meta.env.DEV) {
      ;(window as unknown as { __W2H_EDITOR?: Editor | null }).__W2H_EDITOR =
        editor
    }
  }, [editor])

  useEffect(() => {
    onEditorReady?.(editor)
    return () => onEditorReady?.(null)
  }, [editor, onEditorReady])

  useEffect(() => {
    if (!editor) return
    // App/HTML pane stores `<p><br></p>`; TipTap must use empty `<p></p>`.
    // Otherwise HardBreak + trailingBreak = double blank line.
    const prepared = prepareHtmlForEditor(html || '<p></p>')
    const editorHtml = editor.getHTML()
    const editorPrepared = prepareHtmlForEditor(editorHtml)
    const sameSerialized = htmlEquals(
      serializeVisualHtml(editorHtml),
      serializeVisualHtml(html),
    )
    const editorAlreadyPrepared = htmlEquals(editorHtml, editorPrepared)
    // Synced and no hardBreak spacers left in the Visual DOM.
    if (sameSerialized && editorAlreadyPrepared) return
    // Different serialize but editor already shows prepared form of `html`.
    if (htmlEquals(editorHtml, prepared)) return
    const { from, to } = editor.state.selection
    editor.commands.setContent(prepared, { emitUpdate: false })
    // Keep caret near where it was — setContent alone jumps to the doc start.
    const max = editor.state.doc.content.size
    const nextFrom = Math.min(from, max)
    const nextTo = Math.min(to, max)
    editor.commands.setTextSelection({ from: nextFrom, to: nextTo })
  }, [html, editor])

  useEffect(() => {
    if (!editor) return
    editor.view.dom.setAttribute('dir', settings.direction)
  }, [editor, settings.direction])

  // Custom CSS into visual editor (PRO-style tag/class rules scoped under .visual-prose)
  useEffect(() => {
    const scoped = buildScopedCustomCss(settings.customCss)
    if (!scoped) {
      styleTagRef.current?.remove()
      styleTagRef.current = null
      return
    }
    let tag = styleTagRef.current
    if (!tag) {
      tag = document.createElement('style')
      tag.setAttribute('data-w2h-custom-css', '1')
      document.head.appendChild(tag)
      styleTagRef.current = tag
    }
    tag.textContent = scoped
  }, [settings.customCss])

  useEffect(() => {
    return () => {
      styleTagRef.current?.remove()
      styleTagRef.current = null
    }
  }, [])

  // Custom font stylesheets
  useEffect(() => {
    fontLinksRef.current.forEach((l) => l.remove())
    fontLinksRef.current = []
    const urls = settings.customFontUrls
      .split('#')
      .map((u) => u.trim())
      .filter(Boolean)
    for (const href of urls) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = href
      link.setAttribute('data-w2h-font', '1')
      document.head.appendChild(link)
      fontLinksRef.current.push(link)
    }
    return () => {
      fontLinksRef.current.forEach((l) => l.remove())
      fontLinksRef.current = []
    }
  }, [settings.customFontUrls])

  const stats = useMemo(
    () => ({
      words: countWords(html),
      chars: countChars(html),
    }),
    [html],
  )

  const customFonts = useMemo(
    () => parseCustomFontNames(settings.customFontNames),
    [settings.customFontNames],
  )

  const isOn = (key: HeaderToggleKey): boolean => {
    if (key === 'compactToolbar') return settings.compactToolbar
    if (key === 'mobilePreview') return settings.mobilePreview
    return settings.showCodePane
  }

  const flipToggle = (key: HeaderToggleKey) => {
    onSettingsChange({ [key]: !settings[key] })
  }

  return (
    <div
      className={`pane pane-visual${settings.mobilePreview ? ' pane-visual--mobile' : ''}`}
      data-testid="visual-pane"
    >
      <div className="pane-title-row">
        <h2 className="pane-heading">Visual HTML Editor</h2>
        <div className="visual-header-controls" aria-label="Editor options">
          <button
            type="button"
            className="visual-gear"
            onClick={onOpenSettings}
            title="Visual and HTML Code Editor Preferences"
            aria-label="Visual and HTML Code Editor Preferences"
          >
            <Icon i={FaCog} />
          </button>
          {HEADER_TOGGLES.map(({ key, title, icon }) => (
            <label key={key} className="visual-toggle" title={title}>
              <span className="visual-toggle-switch">
                <input
                  type="checkbox"
                  checked={isOn(key)}
                  onChange={() => flipToggle(key)}
                  aria-label={title}
                />
                <span className="visual-toggle-track" />
              </span>
              <Icon i={icon} size={ICON_SIZE_MD} className="visual-toggle-icon" />
            </label>
          ))}
        </div>
      </div>
      <div
        className={`toolbar-host${settings.compactToolbar ? ' toolbar-host--compact' : ' toolbar-host--full'}`}
      >
        <Toolbar
          editor={editor}
          compact={settings.compactToolbar}
          fontSizeUnit={settings.fontSizeUnit}
          customFonts={customFonts}
          imageSizeInHtml={settings.imageSizeInHtml}
          embedImages={settings.embedImages}
          entityEncoding={settings.entityEncoding}
          fullPageHtml={settings.fullPageHtml}
        />
      </div>
      <div className="pane-body visual-body">
        <div
          className={`visual-stage${settings.mobilePreview ? ' visual-stage--mobile' : ''}`}
        >
          <EditorContent editor={editor} className="visual-doc" />
          <TableBubbleToolbar editor={editor} />
        </div>
      </div>
      <div className="pane-footer visual-footer">
        <span>Words: {stats.words}</span>
        <span>Characters: {stats.chars}</span>
      </div>

      <PasteAskModal
        open={pastePending != null}
        onCancel={() => {
          setPastePending(null)
          pasteInsertPos.current = null
        }}
        onKeep={() => {
          if (editor && pastePending) insertPasteHtml(editor, pastePending)
          setPastePending(null)
        }}
        onClean={() => {
          if (editor && pastePending) {
            insertPasteHtml(editor, cleanWordPaste(pastePending))
          }
          setPastePending(null)
        }}
      />
    </div>
  )
}
