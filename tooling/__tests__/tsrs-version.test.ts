import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { it } from 'node:test'

import * as v from 'valibot'

const ROOT = path.resolve(import.meta.dirname, '../..')
const catalogSchema = v.record(v.string(), v.string())
const manifestSchema = v.object({
  workspaces: v.object({ catalog: catalogSchema })
})
const VITE_PLUS_TSRS =
  /"vite-plus": \["vite-plus@[^"]+", "", \{ "dependencies": \{[^}]*"tsrs": "=(?<version>[^"]+)"/u
const TSRS_PACKAGES = /^\s+"(?:[^"]*\/)?tsrs": \["tsrs@(?<version>[^"]+)"/gmu

// vp migrate updates vite-plus but not the tsrs of the catalog. Another version
// would install a second compiler, and typecheck:node would no longer check with
// the tsrs that runs the type check of the lint.
it('pins tsrs to the version that vite-plus installs, in a single copy', async () => {
  const packageJson = await readFile(path.join(ROOT, 'package.json'), 'utf8')
  const manifest = v.parse(manifestSchema, JSON.parse(packageJson))
  const lock = await readFile(path.join(ROOT, 'bun.lock'), 'utf8')
  const bundled = VITE_PLUS_TSRS.exec(lock)?.groups?.version
  const resolved = Array.from(
    lock.matchAll(TSRS_PACKAGES),
    match => match.groups?.version
  )

  assert.ok(bundled, 'bun.lock does not resolve the tsrs of vite-plus')
  assert.equal(manifest.workspaces.catalog.tsrs, bundled)
  assert.deepEqual(resolved, [bundled])
})
