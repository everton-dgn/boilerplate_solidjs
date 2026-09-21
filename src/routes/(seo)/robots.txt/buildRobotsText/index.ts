import type { RobotsGroup } from '../types.ts'

type BuildRobotsTextOptions = {
  groups: readonly RobotsGroup[]
  sitemaps: readonly string[]
}

// Cada grupo lista seus user-agents e depois as regras. `Allow` vem antes de
// `Disallow` só por leitura: o robô aplica a regra de caminho mais longo.
function renderGroup({
  userAgents,
  allow = [],
  disallow = []
}: RobotsGroup): string {
  return [
    ...userAgents.map(agent => `User-agent: ${agent}`),
    ...allow.map(path => `Allow: ${path}`),
    ...disallow.map(path => `Disallow: ${path}`)
  ].join('\n')
}

// Grupos separados por uma linha vazia; os sitemaps fecham o arquivo, fora de
// qualquer grupo, porque valem para todos os robôs.
export function buildRobotsText({
  groups,
  sitemaps
}: BuildRobotsTextOptions): string {
  const sitemapSection = sitemaps.map(url => `Sitemap: ${url}`).join('\n')
  const sections = [
    ...groups.map(group => renderGroup(group)),
    ...(sitemapSection ? [sitemapSection] : [])
  ]
  return `${sections.join('\n\n')}\n`
}
