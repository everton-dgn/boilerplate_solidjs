import {
  appendOutput,
  readContext,
  readSourcePlan,
  requiredEnv
} from './context.ts'
import { assertPlanArtifact, readPlanArtifact } from './plan-artifact.ts'
import { prepareRelease } from './prepare-release.ts'
import { publishRelease } from './publish-release.ts'

// Os jobs com escrita usam só Git, gh e módulos nativos; a formatação fica em plan-release.ts.

const mode = requiredEnv('RELEASE_MODE')
if (!['prepare', 'publish'].includes(mode)) {
  throw new Error('Invalid release mode.')
}
const ctx = await readContext()
const expected = await readSourcePlan(ctx)
if (!expected) throw new Error('The validated source has no release to plan.')
const release = assertPlanArtifact({
  artifact: await readPlanArtifact(requiredEnv('RELEASE_PLAN_FILE')),
  ctx,
  expected
})
const prepared = await prepareRelease({
  ctx,
  release,
  shouldCreate: mode === 'prepare'
})
if (mode === 'publish' && prepared) {
  await publishRelease({ ctx, prepared })
}
if (mode === 'prepare') {
  await appendOutput(
    prepared
      ? { publish: 'true', head: prepared.head, source: ctx.source }
      : { publish: 'false' }
  )
}
