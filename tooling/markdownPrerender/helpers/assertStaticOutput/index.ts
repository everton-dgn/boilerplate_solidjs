import nodePath from 'node:path'

import type { ArtifactDigest } from '../../types.ts'
import { digestFile } from '../artifactDigest/index.ts'
import { findMarkdownFiles } from '../findMarkdownFiles/index.ts'

type StaticOutputOptions = {
  publicDir: string
  expected: ReadonlyMap<string, string>
  approved: ReadonlyMap<string, ArtifactDigest>
}

// Confere os bytes publicados de cada `.md` esperado contra os aprovados no
// prerender, inclusive os que ficam fora do llms-full.txt.
async function findChangedFiles({
  publicDir,
  expected,
  approved
}: StaticOutputOptions): Promise<string[]> {
  const problems: string[] = []
  for (const path of expected.keys()) {
    const digest = approved.get(path)
    if (!digest) {
      problems.push(`${path} (not validated by the prerender)`)
      continue
    }
    const actual = await digestFile(nodePath.join(publicDir, path))
    if (actual.size !== digest.size || actual.hash !== digest.hash) {
      problems.push(`${path} (content differs from the approved artifact)`)
    }
  }
  return problems
}

// O diretório publicado é um oráculo distinto do registro do Nitro: pega
// cópias de `public/`, aliases `.md.html`, arquivos que não foram gravados e
// conteúdo trocado depois da validação.
export async function assertStaticOutput(
  options: StaticOutputOptions
): Promise<void> {
  const { publicDir, expected } = options
  const { files, htmlAliases, irregular } = await findMarkdownFiles(publicDir)
  const found = new Set(files)
  const problems = [
    ...htmlAliases.map(path => `${path} (HTML written for a .md URL)`),
    ...irregular.map(path => `${path} (not a regular file)`),
    ...files
      .filter(path => !expected.has(path))
      .map(path => `${path} (not in the static Markdown list)`),
    ...[...expected.keys()]
      .filter(path => !found.has(path))
      .map(path => `${path} (missing from the static output)`)
  ]
  if (problems.length === 0) problems.push(...(await findChangedFiles(options)))
  if (problems.length > 0) {
    throw new Error(`Invalid static Markdown output: ${problems.join(', ')}`)
  }
}
