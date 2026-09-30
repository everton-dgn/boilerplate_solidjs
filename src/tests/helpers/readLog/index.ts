type LogRead = { heads: string[][]; leaks: string[] }
type LogSpy = (...data: unknown[]) => void

// Linhas conferidas em cada log: a mensagem fixa e a classe de um Error.
const LOG_HEAD_LINES = 2

// Resume as chamadas de um console.error espionado: as duas primeiras linhas de
// cada chamada (a mensagem fixa e, para um Error, a classe) e os marcadores
// privados encontrados em qualquer linha, inclusive nos frames. O teste passa o
// spy porque a política de backend só libera o console em arquivos de teste.
export function readLog(spy: LogSpy): LogRead {
  const calls: unknown[][] = vi.mocked(spy).mock.calls
  return {
    heads: calls.map(([entry, ...rest]) =>
      typeof entry === 'string' && rest.length === 0
        ? entry.split('\n').slice(0, LOG_HEAD_LINES)
        : ['argumentos inesperados']
    ),
    leaks: JSON.stringify(calls).match(/PRIVATE\w*/gu) ?? []
  }
}
