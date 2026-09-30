// O marcador sintético nasce no backend após o build e ocupa a mensagem, o
// cause e uma propriedade própria, como no cenário throw da readBackend.
export function fixtureError(marker: string): Error {
  return Object.assign(new Error(marker, { cause: `CAUSE_${marker}` }), {
    internalContext: `CONTEXT_${marker}`
  })
}
