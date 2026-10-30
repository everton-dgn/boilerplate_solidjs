import type { LlmsPage } from './types.ts'

export const LLMS_NOTES: readonly string[] = [
  'Content is available in English (/en), Brazilian Portuguese (/pt) and Spanish (/es). This index uses English.',
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
