import { getLocale } from '@paraglide/runtime.js'
import { createRequestEvent, type RequestEvent } from '@solidjs/web'
import { provideRequestEvent } from '@solidjs/web/storage'

import { isPublicError } from '@/infra/server/publicErrors/index.ts'
import { Router } from '@/router.ts'
import { readLog } from '@/tests/helpers/readLog/index.ts'

import middleware, { createMiddleware } from '../index.ts'
import { localizeRequest } from '../localizeRequest/index.ts'
import { MAX_HTML_BYTES } from '../markdownContent/constants.ts'

const TEST_ORIGIN = 'http://localhost'
// vi.mock é içado para o topo do arquivo; o caminho sobe junto.
const { API_PATH, FORM_PATH } = vi.hoisted(() => ({
  API_PATH: '/rota-api',
  FORM_PATH: '/formulario'
}))
const HTTP_FOUND = 302
const HTTP_METHOD_NOT_ALLOWED = 405
const HTTP_INTERNAL_SERVER_ERROR = 500
const PUBLIC_MESSAGE = 'Não foi possível concluir a solicitação.'
const LOG_MESSAGE = '[middleware] Unexpected failure; private details omitted'
const ERROR_PAGE_LOG =
  '[error-page] Unexpected failure; private details omitted'

vi.mock(import('../localizeRequest/index.ts'), { spy: true })

// O projeto node usa um manifesto vazio. O handler de API real recebe aqui uma
// rota sintética que responde sem chamar next, como sitemap.xml e robots.txt,
// e uma página que também trata POST.
vi.mock(import('filesystem-routing/api'), async importOriginal => {
  const api = await importOriginal()
  const formRoute = {
    path: FORM_PATH,
    page: true,
    $component: {},
    $POST: { require: () => ({ POST: () => new Response('post') }) }
  }
  return {
    ...api,
    createAPIMatcher: () =>
      api.createAPIMatcher([
        {
          path: API_PATH,
          $GET: { require: () => ({ GET: () => new Response('api') }) }
        },
        formRoute
      ]),
    createAPIHandler: () =>
      api.createAPIHandler([
        {
          path: API_PATH,
          $GET: {
            require: () => ({
              GET: () =>
                new Response('api', {
                  headers: { 'content-type': 'text/plain; charset=utf-8' }
                })
            })
          }
        },
        formRoute
      ])
  }
})

function writeEvent(path: string): RequestEvent {
  return createRequestEvent(
    new Request(new URL(path, TEST_ORIGIN), {
      method: 'POST',
      headers: {
        accept: 'text/html',
        'content-type': 'application/x-www-form-urlencoded'
      },
      body: 'campo=1'
    })
  )
}

function pageEvent(path = '/pt'): RequestEvent {
  const request = new Request(new URL(path, TEST_ORIGIN), {
    headers: { accept: 'text/html,application/xhtml+xml' }
  })
  return createRequestEvent(request)
}

function mockProductionLog(): void {
  // A contenção só vale nos builds de produção; o Vitest roda com DEV.
  vi.stubEnv('DEV', false)
  vi.spyOn(console, 'error').mockImplementation(vi.fn())
}

describe('export padrão do middleware', () => {
  beforeEach(mockProductionLog)

  it('compõe a cadeia de produção dentro da contenção', async () => {
    const response = new Response('página')
    const next = vi.fn<() => Promise<Response>>().mockResolvedValue(response)
    const event = pageEvent('/pt/pagina')

    await expect(
      provideRequestEvent(event, () => middleware(event, next))
    ).resolves.toBe(response)
    expect(next).toHaveBeenCalledExactlyOnceWith()
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  })

  // O E2E injeta falhas pela fábrica; só este teste prova que o export padrão
  // mantém a contenção.
  it('troca uma falha da cadeia por 500 público', async () => {
    const event = pageEvent()
    const next = vi
      .fn<() => Promise<Response>>()
      .mockRejectedValue(new Error('PRIVATE'))

    const response = await provideRequestEvent(event, () =>
      middleware(event, next)
    )

    expect(response.status).toBe(HTTP_INTERNAL_SERVER_ERROR)
    await expect(response.text()).resolves.toBe(PUBLIC_MESSAGE)
    expect(Object.fromEntries(response.headers)).toMatchObject({
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin'
    })
    expect(readLog(console.error)).toStrictEqual({
      heads: [[LOG_MESSAGE, 'Error']],
      leaks: []
    })
  })
})

