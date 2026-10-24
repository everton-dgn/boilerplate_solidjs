import { writeFile } from 'node:fs/promises'

import { format } from 'vite-plus/fmt'

import { fmt } from '../fmt.ts'
import {
  appendOutput,
  readContext,
  readSourcePlan,
  requiredEnv
} from './context.ts'
import {
  assertPlanArtifact,
  createPlanArtifact,
  manifestContent
} from './plan-artifact.ts'

type Source = {
  path: string
  content: string
}

// Roda no job sem permissão de escrita: só aqui o Vite+ é instalado e
// importado. Os jobs com escrita recebem o resultado como artifact.
async function formatted({ path, content }: Source): Promise<string> {
  const result = await format(path, content, fmt)
  if (result.errors.length > 0) throw new Error(`Cannot format ${path}.`)
  return result.code
}

const ctx = await readContext()
const expected = await readSourcePlan(ctx)
if (expected) {
  const artifact = createPlanArtifact({
    ctx,
    expected,
    packageJson: await formatted({
      path: 'package.json',
      content: manifestContent({ ctx, version: expected.version })
    }),
    changelog: await formatted({
      path: 'CHANGELOG.md',
      content: expected.changelog
    })
  })
  // A mesma validação dos jobs com escrita falha aqui, antes de qualquer upload.
  assertPlanArtifact({ artifact, ctx, expected })
  await writeFile(
    requiredEnv('RELEASE_PLAN_FILE'),
    `${JSON.stringify(artifact)}\n`,
    { flag: 'wx' }
  )
  await appendOutput({ release: 'true' })
} else {
  await appendOutput({ release: 'false' })
}
