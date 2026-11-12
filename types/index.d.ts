export type Row = {
  id: string
  title: string
  project: string
  folder: string
  state: 'running' | 'pr' | 'recent' | 'idle'
  prNumber?: number
  link?: string
  pinned: boolean
  isCurrent: boolean
  lastActivityAt: string
}

export type Board = { rows: Row[]; error: string | null; at: number }

declare module 'claude-code' {
  interface PluginState {
    chantiers: { board: Shaped<Board>; showIdle: Shaped<boolean>; paneOpen: Shaped<boolean> }
  }
}
