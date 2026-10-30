import path from 'node:path'

import { definePlugin, defineRule, type ESTree } from 'vite-plus/lint/plugins'

import {
  readStaticSpecifier,
  resolveProjectPath
} from '../lint/import-specifier.ts'

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

const UI: Layer[] = ['atoms', 'molecules', 'organisms', 'components']
const FORBIDDEN: Partial<Record<Layer, Layer[]>> = {
  base: ['primitives', ...UI, 'routes', 'entry'],
  primitives: [...UI, 'routes', 'entry'],
  atoms: ['molecules', 'organisms'],
  molecules: ['organisms']
}

function layer(file: string): Layer | undefined {
  if (file === 'tooling' || file.startsWith('tooling/')) return 'tooling'
  if (file.startsWith('paraglide/')) return 'base'
  if (!file.startsWith('src/')) return undefined
  if (
    /^src\/tests(?:\/|$)|\/__tests__(?:\/|$)|\.test(?:\.[cm]?[jt]sx?)?$/u.test(
      file
    )
  ) {
    return 'test'
  }
  if (
    /^src\/(?:@types|constants|helpers|data|infra|theme|i18n)(?:\/|$)/u.test(
      file
    )
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
  // As pastas homônimas guardam os módulos colocalizados de cada entrada.
  if (
    /^src\/(?:App|Document|entry-server|entry-client|router|middleware)(?:\.[cm]?[jt]sx?$|\/|$)/u.test(
      file
    )
  ) {
    return 'entry'
  }
  return 'source'
}

const layerImports = defineRule({
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      forbidden:
        'A camada {{from}} não pode depender de {{to}} ({{target}}). Consulte as regras de camadas em docs/architecture.md.'
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
      const specifier = readStaticSpecifier(node)
      if (specifier === undefined) return
      const target = resolveProjectPath({
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
