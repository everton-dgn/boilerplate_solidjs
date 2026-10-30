import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'node:test'

import * as v from 'valibot'
import { RuleTester } from 'vite-plus/lint/plugins-dev'

import { lint } from '../../lint.ts'
import { lintFixture } from '../../testing/lintFixture/index.ts'
import backendPolicy from '../index.ts'
import backendPlugin from '../plugin.ts'

const ROOT = path.resolve(import.meta.dirname, '../../..')
type Diagnostic = { filename: string; code: string; severity: string }
type PolicyCase = { source: string; code: string }
type FilenameMatch = { actual: string; expected: string }
type ErrorQuery = {
  diagnostics: Diagnostic[]
  filename: string
  matches: (code: string) => boolean
}

// Só as regras de backend, sem o restante do lint do projeto.
const BACKEND_LINT_CONFIG = `export default ${JSON.stringify({
  lint: {
    categories: { correctness: 'off' },
    jsPlugins: [
      {
        name: 'backend',
        specifier: path.join(ROOT, 'tooling/backendPolicy/plugin.ts')
      }
    ],
    rules: { 'eslint/no-console': lint.rules?.['eslint/no-console'] },
    overrides: backendPolicy
  }
})}`

const OBSERVER_CODES = new Set([
  'eslint(no-restricted-imports)',
  'backend(static-render-integrity-imports)'
])

function matchesFilename({ actual, expected }: FilenameMatch): boolean {
  return actual === expected || actual.endsWith(`/${expected}`)
}

test('compara caminhos relativos, absolutos e URLs dos diagnósticos', () => {
  const expected = 'src/helpers/fetch.ts'
  for (const actual of [
    expected,
    `/tmp/project/${expected}`,
    `file:///tmp/project/${expected}`
  ]) {
    assert.ok(matchesFilename({ actual, expected }), actual)
  }
  for (const actual of [
    `other-${expected}`,
    `${expected}x`,
    'src/helpers/other.ts'
  ]) {
    assert.equal(matchesFilename({ actual, expected }), false, actual)
  }
})

function readDiagnostics(output: string): Diagnostic[] {
  const diagnostic = v.object({
    filename: v.string(),
    code: v.string(),
    severity: v.string()
  })
  const schema = v.object({ diagnostics: v.array(diagnostic) })
  return v.parse(schema, JSON.parse(output)).diagnostics
}

function hasError({ diagnostics, filename, matches }: ErrorQuery): boolean {
  return diagnostics.some(
    diagnostic =>
      matchesFilename({ actual: diagnostic.filename, expected: filename }) &&
      diagnostic.severity === 'error' &&
      matches(diagnostic.code)
  )
}

test('a regra exige imports estáticos do pacote Solid e seus subcaminhos', () => {
  const rule = backendPlugin.rules['static-solid-imports']
  assert.ok(rule)
  new RuleTester({ cwd: ROOT }).run('static-solid-imports', rule, {
    valid: [
      'import { redirect } from "@solidjs/web"',
      'import { configureServerFunctionsServer } from "@solidjs/web/server-functions/server"',
      'type Web = import("@solidjs/web").ResponseEnvelope<unknown>',
      'import("@solidjs/web-extra")',
      'import("./@solidjs/web")',
      'import("solid-js")',
      'import(packageName)',
      `import(\`@solidjs/\${name}\`)`
    ].map(code => ({ filename: 'src/probe.ts', code })),
    invalid: [
      'import("@solidjs/web")',
      'import(`@solidjs/web`)',
      'import("@solidjs/web/server-functions/server")',
      'import(`@solidjs/web/server-functions/server`)',
      'import("@solidjs/web/other-entry")'
    ].map(code => ({
      filename: 'src/probe.ts',
      code,
      errors: [{ messageId: 'staticImport' }]
    }))
  })
})

test('a regra exige import estático do estado de integridade do render', () => {
  const rule = backendPlugin.rules['static-render-integrity-imports']
  assert.ok(rule)
  new RuleTester({ cwd: ROOT }).run('static-render-integrity-imports', rule, {
    valid: [
      'import { createRenderIntegrity } from "@/infra/server/renderIntegrity/index.ts"',
      'type State = import("@/infra/server/renderIntegrity/index.ts").RenderIntegrity',
      'import("@/infra/server/renderIntegrityProbe/index.ts")',
      'import("./renderIntegrity.css")',
      'import(modulePath)'
    ].map(code => ({ filename: 'src/probe.ts', code })),
    invalid: [
      'import("@/infra/server/renderIntegrity/index.ts")',
      'import("@/infra/server/renderIntegrity")',
      'import("../renderIntegrity/index.ts")',
      'import(`../renderIntegrity`)'
    ].map(code => ({
      filename: 'src/probe.ts',
      code,
      errors: [{ messageId: 'staticImport' }]
    }))
  })
})

