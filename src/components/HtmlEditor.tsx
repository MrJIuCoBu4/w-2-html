import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react'
import CodeMirror, { ExternalChange } from '@uiw/react-codemirror'
import { html as htmlLang } from '@codemirror/lang-html'
import {
  EditorView,
  highlightWhitespace,
  keymap,
  placeholder as cmPlaceholder,
  type ViewUpdate,
} from '@codemirror/view'
import { EditorSelection } from '@codemirror/state'
import { openSearchPanel, search, searchKeymap } from '@codemirror/search'

export type HtmlEditorHandle = {
  openFind: () => void
  openFindReplace: () => void
}

type Props = {
  value: string
  onChange: (value: string) => void
  fontSize: number
  fullscreen?: boolean
  showLineNumbers?: boolean
  lineWrapping?: boolean
  codeFolding?: boolean
  autoCloseTags?: boolean
  showWhitespace?: boolean
}

type SavedCaret = {
  anchor: number
  head: number
  scrollTop: number
}

export const HtmlEditor = forwardRef<HtmlEditorHandle, Props>(
  function HtmlEditor(
    {
      value,
      onChange,
      fontSize,
      fullscreen,
      showLineNumbers = true,
      lineWrapping = true,
      codeFolding = true,
      autoCloseTags = true,
      showWhitespace = false,
    },
    ref,
  ) {
    const viewRef = useRef<EditorView | null>(null)
    /**
     * Last caret/scroll the user left in the editor. `@uiw/react-codemirror`
     * replaces the whole doc (annotated with `ExternalChange`) when `value`
     * changes from above — undo, prettify, visual→HTML sync. That dispatch
     * would otherwise drop the caret to the end, so we put it back afterwards.
     */
    const lastCaret = useRef<SavedCaret | null>(null)

    const onUpdate = useCallback((update: ViewUpdate) => {
      const external = update.transactions.some(
        (tr) => tr.annotation(ExternalChange) != null,
      )
      if (external) {
        const saved = lastCaret.current
        if (!saved) return
        // The doc replace is being applied right now; restore once it settles.
        queueMicrotask(() => {
          const view = viewRef.current
          if (!view) return
          const len = view.state.doc.length
          view.dispatch({
            selection: EditorSelection.single(
              Math.min(saved.anchor, len),
              Math.min(saved.head, len),
            ),
          })
          view.scrollDOM.scrollTop = saved.scrollTop
        })
        return
      }
      const sel = update.state.selection.main
      lastCaret.current = {
        anchor: sel.anchor,
        head: sel.head,
        scrollTop: update.view.scrollDOM.scrollTop,
      }
    }, [])

    useImperativeHandle(ref, () => ({
      openFind: () => {
        const view = viewRef.current
        if (!view) return
        openSearchPanel(view)
        queueMicrotask(() => {
          const searchInput = view.dom.querySelector(
            '.cm-textfield[name=search], input[name=search]',
          ) as HTMLInputElement | null
          searchInput?.focus()
          searchInput?.select()
        })
      },
      openFindReplace: () => {
        const view = viewRef.current
        if (!view) return
        openSearchPanel(view)
        queueMicrotask(() => {
          const replace = view.dom.querySelector(
            '.cm-textfield[name=replace], input[name=replace]',
          ) as HTMLInputElement | null
          if (replace) {
            replace.focus()
            replace.select()
            return
          }
          const searchInput = view.dom.querySelector(
            '.cm-textfield[name=search], input[name=search]',
          ) as HTMLInputElement | null
          searchInput?.focus()
        })
      },
    }))

    const extensions = useMemo(() => {
      const ext = [
        htmlLang({ autoCloseTags }),
        cmPlaceholder('Paste or enter your HTML here...'),
        search({ top: true }),
        keymap.of(searchKeymap),
      ]
      if (lineWrapping) ext.push(EditorView.lineWrapping)
      if (showWhitespace) ext.push(highlightWhitespace())
      return ext
    }, [lineWrapping, autoCloseTags, showWhitespace])

    return (
      <div className={`html-cm${fullscreen ? ' is-fullscreen' : ''}`} style={{ fontSize }}>
        <CodeMirror
          value={value}
          height="100%"
          style={{ height: '100%', flex: 1, minHeight: 0 }}
          theme="light"
          extensions={extensions}
          onChange={onChange}
          onUpdate={onUpdate}
          onCreateEditor={(ed) => {
            viewRef.current = ed
          }}
          basicSetup={{
            lineNumbers: showLineNumbers,
            foldGutter: codeFolding,
            highlightActiveLine: true,
            searchKeymap: true,
          }}
        />
      </div>
    )
  },
)
