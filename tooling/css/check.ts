import { readdir } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import stylelint from 'stylelint'

import { cssFilenameError } from '../css-modules-plugin.ts'

type Diagnostic = {
  file: string
  message: string
}

const root = path.resolve(import.meta.dirname, '../..')
const diagnostics: Diagnostic[] = []

const entries = await readdir(path.join(root, 'src'), {
  recursive: true,
  withFileTypes: true
})

for (const entry of entries) {
  if (!entry.isFile()) continue
  const absolute = path.join(entry.parentPath, entry.name)
  const relative = path.relative(root, absolute).split(path.sep).join('/')
  if (relative.endsWith('.css')) {
    const message = cssFilenameError(relative)
    if (message) diagnostics.push({ file: relative, message })
  }
}

const result = await stylelint.lint({
  cwd: root,
  files: ['src/**/*.css'],
  configFile: path.join(import.meta.dirname, 'stylelint.config.mjs'),
  formatter: 'string'
})

if (result.report) process.stdout.write(result.report)
for (const diagnostic of diagnostics) {
  process.stdout.write(
    `${diagnostic.file}:1 error project/css-filename: ${diagnostic.message}\n`
  )
}
if (result.errored || diagnostics.length > 0) process.exitCode = 1
