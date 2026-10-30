// vi.waitUntil não lê test.expect.poll e espera 50ms por padrão.
export const POLL = { interval: 10 }

export function readCanonical(): string | null {
  return (
    document.head
      .querySelector('link[rel="canonical"]')
      ?.getAttribute('href') ?? null
  )
}

export function readScripts(): string[] {
  return [
    ...document.head.querySelectorAll('script[type="application/ld+json"]')
  ].map(script => script.textContent)
}
