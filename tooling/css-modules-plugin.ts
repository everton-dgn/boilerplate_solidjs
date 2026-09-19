import path from 'node:path'

import { testFilename } from './test-filename.ts'

type ImportNode = {
  source: { value: string }
  specifiers: { type: string; local: { name: string } }[]
}
type SourceNode = {
  source?: { value?: unknown }
}
type FilenameDiagnostic = {
  node: SourceNode
  message: string
}
type ImportDiagnostic = {
  node: ImportNode
  messageId: string
}
type ImportContext = {
  report: (diagnostic: ImportDiagnostic) => void
}
type FilenameContext = {
  cwd: string
  filename: string
  report: (diagnostic: FilenameDiagnostic) => void
}

const cssModulesImport = {
  meta: {
    type: 'suggestion',
    schema: [],
    messages: {
      useS: 'Importe CSS Modules como S: import S from "./styles.module.css".'
    }
  },
  create(context: ImportContext) {
    return {
      ImportDeclaration(node: ImportNode) {
        if (!/\.module\.css(?:[?#].*)?$/u.test(node.source.value)) return

        const [specifier] = node.specifiers
        if (
          node.specifiers.length !== 1 ||
          specifier?.type !== 'ImportDefaultSpecifier' ||
          specifier.local.name !== 'S'
        ) {
          context.report({ node, messageId: 'useS' })
        }
      }
    }
  }
}

function cssFilenameError(file: string): string | undefined {
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

const cssFilename = {
  meta: { type: 'problem', schema: [] },
  create(context: FilenameContext) {
    function check(node: SourceNode): void {
      const value = node.source?.value
      if (typeof value !== 'string') return
      const [specifier = ''] = value.split(/[?#]/u)
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
}

const plugin = {
  meta: { name: 'project' },
  rules: {
    'css-modules-import': cssModulesImport,
    'css-filename': cssFilename,
    'test-filename': testFilename
  }
}

export default plugin

export { cssFilenameError }
