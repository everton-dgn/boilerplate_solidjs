// Throws the received value, including values that are not Errors, in an expression.
export function throwValue(value: unknown): never {
  throw value
}

// Object whose inspection throws: a property read and instanceof fail with a
// private marker that must never reach a response or the log.
export function hostileValue(): object {
  return new Proxy(
    {},
    {
      get: () => throwValue(new Error('PRIVATE_GET')),
      getPrototypeOf: () => throwValue(new Error('PRIVATE_PROTOTYPE'))
    }
  )
}
