import { Extension } from '@tiptap/core'
import type { Editor } from '@tiptap/core'
import { TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state'
import { Fragment, type Node as ProseNode } from '@tiptap/pm/model'

export const INDENT_STEP_PX = 40
export const MAX_INDENT = 8
/** Max nested ul/ol depth (root list = 1). */
export const MAX_LIST_DEPTH = 8

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    indent: {
      indent: () => ReturnType
      outdent: () => ReturnType
    }
  }
}

const BLOCK_TYPES = new Set(['paragraph', 'heading'])

function findListItemAt(
  $pos: EditorState['selection']['$from'],
): { pos: number; node: ProseNode; depth: number } | null {
  for (let d = $pos.depth; d > 0; d--) {
    if ($pos.node(d).type.name === 'listItem') {
      return { pos: $pos.before(d), node: $pos.node(d), depth: d }
    }
  }
  return null
}

function selectionInList(state: EditorState): boolean {
  const { $from, $to } = state.selection
  if (findListItemAt($from) || findListItemAt($to)) return true
  let hit = false
  state.doc.nodesBetween(state.selection.from, state.selection.to, (node) => {
    if (node.type.name === 'listItem') hit = true
    return !hit
  })
  return hit
}

function isPosInsideListItem(state: EditorState, pos: number): boolean {
  try {
    return findListItemAt(state.doc.resolve(pos + 1)) != null
  } catch {
    return false
  }
}

function countListDepth($from: EditorState['selection']['$from']): number {
  let depth = 0
  for (let d = $from.depth; d > 0; d--) {
    const name = $from.node(d).type.name
    if (name === 'bulletList' || name === 'orderedList') depth += 1
  }
  return depth
}

function applyBlockIndentDelta(
  state: EditorState,
  tr: Transaction,
  delta: number,
): boolean {
  const { from, to } = state.selection
  let changed = false
  const targets = new Map<number, { attrs: Record<string, unknown> }>()

  state.doc.nodesBetween(from, to, (node, pos) => {
    if (!BLOCK_TYPES.has(node.type.name)) return
    if (isPosInsideListItem(state, pos)) return
    targets.set(pos, { attrs: node.attrs as Record<string, unknown> })
  })

  if (targets.size === 0) {
    const $from = state.selection.$from
    for (let d = $from.depth; d > 0; d--) {
      const node = $from.node(d)
      if (BLOCK_TYPES.has(node.type.name)) {
        const pos = $from.before(d)
        if (!isPosInsideListItem(state, pos)) {
          targets.set(pos, { attrs: node.attrs as Record<string, unknown> })
        }
        break
      }
    }
  }

  targets.forEach(({ attrs }, pos) => {
    const current = Number(attrs.indent) || 0
    const next = Math.max(0, Math.min(MAX_INDENT, current + delta))
    if (next === current) return
    tr.setNodeMarkup(pos, undefined, { ...attrs, indent: next })
    changed = true
  })

  return changed
}

function findListItemContext($from: EditorState['selection']['$from']): {
  item: ProseNode
  itemPos: number
  list: ProseNode
  listDepth: number
} | null {
  const found = findListItemAt($from)
  if (!found) return null
  const listDepth = found.depth - 1
  const list = $from.node(listDepth)
  if (list.type.name !== 'bulletList' && list.type.name !== 'orderedList') {
    return null
  }
  return {
    item: found.node,
    itemPos: found.pos,
    list,
    listDepth,
  }
}

function isEmptyParagraphNode(node: ProseNode | null | undefined): boolean {
  if (!node || node.type.name !== 'paragraph') return false
  return node.content.size === 0
}

/**
 * When sinkListItem cannot run, wrap one level deeper (PRO nested <ul>):
 *   <li>X</li> → <li><p></p><ul><li>X</li></ul></li>
 * Empty <p> is stripped on serialize; CSS hides the wrapper bullet in the editor.
 */
function deepenListItem(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  const { $from } = state.selection
  if (countListDepth($from) >= MAX_LIST_DEPTH) return false

  const ctx = findListItemContext($from)
  if (!ctx) return false

  const { item, itemPos, list } = ctx
  const itemType = state.schema.nodes.listItem
  const paragraphType = state.schema.nodes.paragraph
  if (!itemType || !paragraphType) return false

  // Clear legacy flat indent attrs if present.
  const cleanItem =
    Number(item.attrs.indent) > 0
      ? itemType.create({ ...item.attrs, indent: 0 }, item.content)
      : item

  const nestedList = list.type.create(list.attrs, cleanItem)
  const emptyParagraph = paragraphType.create()
  const wrapper = itemType.create(
    { bridge: true },
    Fragment.from([emptyParagraph, nestedList]),
  )

  if (dispatch) {
    const tr = state.tr.replaceWith(itemPos, itemPos + item.nodeSize, wrapper)
    const caretPos = itemPos + 1 + emptyParagraph.nodeSize + 1 + 1
    tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(caretPos, tr.doc.content.size))))
    dispatch(tr.scrollIntoView())
  }
  return true
}

