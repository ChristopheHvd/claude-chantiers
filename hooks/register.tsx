import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Board, Row } from '../types'

const PANE = 'chantiers'
const TITLE = 'Chantiers'
const REFRESH_MS = 15_000
const RECENT_MS = 24 * 60 * 60 * 1000
const SERVER = 'ccd_session_mgmt'

const board = atom({ plugin: 'chantiers', key: 'board' } as const, { rows: [], error: null, at: 0 } as Board, {
  shape: 'board-2',
})
const showIdle = atom({ plugin: 'chantiers', key: 'showIdle' } as const, false, { shape: 'show-idle-1' })
const paneOpen = atom({ plugin: 'chantiers', key: 'paneOpen' } as const, false, { shape: 'pane-open-1' })

type RawSession = {
  sessionId: string
  title?: string
  cwd?: string
  isRunning?: boolean
  prNumber?: number
  prState?: string
  lastActivityAt?: string
  group?: { name: string } | null
  pinned?: boolean
  link?: string
}

const STATE_ORDER: Record<Row['state'], number> = { running: 0, pr: 1, recent: 2, idle: 3 }
const DOT_COLOR: Record<Row['state'], string> = {
  running: 'success',
  pr: 'warning',
  recent: 'suggestion',
  idle: 'inactive',
}

const folderOf = (cwd = ''): string => {
  if (cwd.includes('/scratch-workspaces/')) return ''
  const base = cwd.split('/.claude/worktrees/')[0] ?? cwd
  return base.split('/').filter(Boolean).at(-1) ?? ''
}

