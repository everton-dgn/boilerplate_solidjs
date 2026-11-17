import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import { it } from 'node:test'

import * as v from 'valibot'

const ROOT = path.resolve(import.meta.dirname, '../..')
const patchesSchema = v.record(v.string(), v.string())
const manifestSchema = v.object({
  patchedDependencies: v.optional(patchesSchema, {})
})

// Bun only warns, without failing the install, when the key of a patch does not
// match the resolved version: updating the package without regenerating the
// patch would lose the fix.
it('keeps every patch keyed to a version resolved in bun.lock', async () => {
  const packageJson = await readFile(path.join(ROOT, 'package.json'), 'utf8')
  const manifest = v.parse(manifestSchema, JSON.parse(packageJson))
  const lock = await readFile(path.join(ROOT, 'bun.lock'), 'utf8')
  const patches = Object.entries(manifest.patchedDependencies)

  for (const [key] of patches) {
    assert.ok(
      lock.includes(`: ["${key}",`),
      `${key} is not resolved in bun.lock`
    )
  }
  await Promise.all(patches.map(([, file]) => access(path.join(ROOT, file))))
})
