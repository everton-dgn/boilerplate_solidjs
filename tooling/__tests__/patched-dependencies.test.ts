import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import { it } from 'node:test'

import * as v from 'valibot'

const ROOT = path.resolve(import.meta.dirname, '../..')
const manifestSchema = v.object({
  patchedDependencies: v.record(v.string(), v.string())
})

// O Bun só avisa, sem falhar o install, quando a chave de um patch não
// corresponde à versão resolvida: atualizar o pacote sem regenerar o patch
// perderia a correção.
it('keeps every patch keyed to a version resolved in bun.lock', async () => {
  const packageJson = await readFile(path.join(ROOT, 'package.json'), 'utf8')
  const manifest = v.parse(manifestSchema, JSON.parse(packageJson))
  const lock = await readFile(path.join(ROOT, 'bun.lock'), 'utf8')
  const patches = Object.entries(manifest.patchedDependencies)

  assert.notEqual(patches.length, 0)
  for (const [key] of patches) {
    assert.ok(
      lock.includes(`: ["${key}",`),
      `${key} is not resolved in bun.lock`
    )
  }
  await Promise.all(patches.map(([, file]) => access(path.join(ROOT, file))))
})
