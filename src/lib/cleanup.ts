import { html as beautifyHtml } from 'js-beautify'

export function prettifyHtml(html: string): string {
  return beautifyHtml(html, {
    indent_size: 2,
    wrap_line_length: 0,
    preserve_newlines: true,
    max_preserve_newlines: 2,
    end_with_newline: false,
  })
}

export function minifyHtml(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\r?\n/g, '')
    .replace(/>\s+</g, '><')
    .replace(/\s{2,}/g, ' ')
    .trim()
}
