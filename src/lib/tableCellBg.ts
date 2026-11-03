import { TableCell, TableHeader } from '@tiptap/extension-table'

/**
 * Froala/PRO tables set cell fill, width %, and vertical-align via inline style.
 * TipTap defaults omit those — extend both cell types.
 */
const extraCellAttrs = {
  backgroundColor: {
    default: null as string | null,
    parseHTML: (element: HTMLElement) => {
      const raw =
        element.style.backgroundColor ||
        element.getAttribute('bgcolor') ||
        null
      return raw || null
    },
    renderHTML: (attributes: { backgroundColor?: string | null }) => {
      if (!attributes.backgroundColor) return {}
      return { style: `background-color: ${attributes.backgroundColor}` }
    },
  },
  cellWidth: {
    default: null as string | null,
    parseHTML: (element: HTMLElement) => element.style.width || null,
    renderHTML: (attributes: { cellWidth?: string | null }) => {
      if (!attributes.cellWidth) return {}
      return { style: `width: ${attributes.cellWidth}` }
    },
  },
  verticalAlign: {
    default: null as string | null,
    parseHTML: (element: HTMLElement) =>
      element.style.verticalAlign || element.getAttribute('valign') || null,
    renderHTML: (attributes: { verticalAlign?: string | null }) => {
      if (!attributes.verticalAlign) return {}
      return { style: `vertical-align: ${attributes.verticalAlign}` }
    },
  },
}

export const TableCellWithBg = TableCell.extend({
  name: 'tableCell',
  addAttributes() {
    return {
      ...this.parent?.(),
      ...extraCellAttrs,
    }
  },
})

export const TableHeaderWithBg = TableHeader.extend({
  name: 'tableHeader',
  addAttributes() {
    return {
      ...this.parent?.(),
      ...extraCellAttrs,
    }
  },
})
