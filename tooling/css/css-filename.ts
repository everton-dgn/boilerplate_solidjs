import path from 'node:path'

import { defineRule, type ESTree } from 'vite-plus/lint/plugins'

import {
  readStaticSpecifier,
  resolveProjectPath
} from '../lint/import-specifier.ts'

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
      const specifier = readStaticSpecifier(node)
      if (specifier === undefined) return
      const relative = resolveProjectPath({
        specifier,
        filename: context.filename,
        root: context.cwd
      })
      if (!relative.startsWith('src/') || !relative.endsWith('.css')) return
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
