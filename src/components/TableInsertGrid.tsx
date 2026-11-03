import { useState } from 'react'

const MAX = 10

type Props = {
  onPick: (rows: number, cols: number) => void
}

/**
 * PRO Froala `.fr-table-size`: 10×10 hover grid, label `rows × cols`.
 */
export function TableInsertGrid({ onPick }: Props) {
  const [hover, setHover] = useState({ rows: 1, cols: 1 })

  return (
    <div className="table-insert-size" data-testid="table-insert-grid">
      <div className="table-insert-size-info" aria-live="polite">
        {hover.rows} × {hover.cols}
      </div>
      <div
        className="table-insert-size-grid"
        onMouseLeave={() => setHover({ rows: 1, cols: 1 })}
      >
        {Array.from({ length: MAX }, (_, r) =>
          Array.from({ length: MAX }, (_, c) => {
            const rows = r + 1
            const cols = c + 1
            const active = rows <= hover.rows && cols <= hover.cols
            return (
              <button
                key={`${rows}-${cols}`}
                type="button"
                className={`table-insert-cell${active ? ' is-active' : ''}`}
                title={`${rows} × ${cols}`}
                aria-label={`${rows} × ${cols}`}
                data-row={rows}
                data-col={cols}
                onMouseEnter={() => setHover({ rows, cols })}
                onClick={() => onPick(rows, cols)}
              >
                <span />
              </button>
            )
          }),
        )}
      </div>
    </div>
  )
}