describe('contenção do adaptador Markdown', () => {
  beforeEach(mockProductionLog)

  it.each(['pt', 'en', 'es'])(
    'contém uma falha do matching Markdown antes do render no idioma %s',
    async locale => {
      vi.spyOn(Router, 'match').mockImplementation(() => {
        throw new Error('PRIVATE_MATCH', { cause: 'PRIVATE_CAUSE' })
      })
      const event = pageEvent(`/${locale}/about`)
      const next = vi.fn<() => Promise<Response>>().mockImplementation(() => {
        expect(isPublicError(event.locals.serverFailure)).toBe(true)
        return Promise.resolve(
          new Response(`${getLocale()}:${PUBLIC_MESSAGE}`, {
            headers: { 'content-type': 'text/html' }
          })
        )
      })

      const response = await provideRequestEvent(event, () =>
        middleware(event, next)
      )

      expect(next).toHaveBeenCalledExactlyOnceWith()
      expect(response.status).toBe(HTTP_INTERNAL_SERVER_ERROR)
      await expect(response.text()).resolves.toBe(`${locale}:${PUBLIC_MESSAGE}`)
      expect(Object.fromEntries(response.headers)).toMatchObject({
        'content-language': locale,
        'x-content-type-options': 'nosniff'
      })
      expect(readLog(console.error)).toStrictEqual({
        heads: [[LOG_MESSAGE, 'Error']],
        leaks: []
      })
    }
  )

  it('contém uma falha de localização do fallback anterior ao matching', async () => {
    vi.spyOn(Router, 'match').mockImplementation(() => {
      throw new Error('PRIVATE_MATCH')
    })
    vi.mocked(localizeRequest).mockRejectedValueOnce(
      new Error('PRIVATE_LOCALE')
    )
    const event = pageEvent('/pt/about')
    const next = vi.fn<() => Promise<Response>>()

    const response = await provideRequestEvent(event, () =>
      middleware(event, next)
    )

    expect(next).not.toHaveBeenCalled()
    expect(response.status).toBe(HTTP_INTERNAL_SERVER_ERROR)
    await expect(response.text()).resolves.toBe(PUBLIC_MESSAGE)
    expect(readLog(console.error)).toStrictEqual({
      heads: [
        [LOG_MESSAGE, 'Error'],
        [ERROR_PAGE_LOG, 'Error']
      ],
      leaks: []
    })
  })

  it('contém uma falha de Vary do Markdown sem repetir o render', async () => {
    vi.spyOn(Router, 'match').mockReturnValue([
      {
        path: '/about',
        pattern: '/about',
        match: '/about',
        params: {},
        info: { markdown: true }
      }
    ])
    const event = pageEvent('/en/about')
    const page = new Response('PRIVATE_RENDERED_BODY', {
      headers: { 'content-type': 'text/html' }
    })
    const setHeader = page.headers.set.bind(page.headers)
    vi.spyOn(page.headers, 'set').mockImplementation((name, value) => {
      if (name === 'vary' && value.includes('Accept')) {
        throw new Error('PRIVATE_VARY', { cause: 'PRIVATE_CAUSE' })
      }
      setHeader(name, value)
    })
    const next = vi.fn<() => Promise<Response>>().mockResolvedValue(page)

    const response = await provideRequestEvent(event, () =>
      middleware(event, next)
    )

    expect(next).toHaveBeenCalledExactlyOnceWith()
    expect(response.status).toBe(HTTP_INTERNAL_SERVER_ERROR)
    await expect(response.text()).resolves.toBe(PUBLIC_MESSAGE)
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(readLog(console.error)).toStrictEqual({
      heads: [[LOG_MESSAGE, 'Error']],
      leaks: []
    })
  })

  it('mantém o idioma durante o render do fallback interno', async () => {
    const event = pageEvent('/en/about')
    const fail = vi
      .fn<() => Promise<Response>>()
      .mockRejectedValue(new Error('PRIVATE_MIDDLEWARE'))
    const next = vi.fn<() => Promise<Response>>().mockImplementation(() => {
      expect(isPublicError(event.locals.serverFailure)).toBe(true)
      return Promise.resolve(
        new Response(getLocale(), { headers: { 'content-type': 'text/html' } })
      )
    })

    const response = await provideRequestEvent(event, () =>
      createMiddleware([fail])(event, next)
    )

    expect(next).toHaveBeenCalledExactlyOnceWith()
    expect(response.status).toBe(HTTP_INTERNAL_SERVER_ERROR)
    expect(response.headers.get('content-language')).toBe('en')
    await expect(response.text()).resolves.toBe('en')
    expect(readLog(console.error)).toStrictEqual({
      heads: [[LOG_MESSAGE, 'Error']],
      leaks: []
    })
  })

  it('entrega o alias reescrito ao render dentro do idioma da página', async () => {
    vi.spyOn(Router, 'match').mockReturnValue([
      {
        path: '/about',
        pattern: '/about',
        match: '/about',
        params: {},
        info: { markdown: true }
      }
    ])
    const event = pageEvent('/en/about.md?version=2')
    event.request = new Request(event.request, {
      headers: { accept: 'text/markdown' }
    })
    const next = vi.fn<() => Promise<Response>>().mockImplementation(() => {
      expect(event.request.url).toBe(`${TEST_ORIGIN}/en/about?version=2`)
      expect(event.request.headers.get('accept')).toBe('text/html')
      expect(getLocale()).toBe('en')
      event.locals.ssrRenderState = { hasCompleted: true, hasErrors: false }
      return Promise.resolve(
        new Response('<main><h1>Public content</h1></main>', {
          headers: { 'content-type': 'text/html' }
        })
      )
    })

    const response = await provideRequestEvent(event, () =>
      middleware(event, next)
    )

    expect(next).toHaveBeenCalledExactlyOnceWith()
    expect(response.headers.get('content-language')).toBe('en')
    expect(response.headers.get('content-type')).toBe(
      'text/markdown; charset=utf-8'
    )
    await expect(response.text()).resolves.toContain('# Public content')
    expect(console.error).not.toHaveBeenCalled()
  })
})

