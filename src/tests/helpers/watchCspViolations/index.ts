import type { Page } from '@playwright/test'

const CSP_MESSAGE =
  /securitypolicyviolation|Refused to|Content Security Policy/u
const REPORTER = '__reportCspViolation'

// Runs before the scripts of the page and outside its CSP: passes to the test,
// through the exposed function, the violations that the browser reports.
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

// Collects the CSP violations of the page, through the event and the messages
// that Chromium writes to the console. Call it before navigating.
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
