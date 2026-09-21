type LlmsRouteOptions = {
  section?: string
  optional?: boolean
}

// `true` inclui a página preservando seção e marcação opcional herdadas (sem
// herança, a seção padrão); `false` a exclui, inclusive quando o layout a
// incluiu; o objeto inclui e sobrescreve só os campos declarados.
export type LlmsRouteInfo = boolean | LlmsRouteOptions

export type LlmsPage = {
  path: string
  title: string
  description: string
  section: string
  optional: boolean
}
