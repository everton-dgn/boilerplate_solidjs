import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

type TrashCommand = { file: string; args: readonly string[] }

const execute = promisify(execFile)

// O `trash` do macOS (ou do Homebrew) e o `gio trash` das distribuições Linux
// com GLib movem os caminhos para a lixeira do usuário. Nenhuma alternativa
// apaga de forma permanente: sem esses comandos, os arquivos ficam onde estão.
const COMMANDS: readonly TrashCommand[] = [
  { file: 'trash', args: [] },
  { file: 'gio', args: ['trash'] }
]

function isMissingCommand(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

// Devolve `false` quando nenhum comando de lixeira existe no ambiente, como em
// runners de CI sem GLib. Uma falha do comando encontrado é propagada.
export async function moveToTrash(paths: readonly string[]): Promise<boolean> {
  if (paths.length === 0) return true
  for (const command of COMMANDS) {
    try {
      await execute(command.file, [...command.args, ...paths])
      return true
    } catch (error) {
      if (!isMissingCommand(error)) throw error
    }
  }
  return false
}
