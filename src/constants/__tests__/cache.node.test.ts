import { SITE_CACHE_CONTROL } from '../cache.ts'

// A constante lê o ambiente ao carregar, então cada cenário reimporta o módulo.
async function loadCacheControl(production: boolean): Promise<string> {
  vi.resetModules()
  vi.stubEnv('PROD', production)
  const reloaded = await import('../cache.ts')
  return reloaded.SITE_CACHE_CONTROL
}

describe('cache-control das rotas geradas do manifesto', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('não guarda nada fora de produção', async () => {
    expect(SITE_CACHE_CONTROL).toBe('no-store')
    await expect(loadCacheControl(false)).resolves.toBe('no-store')
  })

  it('em produção, é público por uma hora', async () => {
    await expect(loadCacheControl(true)).resolves.toBe('public, max-age=3600')
  })
})
