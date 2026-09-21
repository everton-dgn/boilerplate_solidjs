import { buildRobotsText } from '../index.ts'

const SITEMAP = 'https://example.com/sitemap.xml'

describe('geração do robots.txt', () => {
  it('publica user-agents, regras e o sitemap com uma linha vazia entre grupos', () => {
    const text = buildRobotsText({
      groups: [
        { userAgents: ['*'], allow: ['/'], disallow: ['/_server'] },
        { userAgents: ['GPTBot', 'CCBot'], disallow: ['/'] }
      ],
      sitemaps: [SITEMAP]
    })

    expect(text).toBe(
      [
        'User-agent: *',
        'Allow: /',
        'Disallow: /_server',
        '',
        'User-agent: GPTBot',
        'User-agent: CCBot',
        'Disallow: /',
        '',
        `Sitemap: ${SITEMAP}`,
        ''
      ].join('\n')
    )
  })

  it('lista um Sitemap por URL informada', () => {
    const text = buildRobotsText({
      groups: [{ userAgents: ['*'], allow: ['/'] }],
      sitemaps: [SITEMAP, 'https://example.com/sitemap-noticias.xml']
    })

    expect(text).toBe(
      [
        'User-agent: *',
        'Allow: /',
        '',
        `Sitemap: ${SITEMAP}`,
        'Sitemap: https://example.com/sitemap-noticias.xml',
        ''
      ].join('\n')
    )
  })

  it('omite a seção de sitemaps quando não há URL', () => {
    const text = buildRobotsText({
      groups: [{ userAgents: ['*'], disallow: ['/'] }],
      sitemaps: []
    })

    expect(text).toBe('User-agent: *\nDisallow: /\n')
  })

  it('publica só os user-agents de um grupo sem regras', () => {
    const text = buildRobotsText({
      groups: [{ userAgents: ['Googlebot'] }],
      sitemaps: []
    })

    expect(text).toBe('User-agent: Googlebot\n')
  })
})
