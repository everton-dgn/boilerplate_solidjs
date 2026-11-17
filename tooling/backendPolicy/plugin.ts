import { definePlugin, defineRule } from 'vite-plus/lint/plugins'

import { readStaticSpecifier } from '../lint/import-specifier.ts'
import { RENDER_INTEGRITY_MODULE } from './constants.ts'

type StaticImportRule = {
  matches: (specifier: string) => boolean
  message: string
}

const RENDER_INTEGRITY = new RegExp(RENDER_INTEGRITY_MODULE, 'u')

// The restrictions by name do not reach import(): the whole module would come
// through it without going through the list of allowed names.
function staticImportRule({ matches, message }: StaticImportRule) {
  return defineRule({
    meta: {
      type: 'problem',
      schema: [],
      messages: { staticImport: message }
    },
    create(context) {
      return {
        ImportExpression(node) {
          const specifier = readStaticSpecifier(node)
          if (specifier !== undefined && matches(specifier)) {
            context.report({ node, messageId: 'staticImport' })
          }
        }
      }
    }
  })
}

const backendPlugin = definePlugin({
  meta: { name: 'backend' },
  rules: {
    'static-solid-imports': staticImportRule({
      matches: specifier =>
        specifier === '@solidjs/web' || specifier.startsWith('@solidjs/web/'),
      message:
        'Use a static import of @solidjs/web and its subpaths to keep the restrictions on privileged APIs.'
    }),
    'static-render-integrity-imports': staticImportRule({
      matches: specifier => RENDER_INTEGRITY.test(specifier),
      message:
        'Use a static import of renderIntegrity to keep the restriction on observeRenderFailures.'
    })
  }
})

export default backendPlugin
