type LogRead = { heads: string[][]; leaks: string[] }
type LogSpy = (...data: unknown[]) => void

// Lines checked in each log: the fixed message and the class of an Error.
const LOG_HEAD_LINES = 2

// Summarizes the calls of a spied console.error: the first two lines of each call
// (the fixed message and, for an Error, the class) and the private markers found
// in any line, frames included. The test passes the spy because the backend policy
// only allows the console in test files.
export function readLog(spy: LogSpy): LogRead {
  const calls: unknown[][] = vi.mocked(spy).mock.calls
  return {
    heads: calls.map(([entry, ...rest]) =>
      typeof entry === 'string' && rest.length === 0
        ? entry.split('\n').slice(0, LOG_HEAD_LINES)
        : ['unexpected arguments']
    ),
    leaks: JSON.stringify(calls).match(/PRIVATE\w*/gu) ?? []
  }
}
