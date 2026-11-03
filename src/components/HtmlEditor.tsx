import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { html as htmlLang } from '@codemirror/lang-html'
import {
  EditorView,
  highlightWhitespace,
  keymap,
  placeholder as cmPlaceholder,
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
    const pendingCaret = useRef<SavedCaret | null>(null)

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

    // Before uiw replaces the doc from `value`, remember caret + scroll.
    const view = viewRef.current
    if (view && value !== view.state.doc.toString()) {
      const sel = view.state.selection.main
      pendingCaret.current = {
        anchor: sel.anchor,
        head: sel.head,
        scrollTop: view.scrollDOM.scrollTop,
      }
    }

    // After uiw's controlled update (effect), put caret/scroll back.
    // Child effects run first, so this runs after the doc replace.
    useEffect(() => {
      const ed = viewRef.current
      const saved = pendingCaret.current
      if (!ed || !saved) return
      if (ed.state.doc.toString() !== value) return
      pendingCaret.current = null
      const len = ed.state.doc.length
      ed.dispatch({
        selection: EditorSelection.single(
          Math.min(saved.anchor, len),
          Math.min(saved.head, len),
        ),
      })
      ed.scrollDOM.scrollTop = saved.scrollTop
    }, [value])

    return (
      <div className={`html-cm${fullscreen ? ' is-fullscreen' : ''}`} style={{ fontSize }}>
        <CodeMirror
          value={value}
          height="100%"
          style={{ height: '100%', flex: 1, minHeight: 0 }}
          theme="light"
          extensions={extensions}
          onChange={onChange}
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