describe('falhas próprias do adaptador Markdown', () => {
  beforeEach(mockProductionLog)

  // Sem prefixo de idioma, o fallback devolve o redirect em vez da página.
  it('troca por 500 em texto o redirect de idioma do fallback', async () => {
    vi.spyOn(Router, 'match').mockImplementation(() => {
      throw new Error('PRIVATE_MATCH')
    })
    const event = pageEvent('/about')
    const next = vi.fn<() => Promise<Response>>()

    const response = await provideRequestEvent(event, () =>
      middleware(event, next)
    )

    expect(next).not.toHaveBeenCalled()
    expect(response.status).toBe(HTTP_INTERNAL_SERVER_ERROR)
    await expect(response.text()).resolves.toBe(PUBLIC_MESSAGE)
    expect(response.headers.has('location')).toBe(false)
    expect(readLog(console.error)).toStrictEqual({
      heads: [[LOG_MESSAGE, 'Error']],
      leaks: []
    })
  })

  it('registra a falha da conversão acima do limite de bytes', async () => {
    vi.spyOn(Router, 'match').mockReturnValue([
      {
        path: '/about',
        pattern: '/about',
        match: '/about',
        params: {},
        info: { markdown: true }
      }
    ])
    const event = pageEvent('/en/about.md')
    event.request = new Request(event.request, {
      headers: { accept: 'text/markdown' }
    })
    const next = vi.fn<() => Promise<Response>>().mockImplementation(() => {
      event.locals.ssrRenderState = { hasCompleted: true, hasErrors: false }
      return Promise.resolve(
        new Response('x'.repeat(MAX_HTML_BYTES + 1), {
          headers: { 'content-type': 'text/html' }
        })
      )
    })

    const response = await provideRequestEvent(event, () =>
      middleware(event, next)
    )

    expect(next).toHaveBeenCalledExactlyOnceWith()
    expect(response.status).toBe(HTTP_INTERNAL_SERVER_ERROR)
    await expect(response.text()).resolves.toBe(PUBLIC_MESSAGE)
    expect(readLog(console.error)).toStrictEqual({
      heads: [[LOG_MESSAGE, 'Error']],
      leaks: []
    })
  })
})

