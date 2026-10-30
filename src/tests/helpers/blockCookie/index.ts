function blocked(): never {
  throw new Error('blocked')
}

export function blockCookie(): void {
  const original = Object.getOwnPropertyDescriptor(document, 'cookie')

  Object.defineProperty(document, 'cookie', {
    configurable: true,
    get: blocked,
    set: blocked
  })

  onTestFinished(() => {
    if (original) {
      Object.defineProperty(document, 'cookie', original)
      return
    }
    Reflect.deleteProperty(document, 'cookie')
  })
}
