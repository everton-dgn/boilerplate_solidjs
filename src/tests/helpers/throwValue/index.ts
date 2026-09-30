// Lança o valor recebido, inclusive valores que não são Error, numa expressão.
export function throwValue(value: unknown): never {
  throw value
}
