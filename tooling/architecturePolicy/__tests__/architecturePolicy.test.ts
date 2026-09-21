/* oxlint-disable vitest/no-import-node-test -- O tooling usa o runner nativo do Node.js. */
/* oxlint-disable node/no-sync -- O teste de integração cria uma fixture isolada e aguarda o CLI real. */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { RuleTester } from 'vite-plus/lint/plugins-dev'

import architecturePolicy from '../index.ts'

const ROOT = path.resolve(import.meta.dirname, '../../..')

test('a política distingue dependências permitidas e inversões de camada', () => {
  const rule = architecturePolicy.rules['layer-imports']
  assert.ok(rule)
  new RuleTester({ cwd: ROOT }).run('layer-imports', rule, {
    valid: [
      {
        filename: 'src/infra/server/operation/index.ts',
        code: 'import { createPublicError } from "@/infra/server/publicErrors/index.ts"'
      },
      {
        filename: 'src/components/atoms/Provider/index.tsx',
        code: 'import { createTheme } from "@/primitives/createTheme/index.ts"'
      },
      {
        filename: 'src/components/organisms/ErrorFallback/index.tsx',
        code: 'import { paths } from "@/router.ts"'
      },
      {
        filename: 'src/components/molecules/Topbar/index.tsx',
        code: 'export { ThemeToggle } from "@/components/atoms/ThemeToggle/index.tsx"'
      },
      {
        filename: 'src/primitives/createTheme/index.ts',
        code: 'import { applyTheme } from "@/infra/adapters/applyTheme/index.ts"'
      },
      {
        filename: 'src/components/atoms/DropdownMenu/primitives/menu.ts',
        code: 'import { Button } from "@/components/atoms/Button/index.tsx"'
      },
      {
        filename: 'src/routes/components/Card/index.tsx',
        code: 'import { ErrorFallback } from "@/components/organisms/ErrorFallback/index.tsx"'
      },
      {
        filename: 'src/primitives/theme/__tests__/theme.dom.test.tsx',
        code: 'import { Provider } from "@/components/atoms/Provider/index.tsx"'
      },
      {
        filename: 'src/helpers/theme.spec.ts',
        code: 'import { Button } from "@/components/atoms/Button/index.tsx"'
      },
      {
        filename: 'src/tests/fixtures/e2e/routes/index.tsx',
        code: 'export { default } from "@/routes/(home)/index.tsx"'
      },
      {
        filename: 'tooling/example.ts',
        code: 'import { Button } from "../src/components/atoms/Button/index.tsx"'
      },
      {
        filename: 'src/Document.tsx',
        code: 'import font from "./assets/font.woff2?url"; import "./theme/globalStyles.css"; import "server-only"'
      },
      {
        filename: 'src/components/atoms/Button/index.tsx',
        code: 'import S from "./styles.module.css"; import icon from "~icons/menu"; import { createSignal } from "solid-js"; export const value = 1'
      },
      {
        filename: 'src/router.ts',
        code: 'import routes from "virtual:file-routes"'
      },
      {
        filename: 'src/helpers/example.ts',
        code: 'import value from "@/componentsExtra/value.ts"; import other from "@/testsExtra/value.ts"; import("@/" + name)'
      },
      {
        filename: 'src/components/molecules.ts',
        code: 'export { Button } from "@/components/atoms/Button/index.tsx"'
      },
      {
        filename: 'src/components/atoms/Button/index.tsx',
        code: 'import "@/theme/tokens/index.css"'
      }
    ],
    invalid: [
      {
        filename: 'src/helpers/example.ts',
        code: 'import { Button } from "@/components/atoms/Button/index.tsx"'
      },
      {
        filename: 'src/infra/adapters/example/index.ts',
        code: 'import { Button } from "../../../components/atoms/Button/index.tsx"'
      },
      {
        filename: 'src/constants/example.ts',
        code: 'export * from "/src/components/organisms/ErrorFallback/index.tsx"'
      },
      {
        filename: 'src/data/example.ts',
        code: 'import("@/helpers/../components/atoms/Button/index.tsx?raw#part")'
      },
      {
        filename: 'src/@types/example.ts',
        code: 'import type { Props } from "@/components/atoms/Button/types.ts"'
      },
      {
        filename: 'src/@types/example.ts',
        code: 'export type Props = import("@/components/atoms/Button/types.ts").Props'
      },
      {
        filename: 'src/helpers/example.ts',
        code: 'export { createTheme } from "@/primitives/createTheme/index.ts"'
      },
      {
        filename: 'src/primitives/example.ts',
        code: 'export { default } from "@/routes/(home)/index.tsx"'
      },
      {
        filename: 'src/primitives/example.ts',
        code: 'import { Button } from "@/components/atoms/Button/index.tsx"'
      },
      {
        filename: 'src/primitives/example.ts',
        code: 'import { paths } from "@/router"'
      },
      {
        filename: 'src/infra/example.ts',
        code: 'import App from "@/App.tsx"'
      },
      {
        filename: 'src/infra/example.ts',
        code: 'import middleware from "@/middleware/index.ts"'
      },
      {
        filename: 'src/components/atoms/Button/index.tsx',
        code: 'import { Topbar } from "../../molecules/Topbar/index.tsx"'
      },
      {
        filename: 'src/components/atoms/Button/index.tsx',
        code: 'export * from "@/components/organisms"'
      },
      {
        filename: 'src/components/molecules/Topbar/index.tsx',
        code: 'import(`@/components/organisms/ErrorFallback/index.tsx`)'
      },
      {
        filename: 'src/components/organisms/ErrorFallback/index.tsx',
        code: 'import value from "@/tests/fixtures/value.ts"'
      },
      {
        filename: 'src/routes/index.tsx',
        code: 'export * from "../../tooling/example.ts"'
      },
      {
        filename: 'src/App.tsx',
        code: 'import value from "@/components/atoms/Button/__tests__/fixture.ts"'
      },
      {
        filename: 'src/feature/index.ts',
        code: 'import value from "@/helpers/example.node.test"'
      },
      {
        filename: 'src/helpers/example.ts',
        code: 'import value from "@/components/NewWidget/index.tsx"'
      },
      {
        filename: 'src/components/atoms.ts',
        code: 'export { Topbar } from "@/components/molecules/Topbar/index.tsx"'
      },
      {
        filename: 'src/helpers/example.ts',
        code: 'import { Button } from "@/components/atoms.ts"'
      },
      {
        filename: 'src/theme/example.ts',
        code: 'import { Button } from "@/components/atoms/Button/index.tsx"'
      }
    ].map(({ filename, code }) => ({
      filename,
      code,
      errors: [{ messageId: 'forbidden' }]
    }))
  })
})

