import { appendFile } from 'node:fs/promises'
import { env } from 'node:process'

import { shouldTestRelease } from './shouldTestRelease/index.ts'

const output = env.GITHUB_OUTPUT
if (!output) throw new Error('Missing GITHUB_OUTPUT.')

const shouldRun = await shouldTestRelease({
  eventName: env.GITHUB_EVENT_NAME,
  base: env.RELEASE_TEST_BASE,
  head: env.GITHUB_SHA
})
await appendFile(output, `should_run=${shouldRun}\n`)
