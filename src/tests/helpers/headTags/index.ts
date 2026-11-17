// vi.waitUntil does not read test.expect.poll and waits 50ms by default.
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
