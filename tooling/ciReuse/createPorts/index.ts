import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

import type { Ports } from '../types.ts'

const execute = promisify(execFile)
const COMMAND_TIMEOUT_MS = 20_000
const MAX_OUTPUT_BYTES = 8_388_608
const MAX_ARCHIVE_BYTES = 1_048_576
const MAX_EVIDENCE_BYTES = 65_536
const EVIDENCE_FILE = 'evidence.json'

async function api<T>(apiPath: string): Promise<T> {
  try {
    const { stdout } = await execute('gh', ['api', apiPath], {
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES
    })
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- decideReuse compara cada campo usado com valores esperados.
    return JSON.parse(stdout) as T
  } catch {
    // Não repasse a saída do gh: ela pode conter dados da requisição.
    throw new Error(`Falha ao consultar ${apiPath.split('?')[0]}.`)
  }
}

async function git(args: string[]): Promise<string> {
  const { stdout } = await execute('git', args, {
    timeout: COMMAND_TIMEOUT_MS,
    maxBuffer: MAX_OUTPUT_BYTES
  })
  return stdout.trimEnd()
}

async function readBlob(spec: string): Promise<Uint8Array> {
  const { stdout } = await execute('git', ['cat-file', 'blob', spec], {
    encoding: 'buffer',
    timeout: COMMAND_TIMEOUT_MS,
    maxBuffer: MAX_OUTPUT_BYTES
  })
  return stdout
}

function evidenceReader(repository: string) {
  return async function readEvidence(artifactId: number): Promise<unknown> {
    const directory = await mkdtemp(path.join(tmpdir(), 'ci-reuse-'))
    try {
      const archive = path.join(directory, 'evidence.zip')
      const { stdout } = await execute(
        'gh',
        ['api', `repos/${repository}/actions/artifacts/${artifactId}/zip`],
        {
          encoding: 'buffer',
          timeout: COMMAND_TIMEOUT_MS,
          maxBuffer: MAX_ARCHIVE_BYTES
        }
      )
      await writeFile(archive, stdout)
      const extracted = await execute('unzip', ['-p', archive, EVIDENCE_FILE], {
        timeout: COMMAND_TIMEOUT_MS,
        maxBuffer: MAX_EVIDENCE_BYTES
      })
      return JSON.parse(extracted.stdout)
    } catch {
      throw new Error('Falha ao ler a evidência do PR.')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }
}

export function createPorts(repository: string): Ports {
  return { api, git, readBlob, readEvidence: evidenceReader(repository) }
}
