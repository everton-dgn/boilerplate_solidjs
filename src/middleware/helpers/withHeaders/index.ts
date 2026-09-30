type HeaderUpdate = { response: Response; headers: Record<string, string> }

// Uma resposta sem corpo e com headers imutáveis, como Response.redirect(), vai
// numa cópia com o mesmo status e os mesmos headers. Com corpo, ela é o retorno
// cru de fetch(), que carrega dados e headers upstream; o erro segue para a
// contenção.
export function withHeaders({ response, headers }: HeaderUpdate): Response {
  try {
    for (const [name, value] of Object.entries(headers)) {
      response.headers.set(name, value)
    }
    return response
  } catch (error) {
    if (response.body !== null) throw error
    const copy = new Response(null, response)
    for (const [name, value] of Object.entries(headers)) {
      copy.headers.set(name, value)
    }
    return copy
  }
}
