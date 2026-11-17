import { buildRobotsText } from '../index.ts'

const SITEMAP = 'https://example.com/sitemap.xml'

describe('robots.txt generation', () => {
  it('publishes user-agents, rules and the sitemap with a blank line between groups', () => {
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

  it('lists one Sitemap per given URL', () => {
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

  it('leaves out the sitemaps section when there is no URL', () => {
    const text = buildRobotsText({
      groups: [{ userAgents: ['*'], disallow: ['/'] }],
      sitemaps: []
    })

    expect(text).toBe('User-agent: *\nDisallow: /\n')
  })

  it('publishes only the user-agents of a group without rules', () => {
    const text = buildRobotsText({
      groups: [{ userAgents: ['Googlebot'] }],
      sitemaps: []
    })

    expect(text).toBe('User-agent: Googlebot\n')
  })
})
