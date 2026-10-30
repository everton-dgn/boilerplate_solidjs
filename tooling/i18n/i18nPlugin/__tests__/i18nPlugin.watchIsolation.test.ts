import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'

import { resolveConfig } from 'vite-plus'

import { writeProject } from '../../testProject/index.ts'
import { i18nPlugin } from '../index.ts'

type StabilityOptions = {
  stabilityThreshold: number
  pollInterval: number
}
type WatchCase = {
  name: string
  stability: false | StabilityOptions | undefined
}

const CASES: WatchCase[] = [
  { name: 'the default watcher', stability: undefined },
  { name: 'explicitly disabled write stabilization', stability: false },
  {
    name: 'user-provided write stabilization',
    stability: { stabilityThreshold: 750, pollInterval: 25 }
  }
]

describe('i18n watcher isolation', () => {
  for (const { name, stability } of CASES) {
    it(`preserves ${name} for application files`, async context => {
      const root = await mkdtemp(path.join(tmpdir(), 'i18n-watch-options-'))
      context.after(() => rm(root, { recursive: true, force: true }))
      await writeProject({ root, messages: { home_title: 'Title' } })

      const config = await resolveConfig(
        {
          root,
          configFile: false,
          logLevel: 'silent',
          server: { watch: { awaitWriteFinish: stability } },
          plugins: [i18nPlugin()]
        },
        'serve'
      )

      assert.deepEqual(config.server.watch?.awaitWriteFinish, stability)
    })
  }
})
