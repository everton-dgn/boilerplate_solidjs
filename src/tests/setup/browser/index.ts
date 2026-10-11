import { baseLocale, setLocale } from '@paraglide/runtime.js'

// oxlint-disable-next-line vitest/require-top-level-describe -- O hook global restaura o idioma após cookies compartilhados entre arquivos.
beforeEach(() => setLocale(baseLocale, { reload: false }))
