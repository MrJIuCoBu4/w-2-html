import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        // Keep the editor engines in their own chunks: they change rarely, so
        // browsers can cache them across app rebuilds (and no chunk is >500 kB).
        codeSplitting: {
          groups: [
            {
              name: 'tiptap',
              test: /node_modules[\\/](@tiptap|prosemirror-)/,
              priority: 30,
            },
            {
              name: 'codemirror-grammars',
              test: '@codemirror/lang-',
              priority: 31,
            },
            {
              name: 'lezer',
              test: '@lezer',
              priority: 40,
            },
            {
              name: 'codemirror',
              test: /node_modules[\\/]@codemirror/,
              priority: 30,
            },
            {
              name: 'codemirror-react',
              test: /node_modules[\\/](@uiw|style-mod|crelt)/,
              priority: 30,
            },
            {
              name: 'react',
              test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
              priority: 20,
            },
            {
              name: 'vendor',
              test: /node_modules[\\/]/,
              priority: 10,
            },
          ],
        },
      },
    },
  },
})
