import path from 'node:path'

import type { ESTree } from 'vite-plus/lint/plugins'

type ImportNode =
  | ESTree.ImportDeclaration
  | ESTree.ExportNamedDeclaration
  | ESTree.ExportAllDeclaration
  | ESTree.ImportExpression
  | ESTree.TSImportType

type ImportLocation = { specifier: string; filename: string; root: string }

function resolveAbsolute({
  specifier,
  filename,
  root
}: ImportLocation): string | undefined {
  if (specifier.startsWith('@paraglide/')) {
    return path.resolve(
      root,
      'paraglide',
      specifier.slice('@paraglide/'.length)
    )
  }
  if (specifier.startsWith('@/')) {
    return path.resolve(root, 'src', specifier.slice('@/'.length))
  }
  if (specifier.startsWith('/src/')) {
    return path.resolve(root, specifier.slice(1))
  }
  if (specifier.startsWith('.')) {
    return path.resolve(path.dirname(filename), specifier)
  }
  return undefined
}

export function readStaticSpecifier({
  source
}: ImportNode): string | undefined {
  if (source?.type === 'Literal') {
    return typeof source.value === 'string' ? source.value : undefined
  }
  if (source?.type !== 'TemplateLiteral' || source.expressions.length > 0) {
    return undefined
  }
  const cooked = source.quasis[0]?.value.cooked
  return typeof cooked === 'string' ? cooked : undefined
}

export function resolveProjectPath({
  specifier,
  filename,
  root
}: ImportLocation): string {
  const [clean = ''] = specifier.replaceAll('\\', '/').split(/[?#]/u)
  const absolute = resolveAbsolute({ specifier: clean, filename, root })
  if (absolute === undefined) return ''
  return path.relative(root, absolute).split(path.sep).join('/')
}
