import { m } from '@paraglide/messages.js'
import { getLocale } from '@paraglide/runtime.js'

import { LOCALE_TAGS } from '@/i18n/localeTags/index.ts'

const REPOSITORY_URL = 'https://github.com/everton-dgn/boilerplate_solidjs'

export const SITE = {
  title: 'SolidJS Boilerplate',
  get description(): string {
    return m.site_description()
  },
  author: {
    name: 'Éverton Toffanetto',
    url: 'https://github.com/everton-dgn',
    twitter: '@toffanettodev',
    sameAs: [
      'https://x.com/toffanettodev',
      'https://www.linkedin.com/in/everton-toffanetto/',
      'https://www.youtube.com/@toffanettodev'
    ]
  },
  twitter: '@toffanettodev',
  // BCP 47: `lang` do documento e `inLanguage` do JSON-LD; o `og:locale`
  // deriva daqui trocando o hífen por sublinhado.
  get locale(): string {
    return LOCALE_TAGS[getLocale()]
  },
  url: import.meta.env.VITE_SITE_URL,
  repositoryUrl: REPOSITORY_URL,
  socialLinks: [
    REPOSITORY_URL,
    'https://x.com/toffanettodev',
    'https://www.linkedin.com/in/everton-toffanetto/',
    'https://www.youtube.com/@toffanettodev'
  ],
  // Caminho do logo do publisher no JSON-LD; o Google pede ao menos 112x112.
  logo: '/favicon/apple-touch-icon.png',
  image: {
    path: '/images/og.png',
    width: 1200,
    height: 630,
    get alt(): string {
      return m.site_imageAlt()
    }
  }
}
