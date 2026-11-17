import { SITE_CACHE_CONTROL } from '../cache.ts'

// The constant reads the environment on load, so each scenario imports the module again.
async function loadCacheControl(isProduction: boolean): Promise<string> {
  vi.resetModules()
  vi.stubEnv('PROD', isProduction)
  const reloaded = await import('../cache.ts')
  return reloaded.SITE_CACHE_CONTROL
}

describe('cache-control of the routes generated from the manifest', () => {
  it('stores nothing outside production', async () => {
    expect(SITE_CACHE_CONTROL).toBe('no-store')
    await expect(loadCacheControl(false)).resolves.toBe('no-store')
  })

  it('in production, the CDN reuses for one hour, keeps the good copy on an error for one day and the browser stores nothing', async () => {
    await expect(loadCacheControl(true)).resolves.toBe(
      'public, max-age=0, s-maxage=3600, stale-if-error=86400'
    )
  })
})
