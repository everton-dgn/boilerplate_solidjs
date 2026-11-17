function blocked(): never {
  throw new Error('blocked')
}

// afterEach runs before onTestFinished, so the test restores the access before
// its own teardown; the registration below is only the safety net.
export function blockCookie(): () => void {
  const original = Object.getOwnPropertyDescriptor(document, 'cookie')
  let isActive = true

  Object.defineProperty(document, 'cookie', {
    configurable: true,
    get: blocked,
    set: blocked
  })

  const restore = (): void => {
    if (!isActive) return
    isActive = false
    if (original) {
      Object.defineProperty(document, 'cookie', original)
      return
    }
    Reflect.deleteProperty(document, 'cookie')
  }

  onTestFinished(restore)

  return restore
}
