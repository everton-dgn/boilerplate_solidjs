import { appendFile } from 'node:fs/promises'
import { arch, env, stdout } from 'node:process'

import { createPorts } from './createPorts/index.ts'
import { decideReuse } from './decideReuse/index.ts'

const DEADLINE_MS = 120_000
const MAX_REASON_LENGTH = 300

const output = env.GITHUB_OUTPUT
if (!output) throw new Error('Missing GITHUB_OUTPUT.')

const repository = env.GITHUB_REPOSITORY ?? ''
// O prazo encerra os subprocessos da prova ainda em andamento, e a falha
// resultante vira CI completo.
const signal = AbortSignal.timeout(DEADLINE_MS)
const decision = await decideReuse({
  repository,
  sha: env.GITHUB_SHA ?? '',
  runner: {
    os: env.RUNNER_OS ?? '',
    arch: env.RUNNER_ARCH ?? '',
    nodeArch: arch
  },
  ports: createPorts({ repository, signal })
})
const message =
  signal.aborted && !decision.shouldReuse
    ? 'A prova excedeu o tempo limite.'
    : decision.reason
const reason = message.replaceAll(/\s+/gu, ' ').slice(0, MAX_REASON_LENGTH)
await appendFile(
  output,
  `reuse=${decision.shouldReuse}\nrun_quality=${decision.shouldRunQuality}\n`
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
