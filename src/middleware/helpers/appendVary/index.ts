type AppendVaryOptions = { response: Response; field: string }

// Preserva os campos existentes; `*` já cobre qualquer cabeçalho.
export function appendVary({ response, field }: AppendVaryOptions): Response {
  const vary = response.headers.get('vary')
  const fields = vary?.split(',').map(entry => entry.trim().toLowerCase()) ?? []
  if (!fields.includes('*') && !fields.includes(field.toLowerCase())) {
    response.headers.set('vary', vary ? `${vary}, ${field}` : field)
  }
  return response
}
