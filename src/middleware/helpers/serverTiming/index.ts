type Timing = { response: Response; started: number }

// Acrescenta a métrica app sem apagar as que o runtime já gravou, como a do
// traceparent.
export function serverTiming({
  response,
  started
}: Timing): Record<string, string> {
  const metric = `app;dur=${(performance.now() - started).toFixed(1)}`
  const current = response.headers.get('server-timing')
  return { 'server-timing': current ? `${current}, ${metric}` : metric }
}
