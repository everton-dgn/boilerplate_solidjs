import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const projectDirectory = fileURLToPath(new URL('..', import.meta.url))
const gitDirectory = fileURLToPath(new URL('../.git', import.meta.url))
const lefthookPath = fileURLToPath(
  new URL('../node_modules/lefthook/bin/index.js', import.meta.url)
)
const playwrightPath = fileURLToPath(
  new URL('../node_modules/playwright/cli.js', import.meta.url)
)

function run(command, arguments_) {
  const result = spawnSync(process.execPath, [command, ...arguments_], {
    cwd: projectDirectory,
    stdio: 'inherit'
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

if (existsSync(lefthookPath) && existsSync(gitDirectory)) {
  run(lefthookPath, ['install'])
}

if (existsSync(playwrightPath)) {
  run(playwrightPath, ['install', 'chromium'])
}
