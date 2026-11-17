import { defineRule } from 'vite-plus/lint/plugins'

// Exports stay at the declaration. A list without `from` separates the exported
// name from the declaration; the reexport with `from` is still allowed because
// there is no local declaration to mark.
export const noExportList = defineRule({
  meta: {
    type: 'suggestion',
    schema: [],
    messages: {
      inlineExport:
        'Export at the declaration (export function, export const, export type) instead of using export { ... }. An export list is only allowed in a reexport with from.'
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
