import path from 'node:path'

type SourceNode = {
  source?: { value?: unknown }
}
type FilenameDiagnostic = {
  node: SourceNode
  message: string
}
type FilenameContext = {
  cwd: string
  filename: string
  report: (diagnostic: FilenameDiagnostic) => void
}
type FilenameListeners = Record<string, (node: SourceNode) => void>

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

export const cssFilename = {
  meta: { type: 'problem', schema: [] },
  create(context: FilenameContext): FilenameListeners {
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
