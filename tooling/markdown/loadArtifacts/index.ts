import { readFile } from 'node:fs/promises'
import path from 'node:path'

import {
  analyzeModule,
  getExportName,
  HTTP_METHODS,
  PageFileSystemRouter,
  stripRouteGroups
} from 'filesystem-routing'
import { toPickId, treeShake } from 'filesystem-routing/vite'
import { runnerImport, type Plugin } from 'vite-plus'

import type { ArtifactBuild, LoadArtifactsOptions } from '../types.ts'

const ENTRY = 'virtual:markdown-build'

export async function loadArtifacts({
  root,
  directory,
  mode,
  environment
}: LoadArtifactsOptions): Promise<ArtifactBuild> {
  const scanner = new PageFileSystemRouter({
    dir: path.resolve(root, directory),
    extensions: ['js', 'jsx', 'ts', 'tsx'],
    components: false,
    httpMethods: true
  })
  const discovered = await scanner.getRoutes()
  const routes = discovered.filter(route => route.page)
  const reservedPaths = discovered
    .filter(route => HTTP_METHODS.some(method => `$${method}` in route))
    .map(route => stripRouteGroups(route.path).replace(/\/$/u, '') || '/')
  const imports: string[] = []
  const definitions = routes.map((route, index) => {
    if (route.$$route) {
      imports.push(
        `import { route as route${index} } from ${JSON.stringify(toPickId(route.$$route.src, ['route']))};`
      )
    }
    return `{ path: ${JSON.stringify(route.path)}, page: true, info: ${route.$$route ? `route${index}.info` : 'undefined'}, matchFilters: ${route.$$route ? `route${index}.matchFilters` : 'undefined'} }`
  })
  const entryPlugin: Plugin = {
    name: 'project:markdown-build-entry',
    resolveId(id) {
      return id === ENTRY ? `\0${ENTRY}` : undefined
    },
    async load(id) {
      if (id.includes('?pick=')) {
        const [file, query] = id.split('?')
        if (!file) return null
        const picks = new URLSearchParams(query).getAll('pick')
        const exports = analyzeModule(file).filter(
          entry => entry.moduleRequest && picks.includes(getExportName(entry))
        )
        let code = await readFile(file, 'utf8')
        for (const entry of exports.toSorted((a, b) => b.start - a.start)) {
          const source = entry.moduleRequest
          if (!source || !entry.importName.name) continue
          code =
            code.slice(0, source.start) +
            JSON.stringify(toPickId(source.value, [entry.importName.name])) +
            code.slice(source.end)
        }
        return code
      }
      if (id !== `\0${ENTRY}`) return null
      return `
        ${imports.join('\n')}
        import { buildRouteTree } from 'filesystem-routing/tree';
        import { locales, overwriteGetLocale } from '@paraglide/runtime.js';
        import { localizeHref } from '@/i18n/urls/index.ts';
        import { generateArtifacts } from ${JSON.stringify(path.join(root, 'tooling/markdown/generateArtifacts/index.ts'))};
        const tree = buildRouteTree([${definitions.join(',')}]);
        let sequence = 0;
        function identify(routes) {
          for (const route of routes) { route.id = String(sequence++); identify(route.children || []); }
          return routes;
        }
        export const artifacts = await generateArtifacts({
          routes: identify(tree), locales, reservedPaths: ${JSON.stringify(reservedPaths)},
          setLocale: locale => overwriteGetLocale(() => locale),
          localize: path => localizeHref({ href: path }),
          load: async source => {
            if (typeof source !== 'string' || !/^@\\/[^?#]+\\/markdown\\.ts$/.test(source) || source.includes(String.fromCharCode(92)) || source.split('/').some(part => part === '..' || part === '.')) {
              throw new Error('Markdown sources must be explicit @/ paths to a markdown.ts module');
            }
            const file = ${JSON.stringify(path.join(root, 'src/'))} + source.slice(2);
            return import(file);
          }
        });
      `
    }
  }
  const { module, dependencies } = await runnerImport<
    Omit<ArtifactBuild, 'dependencies'>
  >(ENTRY, {
    root,
    configFile: false,
    envDir: false,
    mode,
    define: environment
      ? { 'import.meta.env': JSON.stringify({ ...environment, SSR: true }) }
      : undefined,
    logLevel: 'error',
    resolve: {
      alias: {
        '@': path.join(root, 'src'),
        '@paraglide': path.join(root, 'paraglide')
      }
    },
    plugins: [treeShake(), entryPlugin]
  })
  return {
    ...module,
    dependencies: [
      ...dependencies,
      ...routes.flatMap(route => (route.$$route ? [route.$$route.src] : []))
    ]
  }
}