/** Inverse of deepenListItem. */
function undeepenListItem(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  const { $from } = state.selection
  const ctx = findListItemContext($from)
  if (!ctx) return false

  const { item, list, listDepth } = ctx
  if (list.childCount !== 1) return false

  const wrapperDepth = listDepth - 1
  if (wrapperDepth < 1) return false
  const wrapper = $from.node(wrapperDepth)
  if (wrapper.type.name !== 'listItem') return false
  if (wrapper.childCount !== 2) return false
  if (!isEmptyParagraphNode(wrapper.child(0))) return false
  const nested = wrapper.child(1)
  if (nested.type.name !== 'bulletList' && nested.type.name !== 'orderedList') return false
  if (nested !== list) return false

  const wrapperPos = $from.before(wrapperDepth)
  if (dispatch) {
    const tr = state.tr.replaceWith(wrapperPos, wrapperPos + wrapper.nodeSize, item)
    tr.setSelection(TextSelection.near(tr.doc.resolve(wrapperPos + 1)))
    dispatch(tr.scrollIntoView())
  }
  return true
}

function trySinkListItem(editor: Editor): boolean {
  // Nest under previous sibling — PRO-style <li>…<ul><li>…
  if (editor.can().sinkListItem('listItem')) {
    return editor.commands.sinkListItem('listItem')
  }
  return deepenListItem(editor.state, editor.view.dispatch.bind(editor.view))
}

function tryLiftListItem(editor: Editor): boolean {
  if (undeepenListItem(editor.state, editor.view.dispatch.bind(editor.view))) {
    return true
  }
  if (editor.can().liftListItem('listItem')) {
    return editor.commands.liftListItem('listItem')
  }
  return false
}

export const Indent = Extension.create({
  name: 'indent',
  priority: 120,

  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading'],
        attributes: {
          indent: {
            default: 0,
            parseHTML: (element) => {
              if (element.closest('li')) return 0
              const ml = element.style.marginLeft
              if (!ml) return 0
              const px = parseInt(ml, 10)
              if (Number.isNaN(px) || px <= 0) return 0
              return Math.min(MAX_INDENT, Math.round(px / INDENT_STEP_PX))
            },
            renderHTML: (attributes) => {
              const level = Number(attributes.indent) || 0
              if (level <= 0) return {}
              return { style: `margin-left: ${level * INDENT_STEP_PX}px` }
            },
          },
        },
      },
      {
        types: ['listItem'],
        attributes: {
          bridge: {
            default: false,
            parseHTML: (element) =>
              element.getAttribute('data-list-bridge') === '1' ||
              // Empty shell that only hosts a nested list (PRO-style depth bridge).
              (!element.querySelector(':scope > p') &&
                !!element.querySelector(':scope > ul, :scope > ol')) ||
              (() => {
                const ps = [...element.querySelectorAll(':scope > p')]
                if (ps.length === 0) return false
                const hasText = ps.some(
                  (p) => (p.textContent || '').replace(/\u00a0/g, ' ').trim().length > 0,
                )
                const hasNested = !!element.querySelector(':scope > ul, :scope > ol')
                return hasNested && !hasText
              })(),
            renderHTML: (attributes) => {
              if (!attributes.bridge) return {}
              return { 'data-list-bridge': '1' }
            },
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      indent:
        () =>
        ({ editor, state, dispatch, tr, commands }) => {
          if (selectionInList(state)) {
            if (editor.can().sinkListItem('listItem')) {
              return commands.sinkListItem('listItem')
            }
            return deepenListItem(state, dispatch)
          }
          const changed = applyBlockIndentDelta(state, tr, 1)
          if (changed && dispatch) dispatch(tr)
          return changed
        },
      outdent:
        () =>
        ({ editor, state, dispatch, tr, commands }) => {
          if (selectionInList(state)) {
            if (undeepenListItem(state, dispatch)) return true
            if (editor.can().liftListItem('listItem')) {
              return commands.liftListItem('listItem')
            }
            return false
          }
          const changed = applyBlockIndentDelta(state, tr, -1)
          if (changed && dispatch) dispatch(tr)
          return changed
        },
    }
  },

  addKeyboardShortcuts() {
    return {
      Tab: () => {
        const { editor } = this
        if (selectionInList(editor.state)) {
          trySinkListItem(editor)
          return true
        }
        return editor.commands.indent()
      },
      'Shift-Tab': () => {
        const { editor } = this
        if (selectionInList(editor.state)) {
          tryLiftListItem(editor)
          return true
        }
        return editor.commands.outdent()
      },
    }
  },
})
