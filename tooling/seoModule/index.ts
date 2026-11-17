import path from 'node:path'

import { defineRule, type ESTree } from 'vite-plus/lint/plugins'

import {
  readStaticSpecifier,
  resolveProjectPath
} from '../lint/import-specifier.ts'

const SEO_MODULE = /^src\/routes\/(?:.+\/)?seo\.ts$/u
const LOCAL_SPECIFIER = /^\.{1,2}(?:\/|$)/u
const SEO_EXPORT = 'seo'
const ROUTES_DIR = 'src/routes/'

type ValueImport = ESTree.ImportDeclaration | ESTree.ImportExpression

function isImportMetaGlob({
  computed,
  object,
  property
}: ESTree.MemberExpression): boolean {
  return (
    !computed &&
    object.type === 'MetaProperty' &&
    object.meta.name === 'import' &&
    object.property.name === 'meta' &&
    property.type === 'Identifier' &&
    property.name === 'glob'
  )
}

// The route manifest imports the `route` of each page in the initial bundle, and
// everything that `seo.ts` imports or exports goes along. That is why it only
// exports `seo` and does not import local modules as values: the page body, which
// carries the text in the three locales, stays in `index.tsx`.
export const seoModule = defineRule({
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      onlySeo:
        'seo.ts only exports the seo object. The page body stays in index.tsx, because seo.ts enters the initial bundle through the route (AGENTS.md, Page modules).',
      localImport:
        'seo.ts does not import local modules as values: what it imports enters the initial bundle along with the route. Keep the page body in index.tsx (AGENTS.md, Page modules).',
      computedImport:
        'seo.ts does not use import() with a computed path: the rule cannot check whether the target is local. Keep the page body in index.tsx (AGENTS.md, Page modules).',
      globImport:
        'seo.ts does not use import.meta.glob: Vite turns it into imports of the modules that the pattern matches. Keep the page body in index.tsx (AGENTS.md, Page modules).'
    }
  },
  create(context) {
    const relative = path
      .relative(context.cwd, context.filename)
      .split(path.sep)
      .join('/')
    if (!SEO_MODULE.test(relative)) return {}

    // An alias to the route tree pulls the page module the same way as the
    // relative path.
    const reportLocalImport = (node: ValueImport) => {
      const specifier = readStaticSpecifier(node)
      if (specifier === undefined) {
        context.report({ node, messageId: 'computedImport' })
        return
      }
      const target = resolveProjectPath({
        specifier,
        filename: context.filename,
        root: context.cwd
      })
      if (LOCAL_SPECIFIER.test(specifier) || target.startsWith(ROUTES_DIR)) {
        context.report({ node, messageId: 'localImport' })
      }
    }

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
        if (node.importKind !== 'type') reportLocalImport(node)
      },
      ImportExpression(node) {
        reportLocalImport(node)
      },
      MemberExpression(node) {
        if (isImportMetaGlob(node)) {
          context.report({ node, messageId: 'globImport' })
        }
      }
    }
  }
})
