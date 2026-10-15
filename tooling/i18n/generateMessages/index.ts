import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { promisify } from 'node:util'

import { prepareMessages } from '../prepareMessages/index.ts'

const resolvePackage = createRequire(import.meta.url)
const COMPILER_CLI = path.resolve(
  path.dirname(resolvePackage.resolve('@inlang/paraglide-js')),
  '../bin/run.js'
)
const execute = promisify(execFile)

export async function generateMessages(root = process.cwd()): Promise<void> {
  const resolved = path.resolve(root)
  await prepareMessages(resolved)
  await execute(
    'bun',
    [
      COMPILER_CLI,
      'compile',
      '--project',
      path.join(resolved, 'project.inlang'),
      '--silent'
    ],
    { cwd: resolved }
  )
}
