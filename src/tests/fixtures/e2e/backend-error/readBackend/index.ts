import * as v from 'valibot'

import { createPublicError } from '@/infra/server/publicErrors/index.ts'
import { requestJson } from '@/infra/server/requestJson/index.ts'

import { fixtureError } from '../../backend/fixtureError/index.ts'

type BackendData = { message: string }

export async function readBackend(id: string): Promise<BackendData> {
  'use server'
  const data = await requestJson({
    url: `http://127.0.0.1:4318/data?id=${encodeURIComponent(id)}`,
    schema: v.object({ message: v.string() })
  })
  if (id.startsWith('public:')) throw createPublicError()
  // They exercise the global policy without depending on the catch of the
  // transport. The synthetic details are created in the backend only after the build.
  if (id.startsWith('throw:') || id.startsWith('result:')) {
    const error = fixtureError(data.message)
    if (id.startsWith('throw:')) throw error
    const invalidResult = { message: 'Invalid result', error }
    return invalidResult
  }
  return data
}