test('a política rejeita desvios de acesso no parser real do Oxlint', context => {
  const cases = {
    'fetch.ts': 'fetch("/private")',
    'alias.ts': 'const request = fetch; request("/private")',
    'global.ts': 'globalThis.fetch("/private")',
    'computed.ts': 'globalThis["fetch"]("/private")',
    'destructure.ts':
      'const { fetch: request } = globalThis; request("/private")',
    'console-destructure.ts': 'const { error } = console; error("PRIVATE")',
    'console-alias.ts': 'const logger = console; logger.error("PRIVATE")',
    'console-global.ts': 'globalThis.console.error("PRIVATE")',
    'safe-alias.ts':
      'import { markSafeError as safe } from "@solidjs/web"; safe(new Error("private"))',
    'namespace.ts':
      'import * as web from "@solidjs/web"; web.markSafeError(new Error("private"))',
    'reexport.ts': 'export { markSafeError as safe } from "@solidjs/web"',
    'sdk.ts': 'import { request } from "undici"',
    'dynamic-sdk.ts': 'void import("undici")',
    'node-http.ts': 'import { request } from "node:https"',
    'dynamic-node-http.ts': 'void import("node:https")',
    'override.ts':
      'import { configureServerFunctionsServer as configure } from "@solidjs/web/server-functions/server"',
    'handler.ts':
      'import { handleServerFunctionRequest } from "@solidjs/web/server-functions/server"',
    'export-config.ts': 'export * from "@solidjs/web/server-functions/server"',
    'side-effect-config.ts': 'import "@solidjs/web/server-functions/server"',
    'dynamic-config.ts': 'void import("@solidjs/web/server-functions/server")',
    'bare-config.ts':
      'import { configureServerFunctionsServer } from "@solidjs/web/server-functions"',
    'bare-export-config.ts': 'export * from "@solidjs/web/server-functions"',
    'bare-dynamic-config.ts': 'void import("@solidjs/web/server-functions")',
    'websocket.ts': 'new WebSocket("wss://private")',
    'window.ts': 'window.fetch("/private")',
    'relative.ts': 'import value from "../../../../private.ts"',
    'unsafe-fixture.ts': 'fetch("/private")'
  }
  const sources = {
    ...Object.fromEntries(
      Object.entries(cases).map(([filename, source]) => [
        `src/tests/fixtures/${filename}`,
        source
      ])
    ),
    'src/infra/server/logServerFailure/index.ts':
      'fetch("/private"); globalThis.console.warn("PRIVATE")',
    'src/infra/server/requestJson/index.ts': 'new WebSocket("wss://private")',
    'src/infra/server/publicErrors/index.ts':
      'import "@solidjs/web/server-functions"',
    'src/infra/server/configureServerErrors/index.ts':
      'import { markSafeError } from "@solidjs/web"'
  }
  const result = lintFixture({ sources, context, config: BACKEND_LINT_CONFIG })
  assert.equal(result.status, 1, result.stderr)
  const diagnostics = readDiagnostics(result.stdout)
  for (const code of [
    'eslint(no-restricted-globals)',
    'eslint(no-restricted-properties)'
  ]) {
    assert.ok(
      hasError({
        diagnostics,
        filename: 'src/infra/server/logServerFailure/index.ts',
        matches: actual => actual === code
      }),
      `proteção do log central: ${code}`
    )
  }
  for (const filename of Object.keys(sources)) {
    assert.ok(
      hasError({
        diagnostics,
        filename,
        matches: code =>
          /^eslint\(no-restricted-(?:globals|imports|properties)\)$/u.test(code)
      }),
      filename
    )
  }
})

test('o lint completo aplica as novas regras com exceções restritas', context => {
  const sources = {
    'src/tests/fixtures/error.ts': 'console.error(new Error("PRIVATE"))',
    'src/helpers/warn.ts': 'console.warn("PRIVATE")',
    'src/helpers/log.ts': 'console.log("PRIVATE")',
    'src/helpers/computed.ts': 'console["error"]("PRIVATE")',
    'src/helpers/dynamic.ts': 'void import("@solidjs/web")',
    'src/helpers/template.ts':
      'void import(`@solidjs/web/server-functions/server`)',
    'src/infra/server/logServerFailure/index.ts': 'console.warn("PRIVATE")',
    'src/infra/server/protectServerOperation/index.ts':
      'console.error("PRIVATE")',
    'src/infra/server/requestJson/index.ts': 'console.error("PRIVATE")',
    'src/infra/server/publicErrors/index.ts': 'void import("@solidjs/web")'
  }
  const result = lintFixture({ sources, context })
  assert.equal(result.status, 1, result.stderr)
  const diagnostics = readDiagnostics(result.stdout)
  for (const [filename, source] of Object.entries(sources)) {
    const code = source.includes('import(')
      ? 'backend(static-solid-imports)'
      : 'eslint(no-console)'
    assert.ok(
      hasError({ diagnostics, filename, matches: actual => actual === code }),
      `${filename}: ${code}`
    )
  }
})