test('o lint completo ativa a regra sem perder as restrições de backend', context => {
  const directory = mkdtempSync(path.join(tmpdir(), 'solid-architecture-'))
  // Sandbox criado pelo próprio teste: a remoção direta é o descarte correto.
  context.after(() => rmSync(directory, { recursive: true, force: true }))
  for (const name of ['node_modules', 'tooling']) {
    symlinkSync(path.join(ROOT, name), path.join(directory, name), 'dir')
  }
  writeFileSync(
    path.join(directory, 'package.json'),
    JSON.stringify({ type: 'module' }),
    { flag: 'wx' }
  )
  writeFileSync(
    path.join(directory, 'vite.config.ts'),
    'import { lint } from "./tooling/lint.ts"; export default { lint: { ...lint, options: { typeAware: false, typeCheck: false } } }',
    { flag: 'wx' }
  )
  mkdirSync(path.join(directory, 'src/helpers'), { recursive: true })
  writeFileSync(
    path.join(directory, 'src/helpers/probe.ts'),
    'export { Button } from "@/components/atoms/Button/index.tsx"; export const response = fetch("/private")',
    { flag: 'wx' }
  )
  const result = spawnSync(
    path.join(ROOT, 'node_modules/.bin/vp'),
    ['lint', 'src', '--format', 'json'],
    { cwd: directory, encoding: 'utf8', timeout: 30_000 }
  )
  assert.equal(result.status, 1, result.stderr)
  assert.match(result.stdout, /"code":\s*"architecture\(layer-imports\)"/u)
  assert.match(result.stdout, /"code":\s*"eslint\(no-restricted-globals\)"/u)
})
