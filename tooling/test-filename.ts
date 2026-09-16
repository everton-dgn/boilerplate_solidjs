import path from 'node:path'

// Suites sem módulo colocalizado declaram os próprios alvos explicitamente.
const subjects: Record<string, readonly string[]> = {
  'src/__tests__': ['App', 'middleware', 'PageFileSystemRouter'],
  'src/tests/pages/Home': ['Home'],
  'src/tests/pages/NotFound': ['NotFound'],
  'src/tests/pages/BackendError': ['BackendError'],
  'tooling/css/__tests__': ['cssPolicy', 'testFilename'],
  'tooling/release/__tests__': ['automatic-release', 'versioning']
}

function testFilenameError(file: string): string | undefined {
  const normalized = path.posix.normalize(file.replaceAll('\\', '/'))
  if (!/^(?:src|tooling)\//u.test(normalized)) return undefined
  const basename = path.posix.basename(normalized)
  const directory = path.posix.dirname(normalized)
  const inPages =
    directory === 'src/tests/pages' || directory.startsWith('src/tests/pages/')
  const inTests = directory.split('/').includes('__tests__') || inPages
  if (!/\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(basename) && !inTests) {
    return undefined
  }
  const tooling = normalized.startsWith('tooling/')
  const match = tooling
    ? /^(?<subject>[^.]+)(?<qualifiers>(?:\.[a-z][a-zA-Z0-9]*)*)\.test\.ts$/u.exec(
        basename
      )
    : /^(?<subject>[^.]+)(?<qualifiers>(?:\.[a-z][a-zA-Z0-9]*)*)\.(?<environment>node|dom|browser|e2e)\.test\.tsx?$/u.exec(
        basename
      )
  if (!match?.groups) {
    return 'Use Nome[.qualificador].ambiente.test.ts(x) em src ou Nome[.qualificador].test.ts em tooling.'
  }
  const { subject, environment } = match.groups
  if (inPages && environment !== 'e2e') {
    return 'Testes de páginas devem usar o ambiente e2e.'
  }
  if (environment === 'e2e' && (!inPages || !subjects[directory])) {
    return 'Coloque testes e2e em src/tests/pages/NomeDaPagina e declare a página no mapeamento.'
  }
  let expected = subjects[directory]
  if (!expected && path.posix.basename(directory) === '__tests__') {
    expected = [path.posix.basename(path.posix.dirname(directory))]
  }
  if (!expected) {
    return 'Coloque o teste em __tests__ junto ao módulo ou declare sua suíte no mapeamento de tooling/test-filename.ts.'
  }
  if (!subject || !expected.includes(subject)) {
    return `Use o nome exato do assunto testado: ${expected.join(', ')}. Qualificadores usam ponto e camelCase.`
  }
  return undefined
}

type Diagnostic = {
  node: object
  message: string
}

type Context = {
  cwd: string
  filename: string
  report: (diagnostic: Diagnostic) => void
}

type RuleListeners = {
  Program: (node: object) => void
}

const testFilename = {
  meta: { type: 'problem', schema: [] },
  create(context: Context): RuleListeners {
    return {
      Program(node: object): void {
        const relative = path.relative(context.cwd, context.filename)
        const message = testFilenameError(relative)
        if (message) context.report({ node, message })
      }
    }
  }
}

export { testFilename, testFilenameError }
