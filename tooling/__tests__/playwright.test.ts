import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  unlink,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { env, execPath } from 'node:process'
import { it } from 'node:test'
import { promisify } from 'node:util'

import * as v from 'valibot'

const CONFIG = new URL('../playwright.ts', import.meta.url).href
const exec = promisify(execFile)
const LAST_INDEX = -1
const serverSchema = v.object({ command: v.string() })
const configSchema = v.object({ webServer: v.array(serverSchema) })

async function readWorkflowScript(marker: string): Promise<string> {
  const workflow = await readFile(
    new URL('../../.github/workflows/ci.yml', import.meta.url),
    'utf8'
  )
  const script = workflow
    .split(`<<'${marker}'\n`)[1]
    ?.split(`\n          ${marker}`)[0]
  assert.ok(script, `Missing workflow script ${marker}`)
  return script
}

it('builds local suites once and only previews an existing production build', async context => {
  const directory = await mkdtemp(path.join(tmpdir(), 'playwright-build-'))
  context.after(() => rm(directory, { recursive: true, force: true }))
  await writeFile(
    path.join(directory, 'vp'),
    '#!/bin/sh\nprintf "%s\\n" "$*" >> "$COMMAND_LOG"\n',
    { mode: 0o755 }
  )
  for (const options of [
    {
      production: 'false',
      prebuilt: 'false',
      expected: ['run build --mode e2e', 'run start --strictPort']
    },
    {
      production: 'true',
      prebuilt: 'false',
      expected: ['run build --mode production', 'run start --strictPort']
    },
    {
      production: 'true',
      prebuilt: 'true',
      expected: ['run start --strictPort']
    }
  ]) {
    const { stdout } = await exec(
      execPath,
      [
        '--input-type=module',
        '--eval',
        `const {default: config} = await import(${JSON.stringify(CONFIG)}); process.stdout.write(JSON.stringify(config));`
      ],
      {
        env: {
          ...env,
          TEST_PRODUCTION_ROUTES: options.production,
          TEST_PREBUILT: options.prebuilt
        }
      }
    )
    const config = v.parse(configSchema, JSON.parse(stdout))
    const server = config.webServer.at(LAST_INDEX)
    assert.ok(server)
    const log = path.join(
      directory,
      `commands-${options.production}-${options.prebuilt}`
    )
    await exec('sh', ['-c', server.command], {
      cwd: directory,
      env: {
        ...env,
        PATH: `${directory}${path.delimiter}${env.PATH ?? ''}`,
        COMMAND_LOG: log
      }
    })
    const commands = await readFile(log, 'utf8')
    assert.deepEqual(commands.trim().split('\n'), options.expected)
  }
})

it('rejects prebuilt mode for fixture routes', async () => {
  await assert.rejects(
    exec(
      execPath,
      [
        '--input-type=module',
        '--eval',
        `await import(${JSON.stringify(CONFIG)})`
      ],
      {
        env: { ...env, TEST_PRODUCTION_ROUTES: 'false', TEST_PREBUILT: 'true' }
      }
    ),
    /TEST_PREBUILT requires production routes/u
  )
})

it('passes only public build variables to production tests and propagates their failure', async context => {
  const directory = await mkdtemp(path.join(tmpdir(), 'playwright-env-'))
  context.after(() => rm(directory, { recursive: true, force: true }))
  await mkdir(path.join(directory, '.vercel'))
  await writeFile(
    path.join(directory, '.vercel/.env.production.local'),
    [
      'PRIVATE_TEST_TOKEN=do-not-pass',
      'VITE_FROM_FILE="first line\nsecond line"',
      'VITE_EXISTING=file-value'
    ].join('\n')
  )
  const cli = path.join(directory, 'vp')
  await writeFile(
    cli,
    `#!/bin/sh
test "$*" = 'run test:e2e:production' || exit 1
exec "$TEST_NODE" --input-type=module -e 'process.stdout.write(JSON.stringify({private: process.env.PRIVATE_TEST_TOKEN, public: process.env.VITE_FROM_FILE, existing: process.env.VITE_EXISTING}))'
`,
    { mode: 0o755 }
  )
  const script = await readWorkflowScript('NODE_TEST')
  const options = {
    cwd: directory,
    env: {
      ...env,
      PATH: `${directory}${path.delimiter}${env.PATH ?? ''}`,
      TEST_NODE: execPath,
      PRIVATE_TEST_TOKEN: undefined,
      VITE_FROM_FILE: undefined,
      VITE_EXISTING: 'process-value'
    }
  }
  const { stdout } = await exec(
    execPath,
    ['--input-type=module', '--eval', script],
    options
  )
  assert.deepEqual(JSON.parse(stdout), {
    public: 'first line\nsecond line',
    existing: 'process-value'
  })
  await writeFile(cli, '#!/bin/sh\nexit 7\n')
  await assert.rejects(
    exec(execPath, ['--input-type=module', '--eval', script], options),
    { code: 7 }
  )
})

it('accepts a self-contained artifact and rejects external file references', async context => {
  const directory = await mkdtemp(path.join(tmpdir(), 'playwright-artifact-'))
  context.after(() => rm(directory, { recursive: true, force: true }))
  const output = path.join(directory, '.vercel/output')
  await mkdir(output, { recursive: true })
  await writeFile(path.join(output, 'index.mjs'), 'export default {}')
  await symlink('index.mjs', path.join(output, 'internal.mjs'))
  const script = await readWorkflowScript('NODE_ARTIFACT')
  const args = ['--input-type=module', '--eval', script]
  await exec(execPath, args, { cwd: directory })
  const outside = path.join(directory, 'outside.mjs')
  const external = path.join(output, 'external.mjs')
  await writeFile(outside, 'export default {}')
  await symlink(outside, external)
  await assert.rejects(
    exec(execPath, args, { cwd: directory }),
    /external symbolic link/u
  )
  await unlink(external)
  await writeFile(
    path.join(output, '.vc-config.json'),
    JSON.stringify({ filePathMap: { 'index.mjs': 'outside.mjs' } })
  )
  await assert.rejects(
    exec(execPath, args, { cwd: directory }),
    /instead of using filePathMap/u
  )
})
