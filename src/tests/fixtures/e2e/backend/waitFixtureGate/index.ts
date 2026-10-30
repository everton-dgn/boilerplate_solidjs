import * as v from 'valibot'

import { requestJson } from '@/infra/server/requestJson/index.ts'

type GateData = { ready: boolean }
type GateRequest = { id: string; real: boolean }

// Espera o teste liberar o id no backend sintético. A falha da fixture só
// acontece depois, sem depender de temporizador para cair após o shell. real
// informa ao backend, sem o valor, que a falha levará o marcador carregado.
export async function waitFixtureGate({
  id,
  real
}: GateRequest): Promise<GateData> {
  'use server'
  const query = new URLSearchParams({ id, real: real ? '1' : '0' })
  return requestJson({
    url: `http://127.0.0.1:4318/gate?${query}`,
    schema: v.object({ ready: v.boolean() })
  })
}
