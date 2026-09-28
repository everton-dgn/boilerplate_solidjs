import { readFile } from 'node:fs/promises'
import { env } from 'node:process'
import { stripVTControlCharacters } from 'node:util'

// Prefixo comum dos marcadores sintéticos do backend de erro. Qualquer
// ocorrência no log do servidor indica que um erro original foi registrado.
const PRIVATE_PREFIX = 'PRIVATE_BACKEND_'

export default async function checkServerLog(): Promise<void> {
  const file = env.SERVER_LOG_FILE
  const baseUrl = env.BASE_URL_TEST
  if (!file || !baseUrl) throw new Error('Server log file is not configured')
  const log = stripVTControlCharacters(await readFile(file, 'utf8'))
  // Controle positivo: um arquivo vazio ou de outro processo passaria na
  // verificação negativa sem provar nada.
  const { host } = new URL(baseUrl)
  if (!log.includes(host)) {
    throw new Error(`Server log does not show the preview startup: ${file}`)
  }
  if (log.includes(PRIVATE_PREFIX)) {
    throw new Error(`Server log contains a private marker: ${file}`)
  }
}
