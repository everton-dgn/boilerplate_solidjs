import { respond } from '@solidjs/web'
import * as v from 'valibot'

import { requestJson } from '@/infra/server/requestJson/index.ts'

// Envelope lançado numa chamada direta durante o SSR. O runtime informa esse
// throw ao hook de erros, que precisa deixá-lo com a política padrão. O valor
// leva o marcador privado do backend sintético, para que o teardown recuse
// qualquer log que registre o valor original.
export async function throwEnvelope(id: string): Promise<never> {
  'use server'
  const data = await requestJson({
    url: `http://127.0.0.1:4318/data?id=${encodeURIComponent(id)}`,
    schema: v.object({ message: v.string() })
  })
  // oxlint-disable-next-line typescript/only-throw-error -- O Solid usa ResponseEnvelope como sinal de controle.
  throw respond({ message: data.message }, { status: 409 })
}
