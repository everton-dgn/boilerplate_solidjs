import { baseLocale, setLocale } from '@paraglide/runtime.js'

// oxlint-disable-next-line vitest/require-top-level-describe -- The global hook restores the locale after cookies shared between files.
beforeEach(() => setLocale(baseLocale, { reload: false }))