test('a política preserva APIs públicas, testes e logging do tooling', context => {
  const valid = lintFixture({
    context,
    config: BACKEND_LINT_CONFIG,
    sources: {
      'src/infra/server/requestJson/index.ts':
        'export const request = () => fetch("/private")',
      'src/infra/server/publicErrors/index.ts':
        'import { markSafeError } from "@solidjs/web"; export const error = markSafeError(new Error("public"))',
      'src/infra/server/configureServerErrors/index.ts':
        'import { configureServerErrors } from "@solidjs/web"; import { configureServerFunctionsServer } from "@solidjs/web/server-functions/server"; import { handleServerFunctionRequest } from "@solidjs/web/server-functions"; configureServerErrors({}); configureServerFunctionsServer({}); export { handleServerFunctionRequest }',
      'src/infra/server/logServerFailure/index.ts': 'console.error("public")',
      'src/valid.ts':
        'import { createMemo } from "solid-js"; import { redirect } from "@solidjs/web"; globalThis.matchMedia("print"); typeof window; const client = { fetch() {} }; client.fetch(); function useLocal(fetch) { return fetch(); } const data = { allowControl: true }; export { createMemo, redirect, useLocal, data }',
      'src/local-console.ts': 'const console = { error() {} }; console.error()',
      'src/transport.test.ts':
        'fetch("/fixture"); console.error("fixture"); void import("@solidjs/web")',
      'src/transport.test.tsx':
        'console.warn("fixture"); void import(`@solidjs/web/server-functions/server`)',
      'src/example.d.ts':
        'type Safe = typeof import("@solidjs/web").markSafeError',
      'src/transport.test-d.ts':
        'import type { WrapInvocationHook } from "@solidjs/web/server-functions/server"; export type Hook = WrapInvocationHook',
      'src/example.d.mts':
        'import { markSafeError } from "@solidjs/web"; export type Safe = typeof markSafeError',
      'src/example.d.cts':
        'import { markSafeError } from "@solidjs/web"; export type Safe = typeof markSafeError',
      'src/transport.test.mts':
        'fetch("/fixture"); console.error("fixture"); void import("@solidjs/web")',
      'src/transport.test.cjs':
        'fetch("/fixture"); console.error("fixture"); void import("@solidjs/web")',
      'tooling/probe.ts':
        'console.warn("tooling"); console.error("tooling"); void import("@solidjs/web")'
    }
  })
  assert.equal(valid.status, 0, valid.stdout + valid.stderr)
})

test('só o módulo de registro instala o hook de erros do servidor', context => {
  const sources = {
    'src/helpers/hook.ts':
      'import { configureServerErrors } from "@solidjs/web"; configureServerErrors({})',
    'src/helpers/hook-alias.ts':
      'import { configureServerErrors as configure } from "@solidjs/web"; configure({})',
    'src/helpers/hook-namespace.ts':
      'import * as web from "@solidjs/web"; web.configureServerErrors({})',
    'src/helpers/hook-reexport.ts':
      'export { configureServerErrors } from "@solidjs/web"',
    'src/infra/server/publicErrors/index.ts':
      'import { configureServerErrors } from "@solidjs/web"; configureServerErrors({})',
    'src/infra/server/configureServerErrors/index.ts':
      'import { markSafeError } from "@solidjs/web"; markSafeError(new Error("private"))'
  }
  const result = lintFixture({ sources, context })
  assert.equal(result.status, 1, result.stderr)
  const diagnostics = readDiagnostics(result.stdout)
  for (const filename of Object.keys(sources)) {
    assert.ok(
      hasError({
        diagnostics,
        filename,
        matches: code => code === 'eslint(no-restricted-imports)'
      }),
      filename
    )
  }
})

