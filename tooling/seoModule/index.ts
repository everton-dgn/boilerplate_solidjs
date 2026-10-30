import path from 'node:path'

import { defineRule } from 'vite-plus/lint/plugins'

const SEO_MODULE = /^src\/routes\/(?:.+\/)?seo\.ts$/u
const LOCAL_SPECIFIER = /^\.{1,2}(?:\/|$)/u
const SEO_EXPORT = 'seo'

// O manifesto de rotas importa o `route` de cada página no bundle inicial, e
// tudo o que o `seo.ts` importa ou exporta vai junto. Por isso ele só exporta
// `seo` e não importa módulos locais como valor: o corpo da página, que traz os
// textos nos três idiomas, fica em `index.tsx`.
export const seoModule = defineRule({
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      onlySeo:
        'O seo.ts exporta só o objeto seo. O corpo da página fica no index.tsx, porque o seo.ts entra no bundle inicial pelo route (AGENTS.md, Módulos de página).',
      localImport:
        'O seo.ts não importa módulos locais como valor: o que ele importa entra no bundle inicial junto com o route. Mantenha o corpo da página no index.tsx (AGENTS.md, Módulos de página).'
    }
  },
  create(context) {
    const relative = path
      .relative(context.cwd, context.filename)
      .split(path.sep)
      .join('/')
    if (!SEO_MODULE.test(relative)) return {}

    return {
      ExportNamedDeclaration(node) {
        const { declaration } = node
        if (declaration?.type === 'VariableDeclaration') {
          const isSeoOnly = declaration.declarations.every(
            ({ id }) => id.type === 'Identifier' && id.name === SEO_EXPORT
          )
          if (isSeoOnly) return
        }
        context.report({ node, messageId: 'onlySeo' })
      },
      ExportDefaultDeclaration(node) {
        context.report({ node, messageId: 'onlySeo' })
      },
      ExportAllDeclaration(node) {
        context.report({ node, messageId: 'onlySeo' })
      },
      ImportDeclaration(node) {
        if (node.importKind === 'type') return
        if (LOCAL_SPECIFIER.test(node.source.value)) {
          context.report({ node, messageId: 'localImport' })
        }
      }
    }
  }
})
