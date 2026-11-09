import { m } from '@paraglide/messages.js'
import { getLocale } from '@paraglide/runtime.js'
import type { ContactPoint, PostalAddress } from 'schema-dts'

import { LOCALE_TAGS } from '@/i18n/localeTags/index.ts'

type ContactPointNode = Extract<ContactPoint, { '@type': 'ContactPoint' }>
type PostalAddressNode = Extract<PostalAddress, { '@type': 'PostalAddress' }>
type SiteOrganization = {
  contactPoint?: ContactPointNode
  address?: PostalAddressNode
}

const REPOSITORY_URL = 'https://github.com/everton-dgn/boilerplate_solidjs'

const AUTHOR_PROFILES = [
  'https://x.com/toffanettodev',
  'https://www.linkedin.com/in/everton-toffanetto/',
  'https://www.youtube.com/@toffanettodev'
]

// Valores fictícios da demonstração, publicados no JSON-LD da Organization.
// Um campo ausente sai do JSON-LD.
const ORGANIZATION: SiteOrganization = {
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'demo',
    email: 'contato@example.com',
    telephone: '0000000000',
    description:
      'Placeholder values for this boilerplate demonstration. Do not use them to contact the maintainer.'
  },
  address: {
    '@type': 'PostalAddress',
    streetAddress: 'Rua de exemplo, 123',
    addressLocality: 'Cidade de exemplo',
    addressRegion: 'Estado de exemplo',
    postalCode: '00000-000',
    addressCountry: 'BR',
    description: 'Placeholder address for this boilerplate demonstration.'
  }
}

export const SITE = {
  title: 'SolidJS Boilerplate',
  get description(): string {
    return m.site_description()
  },
  author: {
    name: 'Éverton Toffanetto',
    url: 'https://github.com/everton-dgn',
    twitter: '@toffanettodev',
    sameAs: AUTHOR_PROFILES
  },
  twitter: '@toffanettodev',
  // BCP 47: `lang` do documento e `inLanguage` do JSON-LD; o `og:locale`
  // deriva daqui trocando o hífen por sublinhado.
  get locale(): string {
    return LOCALE_TAGS[getLocale()]
  },
  url: import.meta.env.VITE_SITE_URL,
  repositoryUrl: REPOSITORY_URL,
  socialLinks: [REPOSITORY_URL, ...AUTHOR_PROFILES],
  organization: ORGANIZATION,
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
