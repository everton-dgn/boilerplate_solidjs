import path from 'node:path'

import { definePlugin, defineRule, type ESTree } from 'vite-plus/lint/plugins'

type Layer =
  | 'base'
  | 'primitives'
  | 'atoms'
  | 'molecules'
  | 'organisms'
  | 'components'
  | 'routes'
  | 'entry'
  | 'test'
  | 'tooling'
  | 'source'

type ImportNode =
  | ESTree.ImportDeclaration
  | ESTree.ExportNamedDeclaration
  | ESTree.ExportAllDeclaration
  | ESTree.ImportExpression
  | ESTree.TSImportType

type ImportLocation = { specifier: string; filename: string; root: string }

const UI: Layer[] = ['atoms', 'molecules', 'organisms', 'components']
const FORBIDDEN: Partial<Record<Layer, Layer[]>> = {
  base: ['primitives', ...UI, 'routes', 'entry'],
  primitives: [...UI, 'routes', 'entry'],
  atoms: ['molecules', 'organisms'],
  molecules: ['organisms']
}

function layer(file: string): Layer | undefined {
  if (file === 'tooling' || file.startsWith('tooling/')) return 'tooling'
  if (!file.startsWith('src/')) return undefined
  if (
    /^src\/tests(?:\/|$)|\/__tests__(?:\/|$)|\.(?:test|spec)(?:\.[cm]?[jt]sx?)?$/u.test(
      file
    )
  ) {
    return 'test'
  }
  if (
    /^src\/(?:@types|constants|helpers|data|infra|theme)(?:\/|$)/u.test(file)
  ) {
    return 'base'
  }
  if (/^src\/primitives(?:\/|$)/u.test(file)) return 'primitives'
  // Um barrel nomeado (src/components/atoms.ts) pertence ao mesmo nível que a
  // pasta homônima.
  const level =
    /^src\/components\/(?<level>atoms|molecules|organisms)(?:\/|\.[cm]?[jt]sx?$|$)/u.exec(
      file
    )?.groups?.level
  if (level === 'atoms' || level === 'molecules' || level === 'organisms') {
    return level
  }
  if (/^src\/components(?:\/|$)/u.test(file)) return 'components'
  if (/^src\/routes(?:\/|$)/u.test(file)) return 'routes'
  if (
    /^src\/(?:App|Document|router|middleware)(?:\.[cm]?[jt]sx?)?$/u.test(
      file
    ) ||
    file.startsWith('src/middleware/')
  ) {
    return 'entry'
  }
  return 'source'
}

function resolveImport({ specifier, filename, root }: ImportLocation): string {
  const [clean = ''] = specifier.replaceAll('\\', '/').split(/[?#]/u)
  let absolute
  if (clean.startsWith('@/')) {
    absolute = path.resolve(root, 'src', clean.slice('@/'.length))
  } else if (clean.startsWith('/src/')) {
    absolute = path.resolve(root, clean.slice(1))
  } else if (clean.startsWith('.')) {
    absolute = path.resolve(path.dirname(filename), clean)
  } else return ''
  return path.relative(root, absolute).split(path.sep).join('/')
}

const layerImports = defineRule({
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      forbidden:
        'A camada {{from}} não pode depender de {{to}} ({{target}}). Consulte as regras de camadas no README.'
    }
  },
  create(context) {
    const importer = path
      .relative(context.cwd, context.filename)
      .split(path.sep)
      .join('/')
    const from = layer(importer)
    if (!from || from === 'test' || from === 'tooling') return {}
    const forbidden = FORBIDDEN[from] ?? []

    function check(node: ImportNode): void {
      const { source } = node
      let specifier
      if (source?.type === 'Literal') {
        specifier = source.value
      } else if (
        source?.type === 'TemplateLiteral' &&
        source.expressions.length === 0
      ) {
        specifier = source.quasis[0]?.value.cooked
      }
      if (typeof specifier !== 'string') return
      const target = resolveImport({
        specifier,
        filename: context.filename,
        root: context.cwd
      })
      const to = layer(target)
      if (to && (to === 'test' || to === 'tooling' || forbidden.includes(to))) {
        context.report({
          node,
          messageId: 'forbidden',
          data: { from, to, target }
        })
      }
    }
    return {
      ImportDeclaration: check,
      ExportNamedDeclaration: check,
      ExportAllDeclaration: check,
      ImportExpression: check,
      TSImportType: check
    }
  }
})

const architecturePolicy = definePlugin({
  meta: { name: 'architecture' },
  rules: { 'layer-imports': layerImports }
})

export default architecturePolicy
