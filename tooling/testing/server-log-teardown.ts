import { readFile } from 'node:fs/promises'
import { env } from 'node:process'
import { stripVTControlCharacters } from 'node:util'

// Formato comum dos marcadores sintéticos dos E2E, como PRIVATE_BACKEND_ e
// PRIVATE_MARKDOWN_. Qualquer ocorrência no log do servidor indica que um erro
// ou cabeçalho original foi registrado.
const PRIVATE_MARKER = /PRIVATE_[A-Z0-9_]+/u

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
  if (PRIVATE_MARKER.test(log)) {
    throw new Error(`Server log contains a private marker: ${file}`)
  }
}
