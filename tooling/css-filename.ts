import path from 'node:path'

import { defineRule, type ESTree } from 'vite-plus/lint/plugins'

type CssImportNode =
  | ESTree.ImportDeclaration
  | ESTree.ExportNamedDeclaration
  | ESTree.ExportAllDeclaration
  | ESTree.ImportExpression

export function cssFilenameError(file: string): string | undefined {
  const normalized = file.split('\\').join('/')
  const basename = path.posix.basename(normalized)
  if (normalized.startsWith('src/theme/')) {
    return /^[a-z][a-z0-9]*(?:[A-Z][a-z0-9]*)*$/u.test(
      basename.slice(0, -'.css'.length)
    )
      ? undefined
      : 'Use nomeCamelCase.css dentro de src/theme/.'
  }
  return basename === 'styles.module.css'
    ? undefined
    : 'Use styles.module.css fora de src/theme/, inclusive nas rotas.'
}

export const cssFilename = defineRule({
  meta: { type: 'problem', schema: [] },
  create(context) {
    function check(node: CssImportNode): void {
      const { source } = node
      if (source?.type !== 'Literal' || typeof source.value !== 'string') return
      const [specifier = ''] = source.value.split(/[?#]/u)
      if (!specifier.endsWith('.css')) return
      const root = context.cwd
      let absolute
      if (specifier.startsWith('@/')) {
        absolute = path.resolve(root, 'src', specifier.slice('@/'.length))
      } else if (specifier.startsWith('/src/')) {
        absolute = path.resolve(root, specifier.slice(1))
      } else if (specifier.startsWith('.')) {
        absolute = path.resolve(path.dirname(context.filename), specifier)
      } else return
      const relative = path.relative(root, absolute).split(path.sep).join('/')
      if (!relative.startsWith('src/')) return
      const message = cssFilenameError(relative)
      if (message) context.report({ node, message })
    }
    return {
      ImportDeclaration: check,
      ExportNamedDeclaration: check,
      ExportAllDeclaration: check,
      ImportExpression: check
    }
  }
})
