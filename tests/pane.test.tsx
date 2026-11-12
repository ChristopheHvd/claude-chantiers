import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'chantiers',
  component: 'Pane',
  requestId: 'chantiers',
  props: {
    title: 'Chantiers',
    isFocused: false,
    bodyColumns: 50,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const NOW = Date.parse('2026-11-12T15:00:00Z')
const SESSIONS = [
  { sessionId: 'local_a', title: 'Bilan client', cwd: '/Code/client-a', isRunning: true, lastActivityAt: '2026-11-12T14:59:00Z', group: null, link: 'claude://x/local_a' },
  { sessionId: 'local_b', title: 'Audit du site', cwd: '/Code/client-a', prState: 'OPEN', prNumber: 72, lastActivityAt: '2026-11-12T10:00:00Z', group: { name: 'CLIENT A' }, link: 'claude://x/local_b' },
  { sessionId: 'local_c', title: 'Vieux brouillon', cwd: '/Code/client-b', lastActivityAt: '2026-11-01T10:00:00Z', group: null, link: 'claude://x/local_c' },
]
const SELF = { sessionId: 'local_self', title: 'Ici', cwd: '/tmp/scratch-workspaces/x', lastActivityAt: '2026-11-12T15:00:00Z', group: null }

const opened: string[][] = []

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const engine = (on: any) => {
  on('clock.now', () => ({ value: NOW }))
  on('mcp.call', (_: unknown, e: { tool: string }) => ({
    value: { content: [{ type: 'text', text: JSON.stringify(e.tool === 'get_session' ? SELF : SESSIONS) }], isError: false },
  }))
  on('process.run', (_: unknown, e: { argv: readonly string[] }) => {
    opened.push([...e.argv])
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('command.register', () => ({ value: { command: 'chantiers' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('command.run', () => ({ text: '' }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.close', () => undefined)
}

test('the band shows counts and a toggle', async ($, on) => {
  engine(on)
  await $.command.run({ command: 'chantiers', args: '' } as never)
  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ plugin: 'chantiers', component: 'AbovePrompt', props: { bodyColumns: 80, hasSurvey: false }, surface } as never)
    expect(await ui.find({ type: 'Text', text: '2 en cours' })).toBeDefined()
    expect(await ui.find({ key: 'toggle-pane' })).toBeDefined()
    await ui.unmount()
  }
})

test('groups by project, hides idle, opens on press', async ($, on) => {
  engine(on)
  await $.command.run({ command: 'chantiers', args: '' } as never)

  for (const surface of ['desktop', 'terminal', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: 'CLIENT A' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Client a' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: 'Bilan client' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Vieux brouillon' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: 'PR #72' })).toBeDefined()
    await ui.unmount()
  }

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'local_a' })
  expect(opened.at(-1)).toEqual(['open', 'claude://x/local_a'])
  await ui.press({ key: 'toggle-idle' })
  expect(await ui.find({ type: 'Text', text: 'Vieux brouillon' })).toBeDefined()
  await ui.unmount()
})
