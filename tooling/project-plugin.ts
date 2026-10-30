import { definePlugin, defineRule } from 'vite-plus/lint/plugins'

import { cssFilename } from './css/css-filename.ts'
import { noExportList } from './noExportList/index.ts'
import { testFilename } from './test-filename.ts'

const cssModulesImport = defineRule({
  meta: {
    type: 'suggestion',
    schema: [],
    messages: {
      useS: 'Importe CSS Modules como S: import S from "./styles.module.css".'
    }
  },
  create(context) {
    return {
      ImportDeclaration(node) {
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
})

const plugin = definePlugin({
  meta: { name: 'project' },
  rules: {
    'css-modules-import': cssModulesImport,
    'css-filename': cssFilename,
    'test-filename': testFilename,
    'no-export-list': noExportList
  }
})

export default plugin
