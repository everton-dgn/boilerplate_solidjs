import { appendFile } from 'node:fs/promises'
import { arch, env, stdout } from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'

import { createPorts } from './createPorts/index.ts'
import { decideReuse } from './decideReuse/index.ts'

const DEADLINE_MS = 120_000
const MAX_REASON_LENGTH = 300

const output = env.GITHUB_OUTPUT
if (!output) throw new Error('Missing GITHUB_OUTPUT.')

const repository = env.GITHUB_REPOSITORY ?? ''
const sha = env.GITHUB_SHA ?? ''
const isMainPush =
  env.GITHUB_EVENT_NAME === 'push' && env.GITHUB_REF === 'refs/heads/main'
const deadline = new AbortController()

const timeout = {
  shouldReuse: false,
  shouldRunQuality: true,
  reason: 'A prova excedeu o tempo limite.',
  sourceRunUrl: undefined
}

function expire() {
  // O abort depois da decisão também resolve, sem rejeição pendente.
  return delay(DEADLINE_MS, undefined, { signal: deadline.signal }).then(
    () => timeout,
    () => timeout
  )
}

const decision = isMainPush
  ? await Promise.race([
      decideReuse({
        repository,
        sha,
        runner: {
          os: env.RUNNER_OS ?? '',
          arch: env.RUNNER_ARCH ?? '',
          nodeArch: arch
        },
        ports: createPorts(repository)
      }),
      expire()
    ])
  : {
      shouldReuse: false,
      shouldRunQuality: true,
      reason: 'A reutilização vale somente para push na main.',
      sourceRunUrl: undefined
    }
deadline.abort()

const reason = decision.reason
  .replaceAll(/\s+/gu, ' ')
  .slice(0, MAX_REASON_LENGTH)
await appendFile(
  output,
  `reuse=${decision.shouldReuse}\nrun_quality=${decision.shouldRunQuality}\nreason=${reason}\n`
)
const summary = [
  `Reutilização: ${decision.shouldReuse ? 'sim' : 'não, CI completo'}`,
  `Motivo: ${reason}`,
  ...(decision.sourceRunUrl ? [`Run de origem: ${decision.sourceRunUrl}`] : [])
].join('\n')
stdout.write(`${summary}\n`)
if (env.GITHUB_STEP_SUMMARY) {
  await appendFile(
    env.GITHUB_STEP_SUMMARY,
    `${summary.replaceAll('\n', '  \n')}\n`
  )
}
