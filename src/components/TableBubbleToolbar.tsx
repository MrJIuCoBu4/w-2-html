import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Editor } from '@tiptap/react'
import {
  FaAlignCenter,
  FaAlignJustify,
  FaAlignLeft,
  FaAlignRight,
  FaFillDrip,
  FaPaintBrush,
  FaPlus,
  FaTable,
  FaTrash,
  Icon,
  ICON_SIZE_SM,
} from '../icons'

const CELL_COLORS = [
  '#ffffff',
  '#f3f3f3',
  '#eeeeee',
  '#cccccc',
  '#999999',
  '#666666',
  '#000000',
  '#ff0000',
  '#ff9900',
  '#ffff00',
  '#00ff00',
  '#00ffff',
  '#4a86e8',
  '#0000ff',
  '#9900ff',
  '#ff00ff',
  '#f4cccc',
  '#fce5cd',
  '#fff2cc',
  '#d9ead3',
  '#d0e0e3',
  '#cfe2f3',
  '#d9d2e9',
  '#ead1dc',
]

type SubMenu = 'rows' | 'cols' | 'cells' | 'vAlign' | 'hAlign' | 'bg' | 'style' | null

type Props = {
  editor: Editor | null
}

/**
 * PRO Froala table popup (two rows):
 * 1) Table styling · Header · Footer · Remove · Rows ▾ · Columns ▾
 * 2) Cell styling · Cell ▾ · Cell BG · Vertical align ▾ · Horizontal align ▾
 */
