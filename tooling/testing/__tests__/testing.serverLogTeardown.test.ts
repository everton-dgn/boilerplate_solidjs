import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { env } from 'node:process'
import { test, type TestContext } from 'node:test'

import checkServerLog from '../server-log-teardown.ts'

const BASE_URL = 'http://127.0.0.1:4317'
const STARTUP = `  ➜  Local:   ${BASE_URL}/\n`
const OMITTED = '[server-error] Unexpected failure; private details omitted\n'

async function logFile(context: TestContext): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'server-log-teardown-'))
  // Sandbox created by the test itself: direct removal is the right disposal.
  context.after(() => rm(directory, { recursive: true, force: true }))
  const previous = {
    SERVER_LOG_FILE: env.SERVER_LOG_FILE,
    BASE_URL_TEST: env.BASE_URL_TEST
  }
  context.after(() => {
    for (const [name, value] of Object.entries(previous)) {
      // Assigning undefined to env writes the text "undefined".
      if (value === undefined) Reflect.deleteProperty(env, name)
      else env[name] = value
    }
  })
  const file = path.join(directory, 'server.log')
  env.SERVER_LOG_FILE = file
  env.BASE_URL_TEST = BASE_URL
  return file
}

test('accepts the preview log without private markers', async context => {
  const file = await logFile(context)
  await writeFile(file, `${STARTUP}${OMITTED}PRIVATE details\n`)

  await checkServerLog()
})

test('refuses a log without the preview startup', async context => {
  const file = await logFile(context)
  await writeFile(file, OMITTED)

  await assert.rejects(checkServerLog(), /does not show the preview startup/u)
})

test('refuses private markers of any suite, colored ones included', async context => {
  const file = await logFile(context)
  for (const marker of [
    `PRIVATE_BACKEND_${crypto.randomUUID()}`,
    `PRIVATE_MARKDOWN_${crypto.randomUUID()}`,
    `PRIVATE_MARKDOWN_REUSED_${crypto.randomUUID()}`,
    '\u001B[31mPRIVATE_\u001B[39mHEADER'
  ]) {
    await writeFile(file, `${STARTUP}Error: ${marker}\n`)

    await assert.rejects(checkServerLog(), /private marker/u, marker)
  }
})

test('refuses the run without the configured log file', async context => {
  await logFile(context)
  Reflect.deleteProperty(env, 'SERVER_LOG_FILE')

  await assert.rejects(checkServerLog(), /not configured/u)
})
