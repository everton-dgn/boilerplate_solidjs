import type { UserConfig } from 'vite-plus'

type LintConfig = NonNullable<UserConfig['lint']>
type ImportPath = { name: string; importNames?: string[]; message: string }
type GlobalRestrictions = { names: string[]; properties?: string[] }

const RELATIVE_IMPORT_RESTRICTION = {
  regex: '^(\\.\\./){4,}',
  message:
    'Imports relativos podem subir no máximo três níveis. Use o alias @/ para caminhos mais distantes.'
}

const NETWORK = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource']
const RESTRICTED_GLOBALS = [...NETWORK, 'console']
const GLOBALS = ['globalThis', 'window', 'self', 'global']
const SAFE_ERRORS: ImportPath = {
  name: '@solidjs/web',
  importNames: ['markSafeError', 'SAFE_ERROR'],
  message:
    'Use createPublicError; somente publicErrors autoriza erros públicos.'
}
// O subcaminho sem sufixo expõe a mesma superfície de configuração e dispatch
// no runtime do servidor; a restrição precisa cobrir os dois especificadores.
const SERVER_CONFIG: ImportPath[] = [
  '@solidjs/web/server-functions',
  '@solidjs/web/server-functions/server'
].map(name => ({
  name,
  message: 'Mantenha o registro da política em configureServerErrors.'
}))
const TRANSPORTS = ['http', 'https', 'http2', 'net', 'tls', 'undici']
  .flatMap(name => [name, `node:${name}`])
  .map(name => ({
    name,
    message: 'Integre transportes de backend em um adapter protegido.'
  }))

function imports(paths: ImportPath[]): LintConfig['rules'] {
  return {
    'eslint/no-restricted-imports': [
      'error',
      {
        paths,
        patterns: [RELATIVE_IMPORT_RESTRICTION]
      }
    ]
  }
}

function globals({
  names,
  properties = names
}: GlobalRestrictions): LintConfig['rules'] {
  return {
    'eslint/no-restricted-globals': [
      'error',
      {
        globals: names,
        checkGlobalObject: true,
        globalObjects: ['global']
      }
    ],
    'eslint/no-restricted-properties': [
      'error',
      ...GLOBALS.flatMap(object =>
        properties.map(property => ({
          object,
          property,
          message:
            property === 'console'
              ? 'Mantenha os logs fixos em protectServerOperation.'
              : 'Use requestJson ou um adapter de backend protegido.'
        }))
      )
    ]
  }
}

const backendPolicy: NonNullable<LintConfig['overrides']> = [
  {
    files: ['src/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'],
    rules: {
      'backend/static-solid-imports': 'error',
      'eslint/no-console': ['error', { allow: [] }],
      ...globals({ names: RESTRICTED_GLOBALS }),
      ...imports([SAFE_ERRORS, ...SERVER_CONFIG, ...TRANSPORTS])
    }
  },
  {
    files: ['src/infra/server/protectServerOperation/index.ts'],
    rules: {
      ...globals({ names: NETWORK, properties: RESTRICTED_GLOBALS }),
      'eslint/no-console': ['error', { allow: ['error'] }]
    }
  },
  {
    files: ['src/infra/server/requestJson/index.ts'],
    rules: globals({
      names: RESTRICTED_GLOBALS.filter(name => name !== 'fetch')
    })
  },
  {
    files: ['src/infra/server/publicErrors/index.ts'],
    rules: imports([...SERVER_CONFIG, ...TRANSPORTS])
  },
  {
    files: ['src/infra/server/configureServerErrors/index.ts'],
    rules: imports([SAFE_ERRORS, ...TRANSPORTS])
  },
  {
    files: [
      'src/**/*.test.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
      'src/**/*.spec.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
      'src/**/*.d.{ts,mts,cts}'
    ],
    rules: {
      'backend/static-solid-imports': 'off',
      'eslint/no-console': 'off',
      'eslint/no-restricted-globals': 'off',
      'eslint/no-restricted-properties': 'off',
      ...imports([])
    }
  }
]

export { backendPolicy as default, RELATIVE_IMPORT_RESTRICTION }
