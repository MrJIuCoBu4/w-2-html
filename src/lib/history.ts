const MAX_HISTORY = 80

export type HtmlHistory = {
  past: string[]
  present: string
  future: string[]
}

export function createHistory(initial: string): HtmlHistory {
  return { past: [], present: initial, future: [] }
}

export function pushHistory(state: HtmlHistory, next: string): HtmlHistory {
  if (next === state.present) return state
  const past = [...state.past, state.present].slice(-MAX_HISTORY)
  return { past, present: next, future: [] }
}

export function undoHistory(state: HtmlHistory): HtmlHistory {
  if (state.past.length === 0) return state
  const past = [...state.past]
  const previous = past.pop()!
  return {
    past,
    present: previous,
    future: [state.present, ...state.future],
  }
}

export function redoHistory(state: HtmlHistory): HtmlHistory {
  if (state.future.length === 0) return state
  const [next, ...future] = state.future
  return {
    past: [...state.past, state.present],
    present: next,
    future,
  }
}

export function canUndo(state: HtmlHistory): boolean {
  return state.past.length > 0
}

export function canRedo(state: HtmlHistory): boolean {
  return state.future.length > 0
}
