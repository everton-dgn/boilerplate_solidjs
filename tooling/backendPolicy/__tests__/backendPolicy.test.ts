/* oxlint-disable vitest/no-import-node-test -- Executa o CLI real em um projeto temporário com o runner nativo do Node.js. */
/* oxlint-disable node/no-sync -- Fixture e subprocessos são sequenciais e isolados do servidor; o processo de teste aguarda o CLI real. */
import assert from 'node:assert/strict'
import { spawnSync, type SpawnSyncReturns } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test, type TestContext } from 'node:test'

import * as v from 'valibot'
import { RuleTester } from 'vite-plus/lint/plugins-dev'

import { lint } from '../../lint.ts'
import backendPolicy from '../index.ts'
import backendPlugin from '../plugin.ts'

const ROOT = path.resolve(import.meta.dirname, '../../..')
type LintFixture = {
  sources: Record<string, string>
  full?: boolean
  context: TestContext
}
type Diagnostic = { filename: string; code: string; severity: string }
type PolicyCase = { source: string; code: string }
type FilenameMatch = { actual: string; expected: string }

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

function lintFixture({
  sources,
  full = false,
  context
}: LintFixture): SpawnSyncReturns<string> {
  const directory = mkdtempSync(path.join(tmpdir(), 'solid-backend-policy-'))
  // Sandbox criado pelo próprio teste: a remoção direta é o descarte correto.
  context.after(() => rmSync(directory, { recursive: true, force: true }))
  symlinkSync(
    path.join(ROOT, 'node_modules'),
    path.join(directory, 'node_modules'),
    'dir'
  )
  writeFileSync(
    path.join(directory, 'package.json'),
    JSON.stringify({ type: 'module' }),
    { flag: 'wx' }
  )
  writeFileSync(
    path.join(directory, 'vite.config.ts'),
    `export default ${JSON.stringify({
      lint: full
        ? {
            ...lint,
            jsPlugins: lint.jsPlugins?.map(plugin =>
              typeof plugin === 'string' || !plugin.specifier.startsWith('.')
                ? plugin
                : { ...plugin, specifier: path.resolve(ROOT, plugin.specifier) }
            ),
            options: { typeAware: false, typeCheck: false }
          }
        : {
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
    })}`,
    { flag: 'wx' }
  )
  for (const [filename, source] of Object.entries(sources)) {
    const destination = path.join(directory, filename)
    mkdirSync(path.dirname(destination), { recursive: true })
    writeFileSync(destination, source, { flag: 'wx' })
  }
  return spawnSync(
    path.join(ROOT, 'node_modules/.bin/vp'),
    ['lint', ...Object.keys(sources), '--format', 'json'],
    { cwd: directory, encoding: 'utf8', timeout: 30_000 }
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
    'src/infra/server/protectServerOperation/index.ts':
      'fetch("/private"); globalThis.console.warn("PRIVATE")',
    'src/infra/server/requestJson/index.ts': 'new WebSocket("wss://private")',
    'src/infra/server/publicErrors/index.ts':
      'import "@solidjs/web/server-functions"',
    'src/infra/server/configureServerErrors/index.ts':
      'import { markSafeError } from "@solidjs/web"'
  }
  const result = lintFixture({ sources, context })
  assert.equal(result.status, 1, result.stderr)
  const diagnostics = readDiagnostics(result.stdout)
  for (const code of [
    'eslint(no-restricted-globals)',
    'eslint(no-restricted-properties)'
  ]) {
    assert.ok(
      diagnostics.some(
        diagnostic =>
          matchesFilename({
            actual: diagnostic.filename,
            expected: 'src/infra/server/protectServerOperation/index.ts'
          }) &&
          diagnostic.code === code &&
          diagnostic.severity === 'error'
      ),
      `proteção do wrapper: ${code}`
    )
  }
  for (const filename of Object.keys(sources)) {
    assert.ok(
      diagnostics.some(
        diagnostic =>
          matchesFilename({
            actual: diagnostic.filename,
            expected: filename
          }) &&
          diagnostic.severity === 'error' &&
          /^eslint\(no-restricted-(?:globals|imports|properties)\)$/u.test(
            diagnostic.code
          )
      ),
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
    'src/infra/server/protectServerOperation/index.ts':
      'console.warn("PRIVATE")',
    'src/infra/server/requestJson/index.ts': 'console.error("PRIVATE")',
    'src/infra/server/publicErrors/index.ts': 'void import("@solidjs/web")'
  }
  const result = lintFixture({ sources, full: true, context })
  assert.equal(result.status, 1, result.stderr)
  const diagnostics = readDiagnostics(result.stdout)
  for (const [filename, source] of Object.entries(sources)) {
    const code = source.includes('import(')
      ? 'backend(static-solid-imports)'
      : 'eslint(no-console)'
    assert.ok(
      diagnostics.some(
        diagnostic =>
          matchesFilename({
            actual: diagnostic.filename,
            expected: filename
          }) &&
          diagnostic.code === code &&
          diagnostic.severity === 'error'
      ),
      `${filename}: ${code}`
    )
  }
})

