import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  FaArrowsAlt,
  FaChevronLeft,
  FaChevronRight,
  FaCompress,
  FaIndent,
  FaParagraph,
  FaRedo,
  FaSearch,
  FaSearchMinus,
  FaUndo,
  Icon,
  ICON_SIZE_SM,
} from './icons'
import { VisualEditor } from './components/VisualEditor'
import { HtmlEditor, type HtmlEditorHandle } from './components/HtmlEditor'
import { SettingsModal } from './components/SettingsModal'
import { minifyHtml, prettifyHtml } from './lib/cleanup'
import {
  canRedo,
  canUndo,
  createHistory,
  pushHistory,
  redoHistory,
  undoHistory,
  type HtmlHistory,
} from './lib/history'
import {
  countChars,
  countWords,
  htmlEquals,
  serializeVisualHtml,
} from './lib/sync'
import {
  applyEntityEncoding,
  readAutoSavedHtml,
  readSettings,
  writeAutoSavedHtml,
  writeSettings,
  type AppSettings,
} from './lib/settings'
import './App.css'

const INITIAL_HTML = ''

export default function App() {
  const [settings, setSettings] = useState<AppSettings>(() => readSettings())
  const [settingsOpen, setSettingsOpen] = useState(false)

  const [history, setHistory] = useState<HtmlHistory>(() => {
    const prefs = readSettings()
    const saved = prefs.autoSaveHtml ? readAutoSavedHtml() : null
    // Normalize legacy &#…; letter entities (RU etc.) back to UTF-8.
    const initial = saved
      ? applyEntityEncoding(saved, prefs.entityEncoding)
      : INITIAL_HTML
    return createHistory(initial)
  })
  const html = history.present
  const htmlRef = useRef(html)
  // Mirror the committed document for event handlers (effects run before events).
  useLayoutEffect(() => {
    htmlRef.current = html
  }, [html])

  const [fontSize, setFontSize] = useState(14)
  const [htmlFullscreen, setHtmlFullscreen] = useState(false)
  const [showWhitespace, setShowWhitespace] = useState(false)
  const htmlEditorRef = useRef<HtmlEditorHandle>(null)
  /** both | visual (HTML collapsed) | html (visual collapsed) */
  const [paneFocus, setPaneFocus] = useState<'both' | 'visual' | 'html'>(() =>
    readSettings().showCodePane ? 'both' : 'visual',
  )

  const applySettings = useCallback((next: AppSettings) => {
    setSettings(next)
    writeSettings(next)
  }, [])

  const patchSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      writeSettings(next)
      return next
    })
  }, [])

  const setPaneLayout = useCallback(
    (focus: 'both' | 'visual' | 'html') => {
      setPaneFocus(focus)
      if (focus === 'visual') setHtmlFullscreen(false)
      const showCode = focus !== 'visual'
      if (settings.showCodePane !== showCode) {
        patchSettings({ showCodePane: showCode })
      }
    },
    [patchSettings, settings.showCodePane],
  )

  // Persist HTML when auto-save on
  useEffect(() => {
    if (!settings.autoSaveHtml) return
    const t = window.setTimeout(() => writeAutoSavedHtml(html), 400)
    return () => window.clearTimeout(t)
  }, [html, settings.autoSaveHtml])

  /** Which pane last drove the update — blocks echo into the other pane. */
  const applyingFrom = useRef<'visual' | 'html' | null>(null)
  const applyingFromClearTimer = useRef<number | null>(null)
  /**
   * When React pushes a new `value` into CodeMirror (undo/prettify/visual sync),
   * CM may re-emit onChange with a stale doc. Suppress those echoes only —
   * never suppress real keystrokes (that would drop characters).
   */
  const suppressCmEcho = useRef(false)
  const htmlHistoryTimer = useRef<number | null>(null)
  const pendingHtmlSnapshot = useRef<string | null>(null)

  const markApplyingFrom = useCallback(
    (from: 'visual' | 'html' | null, opts?: { suppressCmEcho?: boolean }) => {
      if (applyingFromClearTimer.current) {
        window.clearTimeout(applyingFromClearTimer.current)
        applyingFromClearTimer.current = null
      }
      applyingFrom.current = from
      if (from == null) {
        suppressCmEcho.current = false
        return
      }
      // Always set explicitly so a prior programmatic suppress cannot stick
      // and swallow subsequent CodeMirror keystrokes.
      suppressCmEcho.current = !!opts?.suppressCmEcho
      applyingFromClearTimer.current = window.setTimeout(() => {
        if (applyingFrom.current === from) applyingFrom.current = null
        suppressCmEcho.current = false
        applyingFromClearTimer.current = null
      }, 120)
    },
    [],
  )

  /** Commit any pending debounced HTML-typing history before undo/tools. */
  const flushHtmlHistory = useCallback(() => {
    if (htmlHistoryTimer.current) {
      window.clearTimeout(htmlHistoryTimer.current)
      htmlHistoryTimer.current = null
    }
    const snapshot = pendingHtmlSnapshot.current
    pendingHtmlSnapshot.current = null
    if (snapshot === null) return
    setHistory((h) => {
      if (htmlEquals(snapshot, h.present)) return h
      return {
        past: [...h.past, snapshot].slice(-80),
        present: h.present,
        future: [],
      }
    })
  }, [])

  const stats = useMemo(
    () => ({
      codeLen: html.length,
      words: countWords(html),
      chars: countChars(html),
    }),
    [html],
  )

  const applyHtml = useCallback(
    (
      next: string,
      opts: {
        history: boolean
        from: 'visual' | 'html'
        /** True when React is pushing into CodeMirror (not a CM keystroke). */
        programmatic?: boolean
      },
    ) => {
      if (htmlEquals(next, htmlRef.current) && opts.history === false) return
      markApplyingFrom(opts.from, {
        suppressCmEcho: opts.programmatic || opts.from === 'visual',
      })
      if (opts.history) {
        setHistory((h) => pushHistory(h, next))
      } else {
        setHistory((h) => (htmlEquals(h.present, next) ? h : { ...h, present: next }))
      }
    },
    [markApplyingFrom],
  )

  const encodeForCodePane = useCallback(
    (next: string) =>
      applyEntityEncoding(next, settings.entityEncoding),
    [settings.entityEncoding],
  )

  const onVisualChange = useCallback(
    (next: string) => {
      // Ignore TipTap echoes while HTML→Visual (or HTML tools) are applying.
      if (applyingFrom.current === 'html') return
      const formatted = encodeForCodePane(
        prettifyHtml(serializeVisualHtml(next)),
      )
      // Strict compare: htmlEquals treats 中 and &#20013; as equal and would
      // leave CJK stuck as numeric entities in the code pane.
      if (formatted === htmlRef.current) return
      applyHtml(formatted, { history: true, from: 'visual' })
    },
    [applyHtml, encodeForCodePane],
  )

  const onHtmlChange = useCallback(
    (next: string) => {
      if (applyingFrom.current === 'visual') return
      // Drop controlled-value echoes only (undo/prettify/visual→html pushes).
      if (suppressCmEcho.current) return
      // Legacy flat list indent → real nested <ul> (PRO-style) before syncing Visual.
      const normalized = /data-indent\s*=|margin-left\s*:/i.test(next)
        ? encodeForCodePane(prettifyHtml(serializeVisualHtml(next)))
        : next
      if (htmlEquals(normalized, htmlRef.current)) return

      if (pendingHtmlSnapshot.current === null) {
        pendingHtmlSnapshot.current = htmlRef.current
      }

      applyHtml(normalized, { history: false, from: 'html' })

      if (htmlHistoryTimer.current) window.clearTimeout(htmlHistoryTimer.current)
      htmlHistoryTimer.current = window.setTimeout(() => {
        const snapshot = pendingHtmlSnapshot.current
        pendingHtmlSnapshot.current = null
        if (snapshot === null) return
        setHistory((h) => {
          if (htmlEquals(snapshot, h.present)) return h
          return {
            past: [...h.past, snapshot].slice(-80),
            present: h.present,
            future: [],
          }
        })
      }, 500)
    },
    [applyHtml, encodeForCodePane],
  )

  const handlePrettify = () => {
    flushHtmlHistory()
    applyHtml(encodeForCodePane(prettifyHtml(htmlRef.current)), {
      history: true,
      from: 'html',
      programmatic: true,
    })
  }

  const handleCompress = () => {
    flushHtmlHistory()
    applyHtml(encodeForCodePane(minifyHtml(htmlRef.current)), {
      history: true,
      from: 'html',
      programmatic: true,
    })
  }

  // Re-encode the code pane when Special chars encoding preference changes.
  useEffect(() => {
    const next = applyEntityEncoding(htmlRef.current, settings.entityEncoding)
    if (next === htmlRef.current) return
    // Strict string compare: applyHtml's htmlEquals guard treats &copy; and ©
    // as equal, which would make every re-encode a silent no-op (entity
    // spelling is the whole point of this preference). Push directly.
    markApplyingFrom('html', { suppressCmEcho: true })
    setHistory((h) => (h.present === next ? h : { ...h, present: next }))
  }, [settings.entityEncoding, markApplyingFrom])

  const handleUndo = () => {
    // Merge flush + undo in one update so React does not apply them to a stale base.
    if (htmlHistoryTimer.current) {
      window.clearTimeout(htmlHistoryTimer.current)
      htmlHistoryTimer.current = null
    }
    const snapshot = pendingHtmlSnapshot.current
    pendingHtmlSnapshot.current = null
    markApplyingFrom('html', { suppressCmEcho: true })
    setHistory((h) => {
      let base = h
      if (snapshot !== null && !htmlEquals(snapshot, h.present)) {
        base = {
          past: [...h.past, snapshot].slice(-80),
          present: h.present,
          future: [],
        }
      }
      return undoHistory(base)
    })
  }

  const handleRedo = () => {
    if (htmlHistoryTimer.current) {
      window.clearTimeout(htmlHistoryTimer.current)
      htmlHistoryTimer.current = null
    }
    pendingHtmlSnapshot.current = null
    markApplyingFrom('html', { suppressCmEcho: true })
    setHistory((h) => redoHistory(h))
  }

  // paneFocus drives the layout; a hidden code pane always means "visual only".
  const effectivePaneFocus: 'both' | 'visual' | 'html' = !settings.showCodePane
    ? 'visual'
    : paneFocus === 'visual'
      ? 'both'
      : paneFocus
  const effectiveHtmlFullscreen = effectivePaneFocus !== 'visual' && htmlFullscreen

  return (
    <div className="app">
      <main
        className={`editor-grid editor-grid--${effectivePaneFocus}${effectiveHtmlFullscreen ? ' editor-grid--html-full' : ''}`}
      >
        <VisualEditor
          html={html}
          onChange={onVisualChange}
          settings={settings}
          onSettingsChange={patchSettings}
          onOpenSettings={() => setSettingsOpen(true)}
        />

        <div className="pane-gutter" role="separator" aria-orientation="vertical">
          <div className="pane-gutter-rail">
            <button
              type="button"
              className="pane-gutter-btn"
              onClick={() => {
                // Toward HTML: visual → both → html → both
                if (effectivePaneFocus === 'visual') setPaneLayout('both')
                else if (effectivePaneFocus === 'both') setPaneLayout('html')
                else setPaneLayout('both')
              }}
              title={
                effectivePaneFocus === 'html' ? 'Show both panes' : 'Expand HTML editor'
              }
              aria-label={
                effectivePaneFocus === 'html' ? 'Show both panes' : 'Expand HTML editor'
              }
            >
              <Icon i={FaChevronLeft} size={ICON_SIZE_SM} />
            </button>
        <button
          type="button"
              className="pane-gutter-btn"
              onClick={() => {
                // Toward visual: html → both → visual → both
                if (effectivePaneFocus === 'html') setPaneLayout('both')
                else if (effectivePaneFocus === 'both') setPaneLayout('visual')
                else setPaneLayout('both')
              }}
              title={
                effectivePaneFocus === 'visual' ? 'Show both panes' : 'Expand visual editor'
              }
              aria-label={
                effectivePaneFocus === 'visual' ? 'Show both panes' : 'Expand visual editor'
              }
            >
              <Icon i={FaChevronRight} size={ICON_SIZE_SM} />
        </button>
          </div>
        </div>

        <div className={`pane pane-html${effectiveHtmlFullscreen ? ' pane-html--full' : ''}`}>
          <div className="pane-title-row">
            <h2 className="pane-heading">HTML Editor</h2>
            <div className="code-length" title="HTML code length">
              Code length: <strong>{stats.codeLen}</strong>
            </div>
          </div>
          <div className="html-tools" role="toolbar" aria-label="HTML tools">
            <button
              type="button"
              className="tb-btn"
              onClick={() => htmlEditorRef.current?.openFind()}
              title="Find in HTML code editor - Ctrl+F / Cmd+F"
              aria-label="Find in HTML code editor - Ctrl+F / Cmd+F"
              data-testid="html-find"
            >
              <Icon i={FaSearch} />
            </button>
            <button
              type="button"
              className="tb-btn"
              onClick={() => htmlEditorRef.current?.openFindReplace()}
              title="Find and replace in HTML code editor - Shift+Ctrl+F / Cmd+Option+F"
              aria-label="Find and replace in HTML code editor - Shift+Ctrl+F / Cmd+Option+F"
              data-testid="html-find-replace"
            >
              <Icon i={FaSearchMinus} />
            </button>
            <button
              type="button"
              className="tb-btn"
              disabled={!canUndo(history)}
              onClick={handleUndo}
              title="Undo"
              aria-label="Undo"
            >
              <Icon i={FaUndo} className="tb-icon-balance" />
            </button>
            <button
              type="button"
              className="tb-btn"
              disabled={!canRedo(history)}
              onClick={handleRedo}
              title="Redo"
              aria-label="Redo"
            >
              <Icon i={FaRedo} className="tb-icon-balance" />
            </button>
            <button
              type="button"
              className={`tb-btn${showWhitespace ? ' is-active' : ''}`}
              onClick={() => setShowWhitespace((v) => !v)}
              title="View all whitespace chars in code editor"
              aria-label="View all whitespace chars in code editor"
              aria-pressed={showWhitespace}
              data-testid="html-whitespace"
            >
              <Icon i={FaParagraph} />
            </button>
            <button
              type="button"
              className="tb-btn"
              onClick={handlePrettify}
              title="Prettify HTML code"
              aria-label="Prettify HTML code"
            >
              <Icon i={FaIndent} />
            </button>
            <button
              type="button"
              className="tb-btn"
              onClick={handleCompress}
              title="Compress HTML code"
              aria-label="Compress HTML code"
            >
              <Icon i={FaCompress} />
            </button>
            <button
              type="button"
              className="tb-btn"
              onClick={() => setFontSize((s) => Math.max(10, s - 1))}
              title="Code editor smaller font"
              aria-label="Code editor smaller font"
            >
              <span className="tb-font-step" aria-hidden>
                A−
              </span>
            </button>
            <button
              type="button"
              className="tb-btn"
              onClick={() => setFontSize((s) => Math.min(22, s + 1))}
              title="Code editor bigger font"
              aria-label="Code editor bigger font"
            >
              <span className="tb-font-step" aria-hidden>
                A+
              </span>
            </button>
            <button
              type="button"
              className="tb-btn"
              onClick={() => {
                setHtmlFullscreen((f) => {
                  const next = !f
                  if (next && paneFocus === 'visual') setPaneLayout('both')
                  return next
                })
              }}
              title="Full screen HTML editor"
              aria-label="Full screen HTML editor"
              aria-pressed={htmlFullscreen}
            >
              <Icon i={FaArrowsAlt} />
            </button>
          </div>
          <div className="pane-body html-body">
            <HtmlEditor
              ref={htmlEditorRef}
              value={html}
              onChange={onHtmlChange}
              fontSize={fontSize}
              fullscreen={effectiveHtmlFullscreen}
              showLineNumbers={settings.showLineNumbers}
              lineWrapping={settings.lineWrapping}
              codeFolding={settings.codeFolding}
              autoCloseTags={settings.autoCloseTags}
              showWhitespace={showWhitespace}
            />
          </div>
        </div>
      </main>

      <SettingsModal
        open={settingsOpen}
        settings={settings}
        onChange={applySettings}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  )
}
