import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

import type { Ports } from '../types.ts'

type Limits = {
  signal: AbortSignal
  timeout: number
}
type PortsOptions = {
  repository: string
  signal: AbortSignal
}
type EvidenceOptions = {
  repository: string
  limits: Limits
}

const execute = promisify(execFile)
const COMMAND_TIMEOUT_MS = 20_000
const MAX_OUTPUT_BYTES = 8_388_608
const MAX_ARCHIVE_BYTES = 1_048_576
const MAX_EVIDENCE_BYTES = 65_536
const EVIDENCE_FILE = 'evidence.json'

function evidenceReader({ repository, limits }: EvidenceOptions) {
  return async function readEvidence(artifactId: number): Promise<unknown> {
    const directory = await mkdtemp(path.join(tmpdir(), 'ci-reuse-'))
    try {
      const archive = path.join(directory, 'evidence.zip')
      const { stdout } = await execute(
        'gh',
        ['api', `repos/${repository}/actions/artifacts/${artifactId}/zip`],
        { ...limits, encoding: 'buffer', maxBuffer: MAX_ARCHIVE_BYTES }
      )
      await writeFile(archive, stdout)
      const extracted = await execute('unzip', ['-p', archive, EVIDENCE_FILE], {
        ...limits,
        maxBuffer: MAX_EVIDENCE_BYTES
      })
      return JSON.parse(extracted.stdout)
    } catch {
      throw new Error('Failed to read the PR evidence.')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }
}

// The signal ends the subprocesses still running when the proof deadline runs
// out; the timeout of each command still limits isolated calls.
export function createPorts({ repository, signal }: PortsOptions): Ports {
  const limits = { signal, timeout: COMMAND_TIMEOUT_MS }
  return {
    async api<T>(apiPath: string): Promise<T> {
      try {
        const { stdout } = await execute('gh', ['api', apiPath], {
          ...limits,
          maxBuffer: MAX_OUTPUT_BYTES
        })
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- decideReuse compares each used field with expected values.
        return JSON.parse(stdout) as T
      } catch {
        // Do not forward the gh output: it can contain request data.
        throw new Error(`Failed to query ${apiPath.split('?')[0]}.`)
      }
    },
    async git(args: string[]): Promise<string> {
      const { stdout } = await execute('git', args, {
        ...limits,
        maxBuffer: MAX_OUTPUT_BYTES
      })
      return stdout.trimEnd()
    },
    async readBlob(spec: string): Promise<Uint8Array> {
      const { stdout } = await execute('git', ['cat-file', 'blob', spec], {
        ...limits,
        encoding: 'buffer',
        maxBuffer: MAX_OUTPUT_BYTES
      })
      return stdout
    },
    readEvidence: evidenceReader({ repository, limits })
  }
}