test('só o registro do hook declara as falhas de render observadas', context => {
  const restricted = {
    'src/helpers/observer.ts':
      'import { observeRenderFailures } from "@/infra/server/renderIntegrity/index.ts"; observeRenderFailures()',
    'src/helpers/observer-alias.ts':
      'import { observeRenderFailures as observe } from "@/infra/server/renderIntegrity"; observe()',
    'src/helpers/observer-namespace.ts':
      'import * as integrity from "@/infra/server/renderIntegrity/index.ts"; integrity.observeRenderFailures()',
    'src/infra/server/requestJson/index.ts':
      'export { observeRenderFailures } from "../renderIntegrity/index.ts"',
    'src/infra/server/publicErrors/index.ts':
      'import { observeRenderFailures } from "../renderIntegrity/index.ts"; observeRenderFailures()',
    'src/helpers/observer-dynamic.ts':
      'void import("@/infra/server/renderIntegrity/index.ts").then(module => module.observeRenderFailures())'
  }
  const result = lintFixture({
    sources: restricted,
    context,
    config: BACKEND_LINT_CONFIG
  })
  assert.equal(result.status, 1, result.stderr)
  const diagnostics = readDiagnostics(result.stdout)
  for (const filename of Object.keys(restricted)) {
    assert.ok(
      hasError({
        diagnostics,
        filename,
        matches: code => OBSERVER_CODES.has(code)
      }),
      filename
    )
  }
  const allowed = lintFixture({
    context,
    config: BACKEND_LINT_CONFIG,
    sources: {
      'src/infra/server/configureServerErrors/index.ts':
        'import { observeRenderFailures } from "../renderIntegrity/index.ts"; observeRenderFailures()',
      'src/entry-server.tsx':
        'import { createRenderIntegrity, markRenderFailure } from "@/infra/server/renderIntegrity/index.ts"; export { createRenderIntegrity, markRenderFailure }',
      'src/infra/server/renderIntegrity/__tests__/renderIntegrity.node.test.ts':
        'import { observeRenderFailures } from "../index.ts"; observeRenderFailures()'
    }
  })
  assert.equal(allowed.status, 0, allowed.stdout + allowed.stderr)
})

test('a política cobre todas as extensões de código sem ampliar privilégios', context => {
  const cases = {
    fetch: {
      source: 'fetch("/private")',
      code: 'eslint(no-restricted-globals)'
    },
    console: { source: 'console.error("PRIVATE")', code: 'eslint(no-console)' },
    safe: {
      source: 'import { markSafeError } from "@solidjs/web"',
      code: 'eslint(no-restricted-imports)'
    },
    config: {
      source:
        'import { configureServerFunctionsServer } from "@solidjs/web/server-functions/server"',
      code: 'eslint(no-restricted-imports)'
    },
    hook: {
      source: 'import { configureServerErrors } from "@solidjs/web"',
      code: 'eslint(no-restricted-imports)'
    },
    transport: {
      source: 'import { request } from "node:https"',
      code: 'eslint(no-restricted-imports)'
    },
    dynamic: {
      source: 'void import("@solidjs/web")',
      code: 'backend(static-solid-imports)'
    },
    observer: {
      source:
        'import { observeRenderFailures } from "@/infra/server/renderIntegrity/index.ts"',
      code: 'eslint(no-restricted-imports)'
    },
    observerDynamic: {
      source: 'void import("@/infra/server/renderIntegrity/index.ts")',
      code: 'backend(static-render-integrity-imports)'
    }
  } satisfies Record<string, PolicyCase>
  const fixtures: Record<string, PolicyCase> = {}
  for (const extension of [
    'ts',
    'tsx',
    'mts',
    'cts',
    'js',
    'jsx',
    'mjs',
    'cjs'
  ]) {
    for (const [name, fixture] of Object.entries(cases)) {
      // CommonJS não admite imports estáticos; os casos de acesso global e
      // import dinâmico continuam exercitando essa extensão.
      if (
        extension !== 'cjs' ||
        !['safe', 'config', 'hook', 'transport', 'observer'].includes(name)
      ) {
        fixtures[`src/helpers/${name}.${extension}`] = fixture
      }
    }
  }
  fixtures['src/helpers/transport.cjs'] = {
    source: 'void import("node:https")',
    code: 'eslint(no-restricted-imports)'
  }
  fixtures['src/infra/server/requestJson/index.mts'] = cases.fetch
  fixtures['src/infra/server/logServerFailure/index.mts'] = cases.console
  fixtures['src/infra/server/publicErrors/index.mts'] = cases.safe
  fixtures['src/infra/server/configureServerErrors/index.mts'] = cases.config
  fixtures['src/infra/server/configureServerErrors/index.tsx'] = cases.observer
  const sources = Object.fromEntries(
    Object.entries(fixtures).map(([filename, { source }]) => [filename, source])
  )
  const result = lintFixture({ sources, context })
  assert.equal(result.status, 1, result.stderr)
  const diagnostics = readDiagnostics(result.stdout)
  for (const [filename, { code }] of Object.entries(fixtures)) {
    assert.ok(
      hasError({ diagnostics, filename, matches: actual => actual === code }),
      `${filename}: ${code}`
    )
  }
})
