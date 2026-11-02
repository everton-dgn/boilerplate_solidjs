import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { open } from 'node:fs/promises'

import type { PrerenderRoute } from 'nitro/types'

import type { ArtifactDigest } from '../../types.ts'

const CHUNK_BYTES = 65_536
const HASH = 'sha256'
// No Windows, O_NOFOLLOW não existe e não altera os flags.
const READ_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW

// Bytes que o Nitro vai gravar para a rota, sem a decodificação de `contents`
// que trocaria sequências inválidas por U+FFFD.
export function readRouteBytes(route: PrerenderRoute): Uint8Array {
  if (route.data) return new Uint8Array(route.data)
  return new TextEncoder().encode(route.contents ?? '')
}

export function digestBytes(bytes: Uint8Array): ArtifactDigest {
  return {
    size: bytes.byteLength,
    hash: createHash(HASH).update(bytes).digest('hex')
  }
}

// Lê o arquivo publicado em blocos, sem seguir um link simbólico no nome.
export async function digestFile(file: string): Promise<ArtifactDigest> {
  const handle = await open(file, READ_FLAGS)
  try {
    const hash = createHash(HASH)
    const buffer = new Uint8Array(CHUNK_BYTES)
    let size = 0
    let read = await handle.read(buffer, 0, CHUNK_BYTES, null)
    while (read.bytesRead > 0) {
      size += read.bytesRead
      hash.update(buffer.subarray(0, read.bytesRead))
      read = await handle.read(buffer, 0, CHUNK_BYTES, null)
    }
    return { size, hash: hash.digest('hex') }
  } finally {
    await handle.close()
  }
}
