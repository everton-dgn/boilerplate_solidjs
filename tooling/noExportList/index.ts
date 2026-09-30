import { defineRule } from 'vite-plus/lint/plugins'

// Exports ficam na própria declaração. Uma lista sem `from` separa o nome
// exportado da declaração; o reexport com `from` continua permitido porque
// não há declaração local para marcar.
export const noExportList = defineRule({
  meta: {
    type: 'suggestion',
    schema: [],
    messages: {
      inlineExport:
        'Declare o export junto da declaração (export function, export const, export type) em vez de usar export { ... }. Lista de exports só vale em reexport com from.'
    }
  },
  create(context) {
    return {
      ExportNamedDeclaration(node) {
        if (node.declaration || node.source) return
        context.report({ node, messageId: 'inlineExport' })
      }
    }
  }
})
