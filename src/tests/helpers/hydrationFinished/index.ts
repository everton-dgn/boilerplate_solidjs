import type { Page } from '@playwright/test'

// O runtime do cliente troca a fila de eventos por null ao terminar a
// hidratação; sem JavaScript ela continua um array.
export async function hydrationFinished(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const runtime: unknown = Reflect.get(globalThis, '_$HY')
    const events: unknown =
      typeof runtime === 'object' && runtime !== null
        ? Reflect.get(runtime, 'events')
        : undefined
    return events === null
  })
}
