import * as v from 'valibot'

import { createPublicError } from '@/infra/server/publicErrors/index.ts'
import { requestJson } from '@/infra/server/requestJson/index.ts'

type BackendData = { message: string }

export async function readBackend(id: string): Promise<BackendData> {
  'use server'
  const data = await requestJson({
    url: `http://127.0.0.1:4318/data?id=${encodeURIComponent(id)}`,
    schema: v.object({ message: v.string() })
  })
  if (id.startsWith('public:')) throw createPublicError()
  // Exercitam a política global sem depender do catch do transporte. Os
  // detalhes sintéticos nascem no backend somente após o build.
  if (id.startsWith('throw:') || id.startsWith('result:')) {
    const error = Object.assign(
      new Error(data.message, { cause: `CAUSE_${data.message}` }),
      {
        internalContext: `CONTEXT_${data.message}`
      }
    )
    if (id.startsWith('throw:')) throw error
    const invalidResult = { message: 'Resultado inválido', error }
    return invalidResult
  }
  return data
}
