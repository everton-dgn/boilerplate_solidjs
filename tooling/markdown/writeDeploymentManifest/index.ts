import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import * as v from 'valibot'

import { MARKDOWN_HEADERS } from '../constants.ts'
import type { MarkdownArtifact } from '../types.ts'

type WriteOptions = { output: string; artifacts: MarkdownArtifact[] }

const routeSchema = v.looseObject({
  src: v.optional(v.string()),
  continue: v.optional(v.boolean())
})
const configSchema = v.looseObject({ routes: v.array(routeSchema) })
const JSON_INDENT = 2

export async function writeDeploymentManifest({
  output,
  artifacts
}: WriteOptions): Promise<void> {
  const file = path.join(output, 'config.json')
  const config = v.parse(configSchema, JSON.parse(await readFile(file, 'utf8')))
  const headers = artifacts.map(artifact => ({
    src: `^${artifact.href.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`)}$`,
    headers: { ...MARKDOWN_HEADERS, 'content-language': artifact.locale },
    continue: true
  }))
  config.routes = [...headers, ...config.routes]
  await writeFile(
    file,
    `${JSON.stringify(config, null, JSON_INDENT)}\n`,
    'utf8'
  )
  await writeFile(
    path.join(output, 'markdown.json'),
    JSON.stringify(artifacts.map(({ href, locale }) => ({ href, locale }))),
    'utf8'
  )
}
