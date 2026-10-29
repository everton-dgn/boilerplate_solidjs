type MemoizeOnceOptions<Value> = {
  render: () => Value
  isEnabled: boolean
}

export function memoizeOnce<Value>({
  render,
  isEnabled
}: MemoizeOnceOptions<Value>): () => Value {
  if (!isEnabled) return render
  let cache: { value: Value } | undefined
  return () => {
    cache ??= { value: render() }
    return cache.value
  }
}
