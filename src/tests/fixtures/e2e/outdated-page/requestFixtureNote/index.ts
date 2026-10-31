import * as v from 'valibot'

import { requestJson } from '@/infra/server/requestJson/index.ts'

type FixtureNote = { message: string }

// O backend sintético conta as execuções por id: uma chamada recusada pelo
// carimbo de build precisa manter a contagem.
export async function requestFixtureNote(id: string): Promise<FixtureNote> {
  'use server'
  return requestJson({
    url: `http://127.0.0.1:4318/data?id=${encodeURIComponent(id)}`,
    schema: v.object({ message: v.string() })
  })
}