describe('respostas com headers imutáveis', () => {
  beforeEach(mockProductionLog)

  // Response.redirect() chega com headers imutáveis e sem corpo.
  it('grava os headers da cadeia num redirect sem trocar por 500', async () => {
    const event = pageEvent('/pt/pagina')
    const next = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValue(
        Response.redirect(new URL('/destino', TEST_ORIGIN), HTTP_FOUND)
      )

    const response = await provideRequestEvent(event, () =>
      middleware(event, next)
    )

    expect(console.error).not.toHaveBeenCalled()
    expect({
      status: response.status,
      ...Object.fromEntries(response.headers)
    }).toMatchObject({
      status: HTTP_FOUND,
      location: `${TEST_ORIGIN}/destino`,
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin'
    })
  })

  // O retorno cru de fetch() tem headers imutáveis e corpo upstream; a cadeia
  // não o repassa.
  it('troca a resposta crua de fetch() por 500 público', async () => {
    const event = pageEvent('/pt/pagina')
    const next = vi
      .fn<() => Promise<Response>>()
      .mockReturnValue(fetch('data:text/plain,PRIVATE_UPSTREAM'))

    const response = await provideRequestEvent(event, () =>
      middleware(event, next)
    )

    expect(response.status).toBe(HTTP_INTERNAL_SERVER_ERROR)
    await expect(response.text()).resolves.toBe(PUBLIC_MESSAGE)
    // Headers imutáveis lançam um TypeError; o corpo upstream fica fora do log.
    expect(readLog(console.error)).toStrictEqual({
      heads: [[LOG_MESSAGE, 'TypeError']],
      leaks: []
    })
  })
})

describe('cadeia de produção', () => {
  beforeEach(() => {
    // A CSP só sai nos builds de produção; o Vitest roda com DEV.
    vi.stubEnv('DEV', false)
  })

  // A ordem decide quais respostas recebem os cabeçalhos de segurança e o
  // contexto: o handler de API responde sem chamar next, então o que vier
  // depois dele não roda nas rotas de API. Trocar a ordem faz este teste falhar.
  it('aplica os cabeçalhos e o contexto antes do handler de API', async () => {
    const event = pageEvent(API_PATH)
    const next = vi.fn<() => Promise<Response>>()

    const response = await provideRequestEvent(event, () =>
      middleware(event, next)
    )

    expect(next).not.toHaveBeenCalled()
    await expect(response.text()).resolves.toBe('api')
    expect({
      requestId: typeof event.locals.requestId,
      nonce: typeof event.nonce,
      nosniff: response.headers.get('x-content-type-options')
    }).toStrictEqual({
      requestId: 'string',
      nonce: 'string',
      nosniff: 'nosniff'
    })
    expect(response.headers.get('content-security-policy')).toContain(
      "script-src 'none'"
    )
  })

  // O despacho das rotas de API é do filesystem-routing e a suíte E2E cobre
  // sitemap.xml e robots.txt; aqui só o encadeamento importa.
  it('entrega ao próximo handler as requisições sem rota de API', async () => {
    const event = pageEvent('/pt/pagina')
    const response = new Response('página')
    const next = vi.fn<() => Promise<Response>>().mockImplementation(() => {
      expect(event.locals.requestId).toBeDefined()
      expect(event.nonce).toBeDefined()
      return Promise.resolve(response)
    })

    await expect(
      provideRequestEvent(event, () => middleware(event, next))
    ).resolves.toBe(response)
    expect(next).toHaveBeenCalledOnce()
  })

  // O handler do plugin renderizaria a página com qualquer método, no idioma
  // base e com status 200.
  it('responde 405 a um POST numa página sem chamar o render', async () => {
    const event = writeEvent('/pt/about')
    const next = vi.fn<() => Promise<Response>>()

    const response = await provideRequestEvent(event, () =>
      middleware(event, next)
    )

    expect(next).not.toHaveBeenCalled()
    expect(response.status).toBe(HTTP_METHOD_NOT_ALLOWED)
    expect(response.headers.get('allow')).toBe('GET, HEAD')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('content-security-policy')).toContain(
      "script-src 'none'"
    )
  })

  it('mantém o POST de uma página tratado pelo handler de API', async () => {
    const event = writeEvent(FORM_PATH)
    const next = vi.fn<() => Promise<Response>>()

    const response = await provideRequestEvent(event, () =>
      middleware(event, next)
    )

    expect(next).not.toHaveBeenCalled()
    await expect(response.text()).resolves.toBe('post')
  })

  it('entrega ao dispatcher o POST de uma server function', async () => {
    const event = writeEvent('/_server/acao')
    const response = new Response('rpc')
    const next = vi.fn<() => Promise<Response>>().mockResolvedValue(response)

    await expect(
      provideRequestEvent(event, () => middleware(event, next))
    ).resolves.toBe(response)
    expect(next).toHaveBeenCalledOnce()
  })
})
