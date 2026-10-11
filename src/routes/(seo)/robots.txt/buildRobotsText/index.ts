import type { RobotsGroup } from '../types.ts'

type BuildRobotsTextOptions = {
  groups: readonly RobotsGroup[]
  sitemaps: readonly string[]
}

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
