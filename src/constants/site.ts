import { LOCALE_TAGS } from '@/i18n/localeTags/index.ts'
import { m } from '@/paraglide/messages.js'
import { getLocale } from '@/paraglide/runtime.js'

export const SITE = {
  title: 'SolidJS Boilerplate',
  get description(): string {
    return m.site_description()
  },
  author: {
    name: 'Éverton Toffanetto',
    // `url` identifica o autor no nó `Article` do JSON-LD.
    url: 'https://github.com/everton-dgn',
    // Handle publicado em `twitter:creator`.
    twitter: '@toffanettodev',
    // Perfis do autor, publicados em `sameAs` no nó `Person` do `Article`.
    sameAs: [
      'https://x.com/toffanettodev',
      'https://www.linkedin.com/in/everton-toffanetto/',
      'https://www.youtube.com/@toffanettodev'
    ]
  },
  // Handle do site publicado em `twitter:site`.
  twitter: '@toffanettodev',
  // BCP 47: `lang` do documento e `inLanguage` do JSON-LD; o `og:locale`
  // deriva daqui trocando o hífen por sublinhado.
  get locale(): string {
    return LOCALE_TAGS[getLocale()]
  },
  // URL pública fixa para canonical, Open Graph, sitemap e robots, definida
  // por VITE_SITE_URL.
  url: import.meta.env.VITE_SITE_URL,
  // Páginas oficiais do site em outros domínios, publicadas em `sameAs` no
  // nó `Organization`.
  socialLinks: [
    'https://github.com/everton-dgn/boilerplate_solidjs',
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
