import { SITE } from '@/constants/site/index.ts'

import {
  markdownContent,
  event,
  html,
  mockPublishedRoute,
  resetPublicationController,
  cancelOpenResponses
} from './fixtures.ts'

describe('html-derived Markdown', () => {
  beforeEach(() => {
    resetPublicationController()
    mockPublishedRoute()
  })
  afterEach(cancelOpenResponses)

  it('converts settled HTML with a full document URL, semantic filters and contextual footer', async () => {
    const request = event({ path: '/en/docs/article.md?version=2' })
    const response = await markdownContent(request, () =>
      html(
        '<nav>Navigation</nav><main><h1>Title</h1><a href="./next">Next</a><p hidden>Hidden</p><p aria-hidden="true">ARIA</p><p data-md-exclude>Excluded</p><script>Secret script</script><button>Control</button><menu>Menu controls</menu><footer><a href="source">Citation</a></footer><aside>Contextual aside</aside></main>'
      )
    )
    const body = await response.text()
    expect({
      mode: request.renderMode,
      url: request.request.url,
      ...Object.fromEntries(response.headers),
      hasNoScripts: response.headers
        .get('content-security-policy')
        ?.includes("script-src 'none'")
    }).toMatchObject({
      mode: 'async',
      url: 'https://example.com/en/docs/article?version=2',
      'cache-control': 'private, no-store',
      vary: 'Cookie, Accept',
      hasNoScripts: true
    })
    expect(body).toMatch(/# Title[\s\S]*Contextual aside/u)
    expect(body).toContain(`[Next](${new URL('/en/docs/next', SITE.url).href})`)
    expect(body).toContain(
      `[Citation](${new URL('/en/docs/source', SITE.url).href})`
    )
    expect(body).not.toMatch(
      /Navigation|Hidden|ARIA|Excluded|Secret script|Control|Menu controls/u
    )
  })

  it('keeps ordinary HTML streaming and response identity', async () => {
    const request = event({ accept: 'text/html' })
    const original = await html()
    const response = await markdownContent(request, () =>
      Promise.resolve(original)
    )
    expect(response).toBe(original)
    expect(request.renderMode).toBeUndefined()
  })
})
