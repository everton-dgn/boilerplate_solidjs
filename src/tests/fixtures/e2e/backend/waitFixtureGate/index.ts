import * as v from 'valibot'

import { requestJson } from '@/infra/server/requestJson/index.ts'

type GateData = { ready: boolean }
type GateRequest = { id: string; real: boolean }

// Waits for the test to release the id in the synthetic backend. The fixture
// failure only happens afterwards, without relying on a timer to land after the
// shell. real tells the backend, without the value, that the failure will carry
// the loaded marker.
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
