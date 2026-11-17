import * as v from 'valibot'

import { requestJson } from '@/infra/server/requestJson/index.ts'

type FixtureNote = { message: string }

// The synthetic backend counts the runs per id: a call refused by the build stamp
// must keep the count.
export async function requestFixtureNote(id: string): Promise<FixtureNote> {
  'use server'
  return requestJson({
    url: `http://127.0.0.1:4318/data?id=${encodeURIComponent(id)}`,
    schema: v.object({ message: v.string() })
  })
}
