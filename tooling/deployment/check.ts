import { readFile } from 'node:fs/promises'
import { env, stdout } from 'node:process'

import { checkDeployment } from './checkDeployment/index.ts'

const manifest: unknown = JSON.parse(
  await readFile(
    new URL('../../.vercel/output/markdown.json', import.meta.url),
    'utf8'
  )
)
const checks = await checkDeployment({
  url: env.DEPLOYMENT_URL ?? '',
  manifest,
  bypassSecret: env.VERCEL_AUTOMATION_BYPASS_SECRET ?? ''
})
stdout.write(
  checks === 0
    ? 'No Markdown artifacts; deployment route checks skipped.\n'
    : `Deployment passed ${checks} HTTP checks.\n`
)
