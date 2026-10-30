import { definePlugin, defineRule } from 'vite-plus/lint/plugins'

import { readStaticSpecifier } from '../lint/import-specifier.ts'
import { RENDER_INTEGRITY_MODULE } from './constants.ts'

type StaticImportRule = {
  matches: (specifier: string) => boolean
  message: string
}

const RENDER_INTEGRITY = new RegExp(RENDER_INTEGRITY_MODULE, 'u')

// As restrições por nome não alcançam import(): o módulo inteiro chegaria por
// ele sem passar pela lista de nomes permitidos.
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
        'Use import estático de @solidjs/web e seus subcaminhos para preservar as restrições de APIs privilegiadas.'
    }),
    'static-render-integrity-imports': staticImportRule({
      matches: specifier => RENDER_INTEGRITY.test(specifier),
      message:
        'Use import estático de renderIntegrity para preservar a restrição de observeRenderFailures.'
    })
  }
})

export default backendPlugin
