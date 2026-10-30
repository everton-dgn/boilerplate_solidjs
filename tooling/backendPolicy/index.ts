import type { UserConfig } from 'vite-plus'

import {
  RELATIVE_IMPORT_RESTRICTION,
  RENDER_INTEGRITY_MODULE
} from './constants.ts'

type LintConfig = NonNullable<UserConfig['lint']>
type ImportPath = { name: string; importNames?: string[]; message: string }
type ImportPattern = { regex: string; importNames?: string[]; message: string }
type ImportRestrictions = { paths: ImportPath[]; patterns?: ImportPattern[] }
type GlobalRestrictions = { names: string[]; properties?: string[] }

const NETWORK = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource']
const RESTRICTED_GLOBALS = [...NETWORK, 'console']
const GLOBALS = ['globalThis', 'window', 'self', 'global']
const SAFE_ERRORS: ImportPath = {
  name: '@solidjs/web',
  importNames: ['markSafeError', 'SAFE_ERROR'],
  message:
    'Use createPublicError; somente publicErrors autoriza erros públicos.'
}
// O hook global de erros do servidor substitui o anterior a cada chamada;
// somente o módulo de registro pode instalá-lo.
const SERVER_ERROR_HOOK: ImportPath = {
  name: '@solidjs/web',
  importNames: ['configureServerErrors'],
  message: 'Mantenha o registro da política em configureServerErrors.'
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
// Depois dessa chamada o estado do render nasce sem erros; ela só vale no
// registro que instala o hook capaz de marcá-lo.
const RENDER_OBSERVER: ImportPattern = {
  regex: RENDER_INTEGRITY_MODULE,
  importNames: ['observeRenderFailures'],
  message:
    'Somente configureServerErrors declara que as falhas de render são observadas.'
}
const TRANSPORTS = ['http', 'https', 'http2', 'net', 'tls', 'undici']
  .flatMap(name => [name, `node:${name}`])
  .map(name => ({
    name,
    message: 'Integre transportes de backend em um adapter protegido.'
  }))

function imports({
  paths,
  patterns = []
}: ImportRestrictions): LintConfig['rules'] {
  return {
    'eslint/no-restricted-imports': [
      'error',
      {
        paths,
        patterns: [RELATIVE_IMPORT_RESTRICTION, ...patterns]
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
              ? 'Registre falhas somente por logServerFailure.'
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
      'backend/static-render-integrity-imports': 'error',
      'eslint/no-console': ['error', { allow: [] }],
      ...globals({ names: RESTRICTED_GLOBALS }),
      ...imports({
        paths: [
          SAFE_ERRORS,
          SERVER_ERROR_HOOK,
          ...SERVER_CONFIG,
          ...TRANSPORTS
        ],
        patterns: [RENDER_OBSERVER]
      })
    }
  },
  {
    files: ['src/infra/server/logServerFailure/index.ts'],
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
    rules: imports({
      paths: [SERVER_ERROR_HOOK, ...SERVER_CONFIG, ...TRANSPORTS],
      patterns: [RENDER_OBSERVER]
    })
  },
  {
    files: ['src/infra/server/configureServerErrors/index.ts'],
    rules: imports({ paths: [SAFE_ERRORS, ...TRANSPORTS] })
  },
  {
    files: [
      'src/**/*.test.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
      'src/**/*.test-d.{ts,tsx}',
      'src/**/*.d.{ts,mts,cts}'
    ],
    rules: {
      'backend/static-solid-imports': 'off',
      'backend/static-render-integrity-imports': 'off',
      'eslint/no-console': 'off',
      'eslint/no-restricted-globals': 'off',
      'eslint/no-restricted-properties': 'off',
      ...imports({ paths: [] })
    }
  }
]

export default backendPolicy
