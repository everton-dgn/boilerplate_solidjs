function blocked(): never {
  throw new Error('blocked')
}

// afterEach roda antes de onTestFinished, então o teste restaura o acesso antes
// do próprio teardown; o registro abaixo é só a rede de segurança.
export function blockCookie(): () => void {
  const original = Object.getOwnPropertyDescriptor(document, 'cookie')
  let active = true

  Object.defineProperty(document, 'cookie', {
    configurable: true,
    get: blocked,
    set: blocked
  })

  const restore = (): void => {
    if (!active) return
    active = false
    if (original) {
      Object.defineProperty(document, 'cookie', original)
      return
    }
    Reflect.deleteProperty(document, 'cookie')
  }

  onTestFinished(restore)

  return restore
}
