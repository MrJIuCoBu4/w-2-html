import { mergeAttributes, Node } from '@tiptap/core'

function toEmbedUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  try {
    const u = new URL(trimmed)
    const host = u.hostname.replace(/^www\./, '')
    if (host === 'youtu.be') {
      const id = u.pathname.replace(/^\//, '').split('/')[0]
      return id ? `https://www.youtube.com/embed/${id}` : null
    }
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      const id = u.searchParams.get('v')
      if (id) return `https://www.youtube.com/embed/${id}`
      const parts = u.pathname.split('/')
      const embedIdx = parts.indexOf('embed')
      if (embedIdx >= 0 && parts[embedIdx + 1]) {
        return `https://www.youtube.com/embed/${parts[embedIdx + 1]}`
      }
      const shortsIdx = parts.indexOf('shorts')
      if (shortsIdx >= 0 && parts[shortsIdx + 1]) {
        return `https://www.youtube.com/embed/${parts[shortsIdx + 1]}`
      }
    }
    if (host === 'vimeo.com') {
      const id = u.pathname.split('/').filter(Boolean)[0]
      return id ? `https://player.vimeo.com/video/${id}` : null
    }
    if (/\.(mp4|webm|ogg)(\?|$)/i.test(u.pathname)) return trimmed
    // Allow direct iframe-friendly URLs
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed
  } catch {
    return null
  }
  return null
}

export { toEmbedUrl }

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    iframeVideo: {
      setIframeVideo: (options: { src: string }) => ReturnType
    }
  }
}

/** Simple iframe embed for video URLs (YouTube / Vimeo / generic). */
export const IframeVideo = Node.create({
  name: 'iframeVideo',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (el) => el.getAttribute('src'),
        renderHTML: (attrs) => (attrs.src ? { src: attrs.src } : {}),
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'iframe[src]',
        getAttrs: (el) => {
          if (typeof el === 'string') return false
          const src = el.getAttribute('src')
          return src ? { src } : false
        },
      },
      {
        tag: 'div[data-iframe-video]',
        getAttrs: (el) => {
          if (typeof el === 'string') return false
          const iframe = el.querySelector('iframe')
          const src = iframe?.getAttribute('src')
          return src ? { src } : false
        },
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      { 'data-iframe-video': '', class: 'iframe-video-wrap' },
      [
        'iframe',
        mergeAttributes(HTMLAttributes, {
          frameborder: '0',
          allowfullscreen: 'true',
          allow:
            'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
        }),
      ],
    ]
  },

  addCommands() {
    return {
      setIframeVideo:
        ({ src }) =>
        ({ commands }) => {
          const embed = toEmbedUrl(src)
          if (!embed) return false
          return commands.insertContent({
            type: this.name,
            attrs: { src: embed },
          })
        },
    }
  },
})
