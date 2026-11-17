import { respond } from '@solidjs/web'
import * as v from 'valibot'

import { requestJson } from '@/infra/server/requestJson/index.ts'

// Envelope thrown in a direct call during the SSR. The runtime reports that throw
// to the error hook, which must leave it to the default policy. The value carries
// the private marker of the synthetic backend, so the teardown refuses any log
// that records the original value.
export async function throwEnvelope(id: string): Promise<never> {
  'use server'
  const data = await requestJson({
    url: `http://127.0.0.1:4318/data?id=${encodeURIComponent(id)}`,
    schema: v.object({ message: v.string() })
  })
  // oxlint-disable-next-line typescript/only-throw-error -- Solid uses ResponseEnvelope as a control signal.
  throw respond({ message: data.message }, { status: 409 })
}
