import path from 'node:path'
import process from 'node:process'

import { checkMarkdownLinks } from './index.ts'

const root = path.resolve(import.meta.dirname, '../..')
const diagnostics = await checkMarkdownLinks({
  directory: path.join(root, '.agents/skills'),
  root
})

for (const diagnostic of diagnostics) {
  process.stdout.write(
    `${diagnostic.file}:${diagnostic.line} error project/skill-links: ${diagnostic.message}\n`
  )
}
if (diagnostics.length > 0) process.exitCode = 1
