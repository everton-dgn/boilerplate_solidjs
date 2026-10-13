import path from 'node:path'

import { analyzeModule, getExportName } from 'filesystem-routing'

type ResolveImportOptions = { source: string; importer: string }
type ResolveMarkdownSourceOptions = {
  file: string
  resolve: (options: ResolveImportOptions) => Promise<string | undefined>
}

export async function resolveMarkdownSource({
  file,
  resolve
}: ResolveMarkdownSourceOptions): Promise<string> {
  let name = 'route'
  let currentFile = file
  const visited = new Set<string>()
  for (;;) {
    const exportName = name
    const key = `${currentFile}:${exportName}`
    if (visited.has(key)) {
      throw new Error(`Circular Markdown route re-export: ${key}`)
    }
    visited.add(key)
    const entry = analyzeModule(currentFile).find(
      candidate => getExportName(candidate) === exportName
    )
    if (!entry) {
      throw new Error(`Missing Markdown route export: ${key}`)
    }
    if (!entry.moduleRequest) {
      return path.join(path.dirname(currentFile), 'markdown.ts')
    }
    const { name: importedName } = entry.importName
    if (!importedName) {
      throw new Error(`Use a named Markdown route re-export: ${key}`)
    }
    const target = await resolve({
      source: entry.moduleRequest.value,
      importer: currentFile
    })
    if (!target || !path.isAbsolute(target)) {
      throw new Error(`Cannot resolve Markdown route re-export: ${key}`)
    }
    name = importedName
    currentFile = target
  }
}
