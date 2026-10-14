import type { ParaglideConfig } from '@inlang/paraglide-js'

import settings from './settings.json'

export default {
  outdir: './paraglide',
  emitTsDeclarations: true,
  outputStructure: 'message-modules',
  strategy: ['url', 'cookie', 'preferredLanguage', 'baseLocale'],
  cookieName: 'locale',
  cookieSameSite: 'lax',
  cookieSecure: 'auto',
  trailingSlash: 'never',
  urlPatterns: [
    {
      pattern: '/',
      localized: settings.locales.map(locale => [locale, `/${locale}`])
    },
    {
      pattern: '/:path(.*)?',
      localized: settings.locales.map(locale => [
        locale,
        `/${locale}/:path(.*)?`
      ])
    }
  ],
  emitReadme: false,
  emitPrettierIgnore: false
} satisfies ParaglideConfig
