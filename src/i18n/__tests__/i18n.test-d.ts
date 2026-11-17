import { m } from '@paraglide/messages.js'
import type { Locale } from '@paraglide/runtime.js'

describe('generated message types', () => {
  it('checks message IDs, parameters and locales at compile time', () => {
    const locale: Locale = 'es'
    m.home_description(
      { framework: 'SolidJS', toolchain: 'Vite+', language: 'TypeScript' },
      { locale }
    )
    // @ts-expect-error Every declared parameter is required.
    m.home_description({ framework: 'SolidJS' })
    expectTypeOf<keyof typeof m>().extract<'home_missing'>().toBeNever()
    // @ts-expect-error Only the configured locales are accepted.
    m.home_title({}, { locale: 'fr' })
  })
})
