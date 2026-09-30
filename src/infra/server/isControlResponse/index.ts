import 'server-only'

// Uma Response sem corpo é o sinal de controle do framework (redirect ou
// reload); uma com corpo pode carregar dados upstream. A de Response.error()
// também não tem corpo, mas o status 0 não sai como resposta HTTP. O middleware,
// o hook de erros e o wrapper de operações usam esta mesma classificação.
export function isControlResponse(value: unknown): value is Response {
  try {
    return (
      value instanceof Response && value.body === null && value.status !== 0
    )
  } catch {
    // A inspeção de um objeto lançado também pode falhar (getter ou Proxy).
    return false
  }
}
