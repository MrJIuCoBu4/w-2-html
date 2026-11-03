import { Extension } from '@tiptap/core'

export type OrderedListStyle =
  | 'default'
  | 'lower-alpha'
  | 'upper-alpha'
  | 'lower-greek'
  | 'lower-roman'
  | 'upper-roman'

export type BulletListStyle = 'default' | 'circle' | 'disc' | 'square'

const ORDERED_HTML_TYPE: Record<Exclude<OrderedListStyle, 'default' | 'lower-greek'>, string> = {
  'lower-alpha': 'a',
  'upper-alpha': 'A',
  'lower-roman': 'i',
  'upper-roman': 'I',
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    listStyles: {
      setOrderedListStyle: (style: OrderedListStyle) => ReturnType
      setBulletListStyle: (style: BulletListStyle) => ReturnType
    }
  }
}

/** CSS list-style-type for bullet lists (+ greek ordered). */
export const ListStyles = Extension.create({
  name: 'listStyles',

  addGlobalAttributes() {
    return [
      {
        types: ['bulletList'],
        attributes: {
          listStyleType: {
            default: null,
            parseHTML: (element) => {
              const fromStyle = element.style.listStyleType
              if (fromStyle) return fromStyle
              return null
            },
            renderHTML: (attributes) => {
              const v = attributes.listStyleType as string | null
              if (!v || v === 'default') return {}
              return { style: `list-style-type: ${v}` }
            },
          },
        },
      },
      {
        types: ['orderedList'],
        attributes: {
          listStyleType: {
            default: null,
            parseHTML: (element) => {
              const fromStyle = element.style.listStyleType
              if (fromStyle) return fromStyle
              return null
            },
            renderHTML: (attributes) => {
              const v = attributes.listStyleType as string | null
              if (!v || v === 'default') return {}
              // Prefer CSS for greek; HTML type covers alpha/roman via `type` attr
              if (v === 'lower-greek') return { style: `list-style-type: ${v}` }
              return {}
            },
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      setOrderedListStyle:
        (style) =>
        ({ editor, chain }) => {
          const attrs =
            style === 'default'
              ? { type: null, listStyleType: null }
              : style === 'lower-greek'
                ? { type: null, listStyleType: 'lower-greek' }
                : { type: ORDERED_HTML_TYPE[style], listStyleType: null }

          let next = chain().focus()
          if (!editor.isActive('orderedList')) {
            next = next.toggleOrderedList()
          }
          return next.updateAttributes('orderedList', attrs).run()
        },
      setBulletListStyle:
        (style) =>
        ({ editor, chain }) => {
          const attrs =
            style === 'default'
              ? { listStyleType: null }
              : { listStyleType: style }

          let next = chain().focus()
          if (!editor.isActive('bulletList')) {
            next = next.toggleBulletList()
          }
          return next.updateAttributes('bulletList', attrs).run()
        },
    }
  },
})

export const ORDERED_LIST_STYLES: { label: string; value: OrderedListStyle }[] = [
  { label: 'Default', value: 'default' },
  { label: 'Lower Alpha', value: 'lower-alpha' },
  { label: 'Upper Alpha', value: 'upper-alpha' },
  { label: 'Lower Greek', value: 'lower-greek' },
  { label: 'Lower Roman', value: 'lower-roman' },
  { label: 'Upper Roman', value: 'upper-roman' },
]

export const BULLET_LIST_STYLES: { label: string; value: BulletListStyle }[] = [
  { label: 'Default', value: 'default' },
  { label: 'Circle', value: 'circle' },
  { label: 'Disc', value: 'disc' },
  { label: 'Square', value: 'square' },
]
