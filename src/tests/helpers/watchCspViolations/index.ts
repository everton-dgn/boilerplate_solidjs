import type { Page } from '@playwright/test'

const CSP_MESSAGE =
  /securitypolicyviolation|Refused to|Content Security Policy/u
const REPORTER = '__reportCspViolation'

// Roda antes dos scripts da página e fora da CSP dela: repassa ao teste, pela
// função exposta, as violações que o navegador reporta.
function reportViolations(reporter: string): void {
  document.addEventListener('securitypolicyviolation', event => {
    const report: unknown = Reflect.get(globalThis, reporter)
    if (typeof report === 'function') {
      Reflect.apply(report, undefined, [
        `securitypolicyviolation ${event.violatedDirective} ${event.blockedURI}`
      ])
    }
  })
}

// Coleta as violações de CSP da página, pelo evento e pelas mensagens que o
// Chromium grava no console. Chame antes de navegar.
export async function watchCspViolations(page: Page): Promise<string[]> {
  const violations: string[] = []
  await page.exposeFunction(REPORTER, (text: string) => {
    violations.push(text)
  })
  await page.addInitScript(reportViolations, REPORTER)
  page.on('console', message => {
    if (CSP_MESSAGE.test(message.text())) violations.push(message.text())
  })
  return violations
}
