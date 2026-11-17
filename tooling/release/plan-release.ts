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

// Runs in the job without write permission: only here is Vite+ installed and
// imported. The write jobs receive the result as an artifact.
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
    packageJson: await formatted({
      path: 'package.json',
      content: manifestContent({ ctx, version: expected.version })
    }),
    changelog: await formatted({
      path: 'CHANGELOG.md',
      content: expected.changelog
    })
  })
  // The same validation of the write jobs fails here, before any upload.
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
