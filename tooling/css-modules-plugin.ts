import { cssFilename } from './css-filename.ts'
import { noExportList } from './noExportList/index.ts'
import { testFilename } from './test-filename.ts'

type ImportNode = {
  source: { value: string }
  specifiers: { type: string; local: { name: string } }[]
}
type ImportDiagnostic = {
  node: ImportNode
  messageId: string
}
type ImportContext = {
  report: (diagnostic: ImportDiagnostic) => void
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

const plugin = {
  meta: { name: 'project' },
  rules: {
    'css-modules-import': cssModulesImport,
    'css-filename': cssFilename,
    'test-filename': testFilename,
    'no-export-list': noExportList
  }
}

export default plugin
