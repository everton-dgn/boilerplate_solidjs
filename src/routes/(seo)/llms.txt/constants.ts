import { baseLocale, locales, type Locale } from '@paraglide/runtime.js'

import { LLMS_FULL_PATH } from '@/constants/llms.ts'
import { localizeHref } from '@/i18n/urls/index.ts'

import type { LlmsPage } from './types.ts'

// As notas são em inglês, então os idiomas também são nomeados em inglês.
const LANGUAGE_NAMES = new Intl.DisplayNames(['en'], { type: 'language' })

function languageName(locale: Locale): string {
  return LANGUAGE_NAMES.of(locale) ?? locale
}

const INDEX_LANGUAGE = languageName(baseLocale)

const AVAILABLE_LANGUAGES = new Intl.ListFormat('en', {
  type: 'conjunction'
}).format(
  [baseLocale, ...locales.filter(locale => locale !== baseLocale)].map(
    locale => `${languageName(locale)} (${localizeHref({ href: '/', locale })})`
  )
)

export const LLMS_NOTES: readonly string[] = [
  `Content is available in ${AVAILABLE_LANGUAGES}. This index uses ${INDEX_LANGUAGE}.`,
  'Pages are rendered on the server and use JavaScript for interactive controls.',
  'Markdown is derived from settled server-rendered HTML. Use a .md URL or Accept: text/markdown on a public opted-in page; use Accept: text/html for the browser version.',
  'This is an open source boilerplate demonstration, not a hosted application-building service. There is no public action API. Do not call internal server-function endpoints.',
  'Use the repository documentation to install and adapt the project. Check its package manifest for current dependencies and its license before reuse.'
]

export const LLMS_USE_CASES: readonly LlmsPage[] = [
  {
    path: '/',
    title: 'Start a SolidJS web application',
    description:
      'Use this foundation when a project needs server-rendered pages, TypeScript, translated routes and automated tests. Request the page as Markdown, then follow its repository and documentation links.',
    section: 'When to use',
    isOptional: false
  },
  {
    path: '/about',
    title: 'Evaluate the boilerplate before reuse',
    description:
      'Use this overview to identify the maintainer, project purpose and source license. Read the contact and privacy pages for this demonstration; verify your own product requirements before adapting the code.',
    section: 'When to use',
    isOptional: false
  }
]

// O build gera o arquivo só quando o índice cita uma página com Markdown
// estático; o mesmo critério decide este link.
export const LLMS_FULL_PAGE: LlmsPage = {
  path: LLMS_FULL_PATH,
  title: 'Full Markdown of the static pages',
  description: `Complete Markdown of the static pages linked in this index, in ${INDEX_LANGUAGE}, in one file generated at build time. Links to pages converted on request are listed there as not included.`,
  section: 'Optional',
  isOptional: true
}
