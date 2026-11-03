import { useEffect, useRef, useState, type FormEvent } from 'react'

type Props = {
  open: boolean
  title: string
  label?: string
  initialValue?: string
  placeholder?: string
  confirmLabel?: string
  allowEmpty?: boolean
  emptyHint?: string
  onConfirm: (value: string) => void
  onClose: () => void
  testId?: string
}

/** Small anchored URL popup (replaces window.prompt for Link / Image / Video). */
export function UrlInsertPopup({
  open,
  title,
  label = 'URL',
  initialValue = 'https://',
  placeholder = 'https://',
  confirmLabel = 'Insert',
  allowEmpty = false,
  emptyHint,
  onConfirm,
  onClose,
  testId = 'url-insert-popup',
}: Props) {
  const [value, setValue] = useState(initialValue)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setValue(initialValue)
    const t = window.setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 20)
    return () => window.clearTimeout(t)
  }, [open, initialValue])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed && !allowEmpty) return
    onConfirm(trimmed)
  }

  return (
    <div
      className="w2h-modal-backdrop w2h-modal-backdrop--light"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <form
        className="w2h-popup url-insert-popup"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid={testId}
        onSubmit={submit}
      >
        <div className="url-insert-title">{title}</div>
        <label className="url-insert-label">
          <span>{label}</span>
          <input
            ref={inputRef}
            type="text"
            inputMode="url"
            value={value}
            placeholder={placeholder}
            onChange={(e) => setValue(e.target.value)}
            data-testid={`${testId}-input`}
          />
        </label>
        {allowEmpty && emptyHint ? (
          <p className="url-insert-hint">{emptyHint}</p>
        ) : null}
        <div className="w2h-modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" data-testid={`${testId}-confirm`}>
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>
  )
}
