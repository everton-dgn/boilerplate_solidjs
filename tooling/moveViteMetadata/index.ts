import { mkdir, rename, rm, stat } from 'node:fs/promises'
import nodePath from 'node:path'

type CompiledHook = () => Promise<void>
type Options = {
  dev: boolean
  rootDir: string
  output: { publicDir: string }
}
type MetadataNitro = {
  options: Options
  hooks: { hook: (name: 'compiled', handler: CompiledHook) => unknown }
}

const METADATA_DIR = '.vite'
const TARGET_DIR = 'dist'

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

async function hasDirectory(path: string): Promise<boolean> {
  try {
    const info = await stat(path)
    return info.isDirectory()
  } catch (error) {
    if (isMissing(error)) return false
    throw error
  }
}

async function moveMetadata({ options }: MetadataNitro): Promise<void> {
  if (options.dev) return
  const source = nodePath.join(options.output.publicDir, METADATA_DIR)
  if (!(await hasDirectory(source))) return
  const target = nodePath.join(options.rootDir, TARGET_DIR, METADATA_DIR)
  const relative = nodePath.relative(options.output.publicDir, target)
  if (!relative.startsWith('..') && !nodePath.isAbsolute(relative)) {
    throw new Error(`Vite metadata target is public: ${target}`)
  }
  await rm(target, { recursive: true, force: true })
  await mkdir(nodePath.dirname(target), { recursive: true })
  await rename(source, target)
}

// O client grava em `.vite/` o manifesto do Vite e o das server functions, e o
// Nitro aponta o outDir do client para o diretório público, servido pelo CDN
// antes da função. Quando o `compiled` final dispara, o SSR já leu o manifesto
// do Vite e o servidor usa o build ID em memória; os testes leem os dois em
// `dist/.vite/`.
export function moveViteMetadata(nitro: MetadataNitro): void {
  nitro.hooks.hook('compiled', () => moveMetadata(nitro))
}
