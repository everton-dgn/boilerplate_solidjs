import { command } from '../github.ts'

type Options = {
  eventName: string | undefined
  base: string | undefined
  head: string | undefined
  runGit?: (args: string[]) => Promise<string>
}

const relevantFiles = new Set([
  'package.json',
  'bun.lock',
  'bunfig.toml',
  'vite.config.ts',
  'tsconfig.json',
  'tsconfig.node.json',
  'tooling/fmt.ts',
  '.github/workflows/ci.yml',
  '.github/workflows/auto-release.yml'
])
const relevantDirectories = ['tooling/release/', '.github/actions/']
const commitPattern = /^[a-f\d]{40}$/u

function git(args: string[]): Promise<string> {
  return command('git', args)
}

export async function shouldTestRelease({
  eventName,
  base,
  head,
  runGit = git
}: Options): Promise<boolean> {
  if (
    !base ||
    !head ||
    !commitPattern.test(base) ||
    !commitPattern.test(head) ||
    /^0+$/u.test(base) ||
    !['pull_request', 'push'].includes(eventName ?? '')
  ) {
    return true
  }
  try {
    const start =
      eventName === 'pull_request'
        ? await runGit(['merge-base', base, head])
        : base
    const changed = await runGit([
      'diff',
      '--no-renames',
      '--name-only',
      '-z',
      start.trim(),
      head,
      '--'
    ])
    return changed
      .split('\0')
      .some(
        file =>
          relevantFiles.has(file) ||
          relevantDirectories.some(directory => file.startsWith(directory))
      )
  } catch {
    return true
  }
}
