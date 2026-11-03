import { Extension } from '@tiptap/core'
import type { EditorState, Transaction } from '@tiptap/pm/state'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    blockLineHeight: {
      setBlockLineHeight: (lineHeight: string) => ReturnType
      unsetBlockLineHeight: () => ReturnType
    }
  }
}

const BLOCK_TYPES = new Set(['paragraph', 'heading'])

function setLineHeightOnSelection(
  state: EditorState,
  tr: Transaction,
  lineHeight: string | null,
): boolean {
  const { from, to } = state.selection
  let changed = false
  const targets = new Map<number, { attrs: Record<string, unknown> }>()

  state.doc.nodesBetween(from, to, (node, pos) => {
    if (BLOCK_TYPES.has(node.type.name)) {
      targets.set(pos, { attrs: node.attrs as Record<string, unknown> })
    }
  })

  if (targets.size === 0) {
    const $from = state.selection.$from
    for (let d = $from.depth; d > 0; d--) {
      const node = $from.node(d)
      if (BLOCK_TYPES.has(node.type.name)) {
        targets.set($from.before(d), { attrs: node.attrs as Record<string, unknown> })
        break
      }
    }
  }

  targets.forEach(({ attrs }, pos) => {
    tr.setNodeMarkup(pos, undefined, { ...attrs, lineHeight })
    changed = true
  })

  return changed
}

/** Paragraph/heading line-height (Froala-style block attribute). */
export const BlockLineHeight = Extension.create({
  name: 'blockLineHeight',

  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading'],
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: (element) => element.style.lineHeight || null,
            renderHTML: (attributes) => {
              if (!attributes.lineHeight) return {}
              return { style: `line-height: ${attributes.lineHeight}` }
            },
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      setBlockLineHeight:
        (lineHeight: string) =>
        ({ state, dispatch, tr }) => {
          const changed = setLineHeightOnSelection(state, tr, lineHeight)
          if (changed && dispatch) dispatch(tr)
          return changed
        },
      unsetBlockLineHeight:
        () =>
        ({ state, dispatch, tr }) => {
          const changed = setLineHeightOnSelection(state, tr, null)
          if (changed && dispatch) dispatch(tr)
          return changed
        },
    }
  },
})