test('a política preserva APIs públicas, testes e logging do tooling', context => {
  const valid = lintFixture({
    context,
    sources: {
      'src/infra/server/requestJson/index.ts':
        'export const request = () => fetch("/private")',
      'src/infra/server/publicErrors/index.ts':
        'import { markSafeError } from "@solidjs/web"; export const error = markSafeError(new Error("public"))',
      'src/infra/server/configureServerErrors/index.ts':
        'import { configureServerFunctionsServer } from "@solidjs/web/server-functions/server"; import { handleServerFunctionRequest } from "@solidjs/web/server-functions"; configureServerFunctionsServer({}); export { handleServerFunctionRequest }',
      'src/infra/server/protectServerOperation/index.ts':
        'console.error("public")',
      'src/valid.ts':
        'import { createMemo } from "solid-js"; import { redirect } from "@solidjs/web"; globalThis.matchMedia("print"); typeof window; const client = { fetch() {} }; client.fetch(); function useLocal(fetch) { return fetch(); } const data = { allowControl: true }; export { createMemo, redirect, useLocal, data }',
      'src/local-console.ts': 'const console = { error() {} }; console.error()',
      'src/transport.test.ts':
        'fetch("/fixture"); console.error("fixture"); void import("@solidjs/web")',
      'src/transport.spec.tsx':
        'console.warn("fixture"); void import(`@solidjs/web/server-functions/server`)',
      'src/example.d.ts':
        'type Safe = typeof import("@solidjs/web").markSafeError',
      'src/example.d.mts':
        'import { markSafeError } from "@solidjs/web"; export type Safe = typeof markSafeError',
      'src/example.d.cts':
        'import { markSafeError } from "@solidjs/web"; export type Safe = typeof markSafeError',
      'src/transport.test.mts':
        'fetch("/fixture"); console.error("fixture"); void import("@solidjs/web")',
      'src/transport.spec.cjs':
        'fetch("/fixture"); console.error("fixture"); void import("@solidjs/web")',
      'tooling/probe.ts':
        'console.warn("tooling"); console.error("tooling"); void import("@solidjs/web")'
    }
  })
  assert.equal(valid.status, 0, valid.stdout + valid.stderr)
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
    transport: {
      source: 'import { request } from "node:https"',
      code: 'eslint(no-restricted-imports)'
    },
    dynamic: {
      source: 'void import("@solidjs/web")',
      code: 'backend(static-solid-imports)'
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
        !['safe', 'config', 'transport'].includes(name)
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
  fixtures['src/infra/server/protectServerOperation/index.mts'] = cases.console
  fixtures['src/infra/server/publicErrors/index.mts'] = cases.safe
  fixtures['src/infra/server/configureServerErrors/index.mts'] = cases.config
  const sources = Object.fromEntries(
    Object.entries(fixtures).map(([filename, { source }]) => [filename, source])
  )
  const result = lintFixture({ sources, full: true, context })
  assert.equal(result.status, 1, result.stderr)
  const diagnostics = readDiagnostics(result.stdout)
  for (const [filename, { code }] of Object.entries(fixtures)) {
    assert.ok(
      diagnostics.some(
        diagnostic =>
          matchesFilename({
            actual: diagnostic.filename,
            expected: filename
          }) &&
          diagnostic.code === code &&
          diagnostic.severity === 'error'
      ),
      `${filename}: ${code}`
    )
  }
})
