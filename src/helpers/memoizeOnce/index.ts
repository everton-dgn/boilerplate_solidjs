type MemoizeOnceOptions<Value> = {
  render: () => Value
  enabled: boolean
}

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
