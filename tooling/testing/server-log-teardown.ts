import { readFile } from 'node:fs/promises'
import { env } from 'node:process'
import { stripVTControlCharacters } from 'node:util'

// Common format of the synthetic E2E markers, such as PRIVATE_BACKEND_ and
// PRIVATE_MARKDOWN_. Any occurrence in the server log means that an original
// error or header was logged.
const PRIVATE_MARKER = /PRIVATE_[A-Z0-9_]+/u

type ServerLog = { file: string | undefined; baseUrl: string | undefined }

async function checkLog({ file, baseUrl }: ServerLog): Promise<void> {
  if (!file || !baseUrl) throw new Error('Server log file is not configured')
  const log = stripVTControlCharacters(await readFile(file, 'utf8'))
  // Positive control: an empty file or one from another process would pass the
  // negative check without proving anything.
  const { host } = new URL(baseUrl)
  if (!log.includes(host)) {
    throw new Error(`Server log does not show the preview startup: ${file}`)
  }
  if (PRIVATE_MARKER.test(log)) {
    throw new Error(`Server log contains a private marker: ${file}`)
  }
}

export default async function checkServerLog(): Promise<void> {
  await checkLog({ file: env.SERVER_LOG_FILE, baseUrl: env.BASE_URL_TEST })
  if (env.TEST_PUBLICATION_LOAD === 'true') {
    await checkLog({
      file: env.SERVER_LOG_SECONDARY,
      baseUrl: env.PUBLICATION_SECONDARY_URL
    })
  }
}
