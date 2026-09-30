// Lança o valor recebido, inclusive valores que não são Error, numa expressão.
export function throwValue(value: unknown): never {
  throw value
}

// Objeto cuja inspeção lança: leitura de propriedade e instanceof falham com
// um marcador privado que nunca deve chegar a uma resposta ou ao log.
export function hostileValue(): object {
  return new Proxy(
    {},
    {
      get: () => throwValue(new Error('PRIVATE_GET')),
      getPrototypeOf: () => throwValue(new Error('PRIVATE_PROTOTYPE'))
    }
  )
}
