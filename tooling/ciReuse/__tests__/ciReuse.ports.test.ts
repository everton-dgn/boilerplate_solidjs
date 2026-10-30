import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { env, kill } from 'node:process'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'

import { createPorts } from '../createPorts/index.ts'

const POLL_MS = 20
const MAX_POLLS = 250
const PORT_CALLS = 4
// Bem abaixo do timeout de 20 s de cada comando: só o sinal explica o fim.
const ABORT_LIMIT_MS = 5000
const FAKE_COMMAND = `#!/bin/sh
echo $$ >> "$FAKE_PIDS"
exec /bin/sleep 30
`

async function readPids(file: string): Promise<number[]> {
  try {
    const content = await readFile(file, 'utf8')
    return content.split('\n').filter(Boolean).map(Number)
  } catch {
    return []
  }
}

async function hasStarted(file: string): Promise<boolean> {
  const pids = await readPids(file)
  return pids.length === PORT_CALLS
}

function isAlive(pid: number): boolean {
  try {
    kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function waitFor(condition: () => Promise<boolean>): Promise<void> {
  for (let poll = 0; poll < MAX_POLLS; poll += 1) {
    if (await condition()) return
    await delay(POLL_MS)
  }
  assert.fail('Condição não atingida no prazo.')
}

test('o sinal da prova encerra os subprocessos em andamento', async context => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ci-reuse-ports-'))
  // Sandbox criado pelo próprio teste: a remoção direta é o descarte correto.
  context.after(() => rm(directory, { recursive: true, force: true }))
  for (const name of ['gh', 'git']) {
    await writeFile(path.join(directory, name), FAKE_COMMAND, { mode: 0o755 })
  }
  const pidsFile = path.join(directory, 'pids')
  const previous = { PATH: env.PATH, FAKE_PIDS: env.FAKE_PIDS }
  context.after(() => {
    for (const [name, value] of Object.entries(previous)) {
      // Atribuir undefined ao env grava o texto "undefined".
      if (value === undefined) Reflect.deleteProperty(env, name)
      else env[name] = value
    }
  })
  env.PATH = directory
  env.FAKE_PIDS = pidsFile
  const controller = new AbortController()
  const ports = createPorts({
    repository: 'owner/repo',
    signal: controller.signal
  })
  const pending = Promise.allSettled([
    ports.api('repos/owner/repo'),
    ports.git(['status']),
    ports.readBlob('HEAD:bun.lock'),
    ports.readEvidence(1)
  ])
  await waitFor(() => hasStarted(pidsFile))
  const pids = await readPids(pidsFile)
  const started = performance.now()

  controller.abort()
  const results = await pending

  assert.ok(performance.now() - started < ABORT_LIMIT_MS)
  assert.deepEqual(
    results.map(result => result.status),
    Array.from({ length: PORT_CALLS }, () => 'rejected')
  )
  await waitFor(() => Promise.resolve(pids.every(pid => !isAlive(pid))))
})
