import { access, mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { MarkdownArtifact } from '../types.ts'

type PublishOptions = { root: string; artifacts: MarkdownArtifact[] }

async function assertAvailable(file: string): Promise<void> {
  try {
    await access(file)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return
    }
    throw error
  }
  throw new Error(`Markdown output conflicts with a public file: ${file}`)
}

export async function publishArtifacts({
  root,
  artifacts
}: PublishOptions): Promise<void> {
  const output = path.join(root, '.markdown')
  await mkdir(output, { recursive: true })
  const staging = await mkdtemp(path.join(output, 'staging-'))
  try {
    for (const artifact of artifacts) {
      const relative = decodeURIComponent(artifact.href.slice(1))
      await assertAvailable(path.join(root, 'public', relative))
      const file = path.join(staging, relative)
      if (!file.startsWith(`${staging}${path.sep}`)) {
        throw new Error('Markdown output escaped the build directory')
      }
      await mkdir(path.dirname(file), { recursive: true })
      await writeFile(file, artifact.body, 'utf8')
    }
    await rm(path.join(output, 'public'), { recursive: true, force: true })
    await rename(staging, path.join(output, 'public'))
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}