export function TableBubbleToolbar({ editor }: Props) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const [menu, setMenu] = useState<SubMenu>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  const update = useCallback(() => {
    if (!editor || editor.isDestroyed) {
      setPos(null)
      return
    }
    if (!editor.isActive('table')) {
      setPos(null)
      setMenu(null)
      return
    }
    try {
      const { view, state } = editor
      const { from } = state.selection
      const coords = view.coordsAtPos(from)
      const stage = view.dom.closest('.visual-stage') as HTMLElement | null
      const stageRect = stage?.getBoundingClientRect()
      if (!stageRect) {
        setPos(null)
        return
      }
      const scrollTop = stage?.scrollTop || 0
      const toolbarW = rootRef.current?.offsetWidth || 190
      let left = coords.left - stageRect.left - 12
      left = Math.max(8, Math.min(left, stageRect.width - toolbarW - 8))
      let top = coords.top - stageRect.top + scrollTop - 88
      if (top < 4) top = coords.bottom - stageRect.top + scrollTop + 8
      setPos({ top, left })
    } catch {
      setPos(null)
    }
  }, [editor])

  useEffect(() => {
    if (!editor) return
    // Defer the first measurement so setPos does not run synchronously inside
    // the effect (cascading render warning); the toolbar is placed pre-paint.
    queueMicrotask(update)
    editor.on('selectionUpdate', update)
    editor.on('transaction', update)
    editor.on('focus', update)
    return () => {
      editor.off('selectionUpdate', update)
      editor.off('transaction', update)
      editor.off('focus', update)
    }
  }, [editor, update])

  useEffect(() => {
    if (!menu) return
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return
      setMenu(null)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menu])

  useLayoutEffect(() => {
    // Menu open/close changes the anchor geometry — re-place after commit.
    queueMicrotask(update)
  }, [update, menu])

  if (!editor || !pos) return null

  const run = (fn: () => void) => {
    fn()
    setMenu(null)
    editor.chain().focus().run()
  }

  const canMerge = editor.can().mergeCells()
  const canSplit = editor.can().splitCell()

  const setCellBg = (color: string | null) => {
    run(() => {
      editor.chain().focus().setCellAttribute('backgroundColor', color).run()
    })
  }

  const setVAlign = (value: string) => {
    run(() => {
      editor.chain().focus().setCellAttribute('verticalAlign', value).run()
    })
  }

  const setHAlign = (value: string) => {
    run(() => {
      editor.chain().focus().setTextAlign(value).run()
    })
  }

  const toggleMenu = (id: SubMenu) => {
    setMenu((prev) => (prev === id ? null : id))
  }

  return createPortal(
    <div
      ref={rootRef}
      className="table-bubble"
      style={{ top: pos.top, left: pos.left }}
      data-testid="table-bubble"
      role="toolbar"
      aria-label="Table options"
    >
      <div className="table-bubble-row">
        <div className="table-bubble-dd">
          <button
            type="button"
            className={`table-bubble-btn${menu === 'style' ? ' is-active' : ''}`}
            title="Table styling"
            aria-expanded={menu === 'style'}
            onClick={() => toggleMenu('style')}
          >
            <Icon i={FaPaintBrush} />
          </button>
          {menu === 'style' ? (
            <div className="table-bubble-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                className="table-bubble-item"
                onClick={() =>
                  run(() => editor.chain().focus().toggleHeaderRow().run())
                }
              >
                Toggle header row
              </button>
              <button
                type="button"
                role="menuitem"
                className="table-bubble-item"
                onClick={() =>
                  run(() => editor.chain().focus().toggleHeaderColumn().run())
                }
              >
                Toggle header column
              </button>
            </div>
          ) : null}
        </div>

        <button
          type="button"
          className="table-bubble-btn"
          title="Table Header"
          onClick={() =>
            run(() => editor.chain().focus().toggleHeaderRow().run())
          }
        >
          <Icon i={FaTable} />
          <span className="table-bubble-badge">H</span>
        </button>

        <button
          type="button"
          className="table-bubble-btn"
          title="Remove Table"
          data-testid="table-remove"
          onClick={() => run(() => editor.chain().focus().deleteTable().run())}
        >
          <Icon i={FaTrash} />
        </button>

        <div className="table-bubble-dd">
          <button
            type="button"
            className={`table-bubble-btn${menu === 'rows' ? ' is-active' : ''}`}
            title="Row"
            aria-expanded={menu === 'rows'}
            onClick={() => toggleMenu('rows')}
          >
            <span className="table-bubble-glyph table-bubble-glyph--row" aria-hidden />
            <span className="table-bubble-caret">▾</span>
          </button>
          {menu === 'rows' ? (
            <div className="table-bubble-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                className="table-bubble-item"
                onClick={() =>
                  run(() => editor.chain().focus().addRowBefore().run())
                }
              >
                Insert row above
              </button>
              <button
                type="button"
                role="menuitem"
                className="table-bubble-item"
                onClick={() =>
                  run(() => editor.chain().focus().addRowAfter().run())
                }
              >
                Insert row below
              </button>
              <button
                type="button"
                role="menuitem"
                className="table-bubble-item"
                onClick={() =>
                  run(() => editor.chain().focus().deleteRow().run())
                }
              >
                Delete row
              </button>
            </div>
          ) : null}
        </div>

        <div className="table-bubble-dd">
          <button
            type="button"
            className={`table-bubble-btn${menu === 'cols' ? ' is-active' : ''}`}
            title="Column"
            aria-expanded={menu === 'cols'}
            onClick={() => toggleMenu('cols')}
          >
            <span className="table-bubble-glyph table-bubble-glyph--col" aria-hidden />
            <span className="table-bubble-caret">▾</span>
          </button>
          {menu === 'cols' ? (
            <div className="table-bubble-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                className="table-bubble-item"
                onClick={() =>
                  run(() => editor.chain().focus().addColumnBefore().run())
                }
              >
                Insert column before
              </button>
              <button
                type="button"
                role="menuitem"
                className="table-bubble-item"
                onClick={() =>
                  run(() => editor.chain().focus().addColumnAfter().run())
                }
              >
                Insert column after
              </button>
              <button
                type="button"
                role="menuitem"
                className="table-bubble-item"
                onClick={() =>
                  run(() => editor.chain().focus().deleteColumn().run())
                }
              >
                Delete column
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="table-bubble-row">
        <button
          type="button"
          className="table-bubble-btn"
          title="Table cell styling"
          onClick={() => toggleMenu(menu === 'bg' ? null : 'bg')}
        >
          <Icon i={FaPaintBrush} />
        </button>

        <div className="table-bubble-dd">
          <button
            type="button"
            className={`table-bubble-btn${menu === 'cells' ? ' is-active' : ''}`}
            title="Cell"
            aria-expanded={menu === 'cells'}
            data-testid="table-cells-menu"
            onClick={() => toggleMenu('cells')}
          >
            <Icon i={FaPlus} size={ICON_SIZE_SM} />
            <span className="table-bubble-caret">▾</span>
          </button>
          {menu === 'cells' ? (
            <div className="table-bubble-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                className="table-bubble-item"
                disabled={!canMerge}
                onClick={() =>
                  run(() => editor.chain().focus().mergeCells().run())
                }
              >
                Merge cells
              </button>
              <button
                type="button"
                role="menuitem"
                className="table-bubble-item"
                disabled={!canSplit}
                onClick={() =>
                  run(() => editor.chain().focus().splitCell().run())
                }
              >
                Vertical split
              </button>
              <button
                type="button"
                role="menuitem"
                className="table-bubble-item"
                disabled={!canSplit}
                onClick={() =>
                  run(() => editor.chain().focus().splitCell().run())
                }
              >
                Horizontal split
              </button>
            </div>
          ) : null}
        </div>

        <div className="table-bubble-dd">
          <button
            type="button"
            className={`table-bubble-btn${menu === 'bg' ? ' is-active' : ''}`}
            title="Cell Background"
            aria-expanded={menu === 'bg'}
            onClick={() => toggleMenu('bg')}
          >
            <Icon i={FaFillDrip} />
          </button>
          {menu === 'bg' ? (
            <div className="table-bubble-menu table-bubble-menu--swatches" role="menu">
              <button
                type="button"
                className="table-bubble-item"
                onClick={() => setCellBg(null)}
              >
                Remove color
              </button>
              <div className="table-bubble-swatches">
                {CELL_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className="table-bubble-swatch"
                    style={{ background: c }}
                    title={c}
                    aria-label={c}
                    onClick={() => setCellBg(c)}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="table-bubble-dd">
          <button
            type="button"
            className={`table-bubble-btn${menu === 'vAlign' ? ' is-active' : ''}`}
            title="Vertical Align"
            aria-expanded={menu === 'vAlign'}
            onClick={() => toggleMenu('vAlign')}
          >
            <span className="table-bubble-valign" aria-hidden>
              ↕
            </span>
            <span className="table-bubble-caret">▾</span>
          </button>
          {menu === 'vAlign' ? (
            <div className="table-bubble-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                className="table-bubble-item"
                onClick={() => setVAlign('top')}
              >
                Align Top
              </button>
              <button
                type="button"
                role="menuitem"
                className="table-bubble-item"
                onClick={() => setVAlign('middle')}
              >
                Align Middle
              </button>
              <button
                type="button"
                role="menuitem"
                className="table-bubble-item"
                onClick={() => setVAlign('bottom')}
              >
                Align Bottom
              </button>
            </div>
          ) : null}
        </div>

        <div className="table-bubble-dd">
          <button
            type="button"
            className={`table-bubble-btn${menu === 'hAlign' ? ' is-active' : ''}`}
            title="Horizontal Align"
            aria-expanded={menu === 'hAlign'}
            onClick={() => toggleMenu('hAlign')}
          >
            <Icon i={FaAlignLeft} />
            <span className="table-bubble-caret">▾</span>
          </button>
          {menu === 'hAlign' ? (
            <div className="table-bubble-menu" role="menu">
              {(
                [
                  ['left', FaAlignLeft, 'Align Left'],
                  ['center', FaAlignCenter, 'Align Center'],
                  ['right', FaAlignRight, 'Align Right'],
                  ['justify', FaAlignJustify, 'Align Justify'],
                ] as const
              ).map(([align, AlignIcon, label]) => (
                <button
                  key={align}
                  type="button"
                  role="menuitem"
                  className="table-bubble-item"
                  onClick={() => setHAlign(align)}
                >
                  <Icon i={AlignIcon} /> {label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    (editor.view.dom.closest('.visual-stage') as HTMLElement | null) ||
      document.body,
  )
}
