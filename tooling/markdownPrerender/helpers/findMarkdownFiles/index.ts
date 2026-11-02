import { readdir } from 'node:fs/promises'
import nodePath from 'node:path'

type MarkdownFiles = {
  files: string[]
  htmlAliases: string[]
  irregular: string[]
}

const MARKDOWN_EXTENSION = '.md'
const HTML_ALIAS_EXTENSION = '.md.html'

// Inventário independente do registro do prerender: tudo o que a camada
// estática serviria como `.md`, inclusive cópias de `public/`. Caminhos saem
// decodificados, como o Nitro registra as rotas.
export async function findMarkdownFiles(
  publicDir: string
): Promise<MarkdownFiles> {
  const result: MarkdownFiles = { files: [], htmlAliases: [], irregular: [] }
  const entries = await readdir(publicDir, {
    recursive: true,
    withFileTypes: true
  })
  for (const entry of entries) {
    const isAlias = entry.name.endsWith(HTML_ALIAS_EXTENSION)
    if (!isAlias && !entry.name.endsWith(MARKDOWN_EXTENSION)) continue
    const relative = nodePath.relative(
      publicDir,
      nodePath.join(entry.parentPath, entry.name)
    )
    const path = `/${relative.split(nodePath.sep).join('/')}`
    if (isAlias) {
      result.htmlAliases.push(path)
      continue
    }
    const isRegular = entry.isFile() && !entry.isSymbolicLink()
    if (isRegular) result.files.push(path)
    else result.irregular.push(path)
  }
  return result
}
