import { respond } from '@solidjs/web'

// Envelope lançado numa chamada direta durante o SSR. O runtime informa esse
// throw ao hook de erros, que precisa deixá-lo com a política padrão.
export async function throwEnvelope(): Promise<never> {
  'use server'
  await Promise.resolve()
  // oxlint-disable-next-line typescript/only-throw-error -- O Solid usa ResponseEnvelope como sinal de controle.
  throw respond({ message: 'Envelope lançado' }, { status: 409 })
}
