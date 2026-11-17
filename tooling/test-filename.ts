import path from 'node:path'

import { defineRule } from 'vite-plus/lint/plugins'

// Suites without a colocated module declare their own targets explicitly.
const subjects: Record<string, readonly string[]> = {
  'tooling/__tests__': [
    'lint',
    'patched-dependencies',
    'playwright',
    'test-filename',
    'tsrs-version'
  ],
  'src/__tests__': ['App', 'PageFileSystemRouter'],
  'src/constants/__tests__': ['cache'],
  'src/tests/pages/Home': ['Home'],
  'src/tests/pages/Hydration': ['Hydration'],
  'src/tests/pages/NotFound': ['NotFound'],
  'src/tests/pages/BackendError': ['BackendError'],
  'src/tests/pages/FragmentCss': ['FragmentCss'],
  'src/tests/pages/LateRedirect': ['LateRedirect'],
  'src/tests/pages/OutsideError': ['OutsideError'],
  'src/tests/pages/OutdatedPage': ['OutdatedPage'],
  'src/tests/pages/SeoIndexes': ['SeoIndexes'],
  'src/tests/pages/AgentReadiness': ['AgentReadiness'],
  'src/tests/pages/BuildOutput': ['BuildOutput'],
  'src/tests/pages/I18n': ['I18n'],
  'src/tests/pages/Markdown': ['Markdown'],
  'src/tests/pages/PublicationLoad': ['PublicationLoad'],
  'src/tests/pages/UiKit': ['UiKit'],
  'src/tests/pages/StructuredData': ['StructuredData'],
  'tooling/css/__tests__': ['cssPolicy'],
  'tooling/release/__tests__': ['automatic-release', 'versioning']
}

const DOTTED_SUBJECT = 'subject'

type DottedSubjectOptions = {
  expected: readonly string[] | undefined
  basename: string
}

function expectedSubjects(directory: string): readonly string[] | undefined {
  const declared = subjects[directory]
  if (declared || path.posix.basename(directory) !== '__tests__') {
    return declared
  }
  return [path.posix.basename(path.posix.dirname(directory))]
}

// Route folders such as llms.txt have a dot in the name; the whole subject comes
// out of the pattern before reading the qualifiers.
function dottedSubject({
  expected,
  basename
}: DottedSubjectOptions): string | undefined {
  return expected?.find(
    name => name.includes('.') && basename.startsWith(`${name}.`)
  )
}

function isTestSupportModule(file: string): boolean {
  return (
    !file.startsWith('src/tests/pages/') &&
    /\/__tests__\/(?:fixtures|types|constants)\.ts$/u.test(file)
  )
}

export function testFilenameError(file: string): string | undefined {
  const normalized = path.posix.normalize(file.replaceAll('\\', '/'))
  if (!/^(?:src|tooling)\//u.test(normalized)) return undefined
  const basename = path.posix.basename(normalized)
  const directory = path.posix.dirname(normalized)
  const inPages =
    directory === 'src/tests/pages' || directory.startsWith('src/tests/pages/')
  const inTests = directory.split('/').includes('__tests__') || inPages
  if (isTestSupportModule(normalized)) return undefined
  if (!/\.(?:test|spec|test-d)\.[cm]?[jt]sx?$/u.test(basename) && !inTests) {
    return undefined
  }
  const expected = expectedSubjects(directory)
  const dotted = dottedSubject({ expected, basename })
  const candidate = dotted
    ? `${DOTTED_SUBJECT}${basename.slice(dotted.length)}`
    : basename
  const tooling = normalized.startsWith('tooling/')
  const match = tooling
    ? /^(?<subject>[^.]+)(?<qualifiers>(?:\.[a-z][a-zA-Z0-9]*)*)\.test\.ts$/u.exec(
        candidate
      )
    : /^(?<subject>[^.]+)(?<qualifiers>(?:\.[a-z][a-zA-Z0-9]*)*)(?:\.(?<environment>node|dom|browser|e2e)\.test|\.test-d)\.tsx?$/u.exec(
        candidate
      )
  if (!match?.groups) {
    return 'Use Name[.qualifier].environment.test.ts(x) or Name[.qualifier].test-d.ts(x) for types in src, or Name[.qualifier].test.ts in tooling.'
  }
  const { environment } = match.groups
  const subject = dotted ?? match.groups.subject
  if (inPages && environment !== 'e2e') {
    return 'Page tests must use the e2e environment.'
  }
  if (environment === 'e2e' && (!inPages || !subjects[directory])) {
    return 'Put e2e tests in src/tests/pages/PageName and declare the page in the mapping.'
  }
  if (!expected) {
    return 'Put the test in __tests__ next to the module or declare its suite in the mapping of tooling/test-filename.ts.'
  }
  if (!subject || !expected.includes(subject)) {
    return `Use the exact name of the tested subject: ${expected.join(', ')}. Qualifiers use a dot and camelCase.`
  }
  return undefined
}

export const testFilename = defineRule({
  meta: { type: 'problem', schema: [] },
  create(context) {
    return {
      Program(node): void {
        const relative = path.relative(context.cwd, context.filename)
        const message = testFilenameError(relative)
        if (message) context.report({ node, message })
      }
    }
  }
})
