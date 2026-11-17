import { SITE } from '@/constants/site/index.ts'

import { resolveRouteSeo } from '../index.ts'

describe('resolution of the SEO metadata along the route chain', () => {
  const defaults = {
    title: SITE.title,
    description: SITE.description,
    noindex: false,
    type: 'website',
    image: SITE.image
  }

  it('uses the SITE values when no route declares metadata', () => {
    expect(resolveRouteSeo([])).toStrictEqual(defaults)
    expect(resolveRouteSeo([undefined, {}])).toStrictEqual(defaults)
  })

  it('overrides field by field, from the most generic route to the most specific one', () => {
    const seo = resolveRouteSeo([
      { title: 'Documentation', description: 'Project guides.' },
      undefined,
      { title: 'Overview' },
      { noindex: true }
    ])

    expect(seo).toStrictEqual({
      ...defaults,
      title: 'Overview',
      description: 'Project guides.',
      noindex: true
    })
  })

  it('inherits the type from the layout and merges the image attribute by attribute', () => {
    const seo = resolveRouteSeo([
      { type: 'article', image: { path: '/images/blog.png' } },
      { image: { alt: 'Article cover' } }
    ])

    expect(seo.type).toBe('article')
    expect(seo.image).toStrictEqual({
      path: '/images/blog.png',
      width: SITE.image.width,
      height: SITE.image.height,
      alt: 'Article cover'
    })
  })

  it('merges the article dates and leaves out the key when nobody declares them', () => {
    const seo = resolveRouteSeo([
      { type: 'article', article: { datePublished: '2026-09-01' } },
      { article: { dateModified: '2026-09-21', datePublished: undefined } }
    ])

    expect(seo.article).toStrictEqual({
      datePublished: '2026-09-01',
      dateModified: '2026-09-21'
    })
    expect('article' in resolveRouteSeo([{ type: 'article' }])).toBe(false)
  })

  it('does not share the SITE image object with the result', () => {
    const seo = resolveRouteSeo([])
    seo.image.alt = 'changed'

    expect(SITE.image.alt).not.toBe('changed')
  })

  it('lets the child route turn indexing back on with noindex: false', () => {
    const seo = resolveRouteSeo([{ noindex: true }, { noindex: false }])

    expect(seo.noindex).toBe(false)
  })

  it('does not change the received objects', () => {
    const layout = { title: 'Layout' }
    const child = { description: 'Child.' }

    resolveRouteSeo([layout, child])

    expect(layout).toStrictEqual({ title: 'Layout' })
    expect(child).toStrictEqual({ description: 'Child.' })
  })
})
