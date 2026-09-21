type Render = () => string

type MemoizeOnceOptions = {
  render: Render
  enabled: boolean
}

// O manifesto e a URL do site são fixos no build, então em produção o texto é
// renderizado uma vez por processo. Desabilitado, devolve o render sem cache,
// como em desenvolvimento, onde o manifesto muda.
export function memoizeOnce({ render, enabled }: MemoizeOnceOptions): Render {
  if (!enabled) return render
  let text: string | undefined
  return () => {
    text ??= render()
    return text
  }
}
