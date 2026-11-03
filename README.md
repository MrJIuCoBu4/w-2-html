# Word 2 HTML

Local dual-pane editor: rich text on the left, live HTML on the right. Paste from Word or the web, clean up markup, and copy export-ready HTML — entirely in the browser, no backend.

**Repository:** [github.com/MrJIuCoBu4/w-2-html](https://github.com/MrJIuCoBu4/w-2-html)

## Stack

- [Vite](https://vite.dev/) + React 19 + TypeScript
- [TipTap](https://tiptap.dev/) (ProseMirror) — visual editor
- [CodeMirror 6](https://codemirror.net/) — HTML pane
- [js-beautify](https://github.com/beautify-web/js-beautify) — prettify / minify
- [react-icons](https://react-icons.github.io/react-icons/) (Font Awesome) — toolbar chrome

## Features

- **Visual ↔ HTML sync** with shared undo/redo across panes
- **Toolbar**: bold/italic/underline/strike, colors, fonts, headings, align, lists (style variants), indent, line height, tables (size grid + bubble toolbar), links, images, video embeds, HR, code block, blockquote, special characters, emojis, copy HTML
- **Paste modes**: keep formatting, clean Word junk, or ask
- **Code tools**: find/replace, prettify, compress, whitespace view, font size, fullscreen HTML pane
- **Layout**: equal dual panes, collapse either side, compact toolbar (More Text), mobile preview width, responsive stack with equal outer/gap padding
- **Settings**: paste mode, font size unit (px/pt), LTR/RTL, pane height, CodeMirror options, auto-save, character encoding, full-page HTML on copy, custom CSS & fonts (collapsible Appearance)
- Preferences and optional document draft stored in `localStorage`

### Character encoding

Settings → Export → Character encoding:

| Mode      | Behavior |
| --------- | -------- |
| **Named** | Western European letters & symbols → `&eacute;`, `&auml;`, `&copy;`, `&mdash;`, … Letters without an HTML named entity (Russian, CJK, …) stay UTF-8 — never `&#1092;`. |
| **Numeric** | Special symbols → `&#…;`. All letters stay UTF-8. |
| **Raw UTF-8** | No entity encoding. |

## Setup

```bash
npm install
npm run dev
```

Open the URL Vite prints (default `http://localhost:5173/`).

## Scripts

| Command           | Description                  |
| ----------------- | ---------------------------- |
| `npm run dev`     | Dev server with HMR          |
| `npm run build`   | Typecheck + production build |
| `npm run preview` | Serve the `dist/` build      |
| `npm run lint`    | Oxlint                       |

## Project layout

```
src/
  components/   VisualEditor, HtmlEditor, Toolbar, Settings, tables…
  lib/          settings, sync, cleanup, lists, special chars, encoding…
  App.tsx       Dual-pane shell and history
public/         favicon
```

## Notes

- Runs entirely client-side; suitable for offline / private drafting.
- Custom CSS under Settings → Appearance is scoped to the visual document.
- Custom font names/URLs feed the font family menu (separate entries with `#`).