const prettyFolder = (folder: string): string => {
  if (!folder) return 'Sans dossier'
  const words = folder.replace(/[-_]+/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

const toRow = (s: RawSession, now: number, isCurrent: boolean): Row => {
  const last = s.lastActivityAt ?? ''
  const state: Row['state'] =
    s.isRunning || isCurrent
      ? 'running'
      : s.prState === 'OPEN'
        ? 'pr'
        : now - Date.parse(last) < RECENT_MS
          ? 'recent'
          : 'idle'
  return {
    id: s.sessionId,
    title: s.title || 'Sans titre',
    project: s.group?.name ?? '',
    folder: folderOf(s.cwd),
    state,
    prNumber: s.prState === 'OPEN' ? s.prNumber : undefined,
    link: s.link,
    pinned: s.pinned === true,
    isCurrent,
    lastActivityAt: last,
  }
}

const textOf = (res: { content: unknown[]; isError: boolean }): string => {
  const text = res.content.map(b => (b && typeof b === 'object' && 'text' in b ? String(b.text) : '')).join('')
  if (res.isError) throw new Error(text || 'appel refusé')
  return text
}

const refresh = async ($: EngineInterface) => {
  const now = await $.clock.now()
  try {
    const [list, self] = await Promise.all([
      $.mcp.call(SERVER, 'list_sessions', { limit: 100 }),
      $.mcp.call(SERVER, 'get_session', { session_id: 'self' }),
    ])
    const others = (JSON.parse(textOf(list)) as RawSession[]).map(s => toRow(s, now, false))
    const current = toRow(JSON.parse(textOf(self)) as RawSession, now, true)
    await update($, board, () => ({ rows: [current, ...others], error: null, at: now }))
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    await update($, board, b => ({ ...b, error, at: now }))
  }
}

const openSession = async ($: EngineInterface, row: Row) => {
  if (row.isCurrent) return
  if (!row.link) return $.ui.toast('Pas de lien pour cette session.')
  const { exitCode, stderr } = await $.process.run(['open', row.link])
  if (exitCode !== 0) $.ui.toast(`Ouverture impossible : ${stderr.trim()}`)
}

// Sessions without a sidebar group join the group used by other sessions of the same folder.
const groupRows = (rows: Row[]) => {
  const folderGroup = new Map<string, string>()
  for (const row of rows) if (row.project && row.folder) folderGroup.set(row.folder, row.project)

  const byProject = new Map<string, Row[]>()
  for (const row of rows) {
    const name = row.project || folderGroup.get(row.folder) || prettyFolder(row.folder)
    byProject.set(name, [...(byProject.get(name) ?? []), row])
  }
  const byState = (a: Row, b: Row) =>
    STATE_ORDER[a.state] - STATE_ORDER[b.state] || b.lastActivityAt.localeCompare(a.lastActivityAt)
  return [...byProject.entries()]
    .map(([name, list]) => ({ name, rows: list.sort(byState) }))
    .sort((a, b) => byState(a.rows[0]!, b.rows[0]!))
}

const ago = (iso: string, now: number): string => {
  const min = Math.floor((now - Date.parse(iso)) / 60_000)
  if (!Number.isFinite(min) || min < 1) return 'maintenant'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} h`
  return `${Math.floor(h / 24)} j`
}

const openPane = async ($: EngineInterface) => {
  await $.ui.open({ id: PANE, title: TITLE })
  await update($, paneOpen, () => true)
}

const togglePane = async ($: EngineInterface) => {
  const isUp = (await $.ui.panes()).some(pane => pane.id === PANE)
  if (isUp) return $.ui.close({ id: PANE })
  await openPane($)
  await refresh($)
}

const clockTime = (ms: number) =>
  ms ? new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '–'

const statusLabel = (row: Row): string =>
  row.isCurrent
    ? 'ici'
    : row.state === 'running'
      ? 'en cours'
      : row.state === 'pr'
        ? `PR #${row.prNumber}`
        : ''

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'chantiers', description: 'Ouvre le panneau des chantiers en cours' })
    void openPane($)
    void refresh($)
    $.clock.every(REFRESH_MS, () => void refresh($))
    return next(e)
  })

  on('command.run', { command: 'chantiers' }, async $ => {
    await togglePane($)
    return { text: 'Panneau Chantiers basculé.' }
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === PANE) await update($, paneOpen, () => false)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const { rows } = await read($, board)
    const isOpen = await read($, paneOpen)
    const running = rows.filter(r => r.state === 'running').length
    const prs = rows.filter(r => r.state === 'pr').length

    return (
      <Box flexDirection="row" alignItems="center" gap="sm">
        <Button key="toggle-pane" variant="secondary" onPress={() => togglePane($)}>
          {isOpen ? '▤ Fermer Chantiers' : '▤ Chantiers'}
        </Button>
        <Text color="success">●</Text>
        <Text size="footnote" dimColor>
          {`${running} en cours`}
        </Text>
        <Text color="warning">●</Text>
        <Text size="footnote" dimColor>
          {`${prs} PR`}
        </Text>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const { rows, error, at } = await read($, board)
    const withIdle = await read($, showIdle)
    const now = at || (await $.clock.now())

    const running = rows.filter(r => r.state === 'running').length
    const prs = rows.filter(r => r.state === 'pr').length
    const idle = rows.filter(r => r.state === 'idle').length
    const groups = groupRows(withIdle ? rows : rows.filter(r => r.state !== 'idle'))

    const chip = (key: string, color: string, label: string) => (
      <Box key={key} flexDirection="row" gap="xs" alignItems="center" paddingX="sm" borderStyle="round" borderColor="subtle">
        <Text color={color}>●</Text>
        <Text size="footnote">{label}</Text>
      </Box>
    )

    return (
      <Box flexDirection="column" gap="md">
        <Box flexDirection="row" gap="sm" alignItems="center" flexWrap="wrap">
          {chip('c-run', 'success', `${running} en cours`)}
          {chip('c-pr', 'warning', `${prs} PR ouvertes`)}
          <Box flexGrow={1} />
          <Text size="caption" dimColor tabular>
            actualisé {clockTime(at)}
          </Text>
          <Button key="refresh" variant="secondary" onPress={() => refresh($)}>
            ↻
          </Button>
        </Box>

        {error && (
          <Box borderStyle="round" borderColor="error" padding="sm">
            <Text color="error">Lecture impossible : {error}</Text>
          </Box>
        )}
        {!error && rows.length === 0 && <Text dimColor>Chargement…</Text>}

        {groups.map(group => (
          <Box key={`p-${group.name}`} flexDirection="column" gap="xs" padding="sm" borderStyle="round" borderColor="subtle">
            <Box flexDirection="row" justifyContent="space-between" alignItems="center" paddingX="xs">
              <Text weight="semibold">{group.name}</Text>
              <Text size="caption" dimColor tabular>
                {group.rows.length}
              </Text>
            </Box>
            {group.rows.map(row => (
              <Box
                key={`r-${row.id}`}
                flexDirection="row"
                alignItems="center"
                justifyContent="space-between"
                gap="sm"
                paddingX="xs"
                hover={{ backgroundColor: e.surface === 'terminal' ? 'subtle' : 'rgba(127,127,127,0.15)' }}
              >
                <Box flexDirection="row" alignItems="center" gap="xs">
                  <Text color={row.isCurrent ? 'claude' : DOT_COLOR[row.state]}>●</Text>
                  <Button key={row.id} plain onPress={() => openSession($, row)}>
                    <Text wrap="truncate-end" weight={row.isCurrent ? 'semibold' : 'regular'} dimColor={row.state === 'idle'}>
                      {row.title}
                    </Text>
                    {row.pinned ? <Text dimColor> · épinglée</Text> : ''}
                  </Button>
                </Box>
                <Text
                  size="caption"
                  dimColor={!statusLabel(row)}
                  color={row.isCurrent ? 'claude' : statusLabel(row) ? DOT_COLOR[row.state] : undefined}
                  tabular
                >
                  {statusLabel(row) || ago(row.lastActivityAt, now)}
                </Text>
              </Box>
            ))}
          </Box>
        ))}

        {idle > 0 && (
          <Button key="toggle-idle" variant="secondary" onPress={() => update($, showIdle, v => !v)}>
            {withIdle ? 'Masquer les sessions inactives' : `Afficher les ${idle} sessions inactives`}
          </Button>
        )}
      </Box>
    )
  })
}
