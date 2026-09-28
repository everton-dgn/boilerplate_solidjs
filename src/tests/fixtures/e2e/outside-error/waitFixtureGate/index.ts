import * as v from 'valibot'

import { requestJson } from '@/infra/server/requestJson/index.ts'

type GateData = { ready: boolean }

// Espera o teste liberar o id no backend sintético. A falha da fixture só
// acontece depois, sem depender de temporizador para cair após o shell.
export async function waitFixtureGate(id: string): Promise<GateData> {
  'use server'
  return requestJson({
    url: `http://127.0.0.1:4318/gate?id=${encodeURIComponent(id)}`,
    schema: v.object({ ready: v.boolean() })
  })
}
