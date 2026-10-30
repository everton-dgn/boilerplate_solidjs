import path from 'node:path'

import type { ESTree } from 'vite-plus/lint/plugins'

type ImportNode =
  | ESTree.ImportDeclaration
  | ESTree.ExportNamedDeclaration
  | ESTree.ExportAllDeclaration
  | ESTree.ImportExpression
  | ESTree.TSImportType

type ImportLocation = { specifier: string; filename: string; root: string }

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
  let absolute
  if (clean.startsWith('@paraglide/')) {
    absolute = path.resolve(
      root,
      'paraglide',
      clean.slice('@paraglide/'.length)
    )
  } else if (clean.startsWith('@/')) {
    absolute = path.resolve(root, 'src', clean.slice('@/'.length))
  } else if (clean.startsWith('/src/')) {
    absolute = path.resolve(root, clean.slice(1))
  } else if (clean.startsWith('.')) {
    absolute = path.resolve(path.dirname(filename), clean)
  } else return ''
  return path.relative(root, absolute).split(path.sep).join('/')
}
