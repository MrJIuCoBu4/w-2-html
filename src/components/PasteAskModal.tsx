type Props = {
  open: boolean
  onKeep: () => void
  onClean: () => void
  onCancel: () => void
}

/** Froala-style Word paste prompt: Keep formatting vs Clean. */
export function PasteAskModal({ open, onKeep, onClean, onCancel }: Props) {
  if (!open) return null
  return (
    <div
      className="w2h-modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div
        className="w2h-modal paste-ask-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="paste-ask-title"
        data-testid="paste-ask-modal"
      >
        <h3 id="paste-ask-title">Paste from Word / Office?</h3>
        <p>
          Formatted content was detected. Keep original formatting, or clean Word markup
          for cleaner HTML?
        </p>
        <div className="w2h-modal-actions">
          <button type="button" className="btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-secondary"
            data-testid="paste-clean"
            onClick={onClean}
          >
            Clean
          </button>
          <button
            type="button"
            className="btn-primary"
            data-testid="paste-keep"
            onClick={onKeep}
          >
            Keep
          </button>
        </div>
      </div>
    </div>
  )
}
