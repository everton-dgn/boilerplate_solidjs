type MemoizeOnceOptions<Value> = {
  render: () => Value
  enabled: boolean
}

// O manifesto e a URL do site são fixos no build, então em produção o valor é
// produzido uma vez por processo. Desabilitado, devolve o render sem cache,
// como em desenvolvimento, onde o manifesto muda. Uma falha não é guardada.
export function memoizeOnce<Value>({
  render,
  enabled
}: MemoizeOnceOptions<Value>): () => Value {
  if (!enabled) return render
  let cache: { value: Value } | undefined
  return () => {
    cache ??= { value: render() }
    return cache.value
  }
}
