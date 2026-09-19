import { definePlugin, defineRule } from 'vite-plus/lint/plugins'

const backendPlugin = definePlugin({
  meta: { name: 'backend' },
  rules: {
    'static-solid-imports': defineRule({
      meta: {
        type: 'problem',
        schema: [],
        messages: {
          staticImport:
            'Use import estático de @solidjs/web e seus subcaminhos para preservar as restrições de APIs privilegiadas.'
        }
      },
      create(context) {
        return {
          ImportExpression(node) {
            const { source } = node
            let specifier
            if (source.type === 'Literal') {
              specifier = source.value
            } else if (
              source.type === 'TemplateLiteral' &&
              source.expressions.length === 0
            ) {
              specifier = source.quasis[0]?.value.cooked
            }
            if (
              typeof specifier === 'string' &&
              (specifier === '@solidjs/web' ||
                specifier.startsWith('@solidjs/web/'))
            ) {
              context.report({ node, messageId: 'staticImport' })
            }
          }
        }
      }
    })
  }
})

export default backendPlugin
