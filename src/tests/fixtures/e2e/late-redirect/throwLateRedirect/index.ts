import { redirect } from '@solidjs/web'

const REDIRECT_DELAY_MS = 150

// Redirect decidido depois do envio do shell: o atraso mantém o Loading
// pendente, e o runtime só pode seguir o Location pelo script de fallback.
export async function throwLateRedirect(): Promise<never> {
  'use server'
  // oxlint-disable-next-line promise/avoid-new -- Adapta o timer da fixture para suspender o SSR.
  await new Promise(resolve => {
    setTimeout(resolve, REDIRECT_DELAY_MS)
  })
  // oxlint-disable-next-line typescript/only-throw-error -- O Solid usa Response como sinal de redirecionamento.
  throw redirect('/?from=late-redirect')
}
