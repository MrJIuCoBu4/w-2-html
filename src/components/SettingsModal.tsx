import { useEffect, useId, useRef, useState } from 'react'
import { FaChevronDown, FaTimes, Icon, ICON_SIZE_MD, ICON_SIZE_SM } from '../icons'
import {
  EDITOR_HEIGHTS,
  type AppSettings,
  type EditorHeight,
  type EntityEncoding,
  type FontSizeUnit,
  type PasteMode,
  type TextDirection,
} from '../lib/settings'

type Props = {
  open: boolean
  settings: AppSettings
  onChange: (next: AppSettings) => void
  onClose: () => void
}

function Segmented<T extends string>({
  name,
  value,
  options,
  onChange,
}: {
  name: string
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="settings-seg" role="radiogroup" aria-label={name}>
      {options.map((opt) => {
        const active = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            className={`settings-seg-btn${active ? ' is-active' : ''}`}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

function Toggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  hint?: string
}) {
  return (
    <label className="settings-toggle" title={hint}>
      <span className="settings-toggle-text">
        <span className="settings-toggle-label">{label}</span>
        {hint ? <span className="settings-toggle-hint">{hint}</span> : null}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="settings-toggle-track" aria-hidden />
    </label>
  )
}

export function SettingsModal({ open, settings, onChange, onClose }: Props) {
  const titleId = useId()
  const appearanceId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const [appearanceOpen, setAppearanceOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.querySelector<HTMLElement>('button, input, select, textarea')?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  const patch = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    onChange({ ...settings, [key]: value })
  }

  return (
    <div
      className="settings-overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        className="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="settings-modal-header">
          <div>
            <h2 id={titleId}>Settings</h2>
            <p className="settings-modal-sub">Editor, export, and appearance</p>
          </div>
          <button
            type="button"
            className="settings-close"
            onClick={onClose}
            title="Close"
            aria-label="Close settings"
          >
            <Icon i={FaTimes} size={ICON_SIZE_MD} />
          </button>
        </div>

        <div className="settings-modal-body">
          <div className="settings-grid">
            <section className="settings-card">
              <header className="settings-card-head">
                <h3>Visual editor</h3>
                <p>How the left pane behaves while you write.</p>
              </header>

              <div className="settings-field">
                <div className="settings-label">Paste</div>
                <Segmented<PasteMode>
                  name="pasteMode"
                  value={settings.pasteMode}
                  onChange={(v) => patch('pasteMode', v)}
                  options={[
                    { value: 'keep', label: 'Keep' },
                    { value: 'remove', label: 'Clean' },
                    { value: 'ask', label: 'Ask' },
                  ]}
                />
              </div>

              <div className="settings-field-row">
                <div className="settings-field">
                  <div className="settings-label">Font size unit</div>
                  <Segmented<FontSizeUnit>
                    name="fontSizeUnit"
                    value={settings.fontSizeUnit}
                    onChange={(v) => patch('fontSizeUnit', v)}
                    options={[
                      { value: 'px', label: 'px' },
                      { value: 'pt', label: 'pt' },
                    ]}
                  />
                </div>
                <div className="settings-field">
                  <div className="settings-label">Direction</div>
                  <Segmented<TextDirection>
                    name="direction"
                    value={settings.direction}
                    onChange={(v) => patch('direction', v)}
                    options={[
                      { value: 'ltr', label: 'LTR' },
                      { value: 'rtl', label: 'RTL' },
                    ]}
                  />
                </div>
              </div>

              <div className="settings-field">
                <label className="settings-label" htmlFor="settings-editor-height">
                  Pane height
                </label>
                <select
                  id="settings-editor-height"
                  value={settings.editorHeight}
                  onChange={(e) =>
                    patch('editorHeight', Number(e.target.value) as EditorHeight)
                  }
                >
                  {EDITOR_HEIGHTS.map((h) => (
                    <option key={h} value={h}>
                      {h}px
                    </option>
                  ))}
                </select>
              </div>

              <div className="settings-toggles">
                <Toggle
                  label="Compact toolbar"
                  checked={settings.compactToolbar}
                  onChange={(v) => patch('compactToolbar', v)}
                  hint="Secondary formatting stays behind More Text."
                />
                <Toggle
                  label="Image size in HTML"
                  checked={settings.imageSizeInHtml}
                  onChange={(v) => patch('imageSizeInHtml', v)}
                  hint="Write width/height when inserting images."
                />
                <Toggle
                  label="Embed images as data URLs"
                  checked={settings.embedImages}
                  onChange={(v) => patch('embedImages', v)}
                  hint="Best-effort when inserting remote images."
                />
              </div>
            </section>

            <section className="settings-card">
              <header className="settings-card-head">
                <h3>Code editor</h3>
                <p>Options for the HTML source pane.</p>
              </header>

              <div className="settings-toggles">
                <Toggle
                  label="Auto-close tags"
                  checked={settings.autoCloseTags}
                  onChange={(v) => patch('autoCloseTags', v)}
                />
                <Toggle
                  label="Line numbers"
                  checked={settings.showLineNumbers}
                  onChange={(v) => patch('showLineNumbers', v)}
                />
                <Toggle
                  label="Line wrapping"
                  checked={settings.lineWrapping}
                  onChange={(v) => patch('lineWrapping', v)}
                />
                <Toggle
                  label="Code folding"
                  checked={settings.codeFolding}
                  onChange={(v) => patch('codeFolding', v)}
                />
                <Toggle
                  label="Auto-save HTML"
                  checked={settings.autoSaveHtml}
                  onChange={(v) => patch('autoSaveHtml', v)}
                  hint="Persist the document in this browser."
                />
              </div>
            </section>

            <section className="settings-card settings-card--span">
              <header className="settings-card-head">
                <h3>Export</h3>
                <p>How special characters and Copy HTML are written.</p>
              </header>

              <div className="settings-field">
                <div className="settings-label">Character encoding</div>
                <Segmented<EntityEncoding>
                  name="entityEncoding"
                  value={settings.entityEncoding}
                  onChange={(v) => patch('entityEncoding', v)}
                  options={[
                    { value: 'named', label: 'Named' },
                    { value: 'numeric', label: 'Numeric' },
                    { value: 'raw', label: 'Raw UTF-8' },
                  ]}
                />
                <p className="settings-hint">
                  Named: FR/DE/ES letters and symbols (&eacute;, &copy;…). RU/CJK letters stay UTF-8.
                </p>
              </div>

              <div className="settings-toggles">
                <Toggle
                  label="Full HTML document on copy"
                  checked={settings.fullPageHtml}
                  onChange={(v) => patch('fullPageHtml', v)}
                  hint="Wrap copied markup in &lt;html&gt;&lt;head&gt;&lt;body&gt;."
                />
              </div>
            </section>

            <section className="settings-card settings-card--span settings-card--fold">
              <button
                type="button"
                className="settings-fold-trigger"
                aria-expanded={appearanceOpen}
                aria-controls={appearanceId}
                onClick={() => setAppearanceOpen((v) => !v)}
              >
                <span className="settings-fold-copy">
                  <span className="settings-fold-title">Appearance</span>
                  <span className="settings-fold-desc">
                    Custom CSS and fonts for the visual editor
                    {settings.customCss.trim() ||
                    settings.customFontNames.trim() ||
                    settings.customFontUrls.trim()
                      ? ' · configured'
                      : ''}
                  </span>
                </span>
                <Icon
                  i={FaChevronDown}
                  size={ICON_SIZE_SM}
                  className={`settings-fold-caret${appearanceOpen ? ' is-open' : ''}`}
                />
              </button>

              <div
                id={appearanceId}
                className={`settings-fold-panel${appearanceOpen ? ' is-open' : ''}`}
                aria-hidden={!appearanceOpen}
              >
                <div className="settings-fold-panel-inner">
                  <div className="settings-fold-body">
                    <div className="settings-field">
                      <label className="settings-label" htmlFor="settings-custom-css">
                        Custom CSS
                      </label>
                      <textarea
                        id="settings-custom-css"
                        className="settings-textarea"
                        rows={6}
                        placeholder={'p { line-height: 1.5; }\nh1 { color: #222; }'}
                        value={settings.customCss}
                        onChange={(e) => patch('customCss', e.target.value)}
                        tabIndex={appearanceOpen ? undefined : -1}
                      />
                      <p className="settings-hint">Scoped to the visual document.</p>
                    </div>

                    <div className="settings-field">
                      <label className="settings-label" htmlFor="settings-font-names">
                        Font names
                      </label>
                      <input
                        id="settings-font-names"
                        type="text"
                        className="settings-input"
                        placeholder="Lato#Open Sans"
                        value={settings.customFontNames}
                        onChange={(e) => patch('customFontNames', e.target.value)}
                        tabIndex={appearanceOpen ? undefined : -1}
                      />
                      <p className="settings-hint">Separate with #</p>
                    </div>

                    <div className="settings-field">
                      <label className="settings-label" htmlFor="settings-font-urls">
                        Stylesheet URLs
                      </label>
                      <textarea
                        id="settings-font-urls"
                        className="settings-textarea settings-textarea--short"
                        rows={3}
                        placeholder="https://fonts.googleapis.com/css2?family=Lato"
                        value={settings.customFontUrls}
                        onChange={(e) => patch('customFontUrls', e.target.value)}
                        tabIndex={appearanceOpen ? undefined : -1}
                      />
                      <p className="settings-hint">Separate with #</p>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>

        <div className="settings-modal-footer">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Close
          </button>
          <button type="button" className="btn-primary" onClick={onClose}>
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
