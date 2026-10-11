// Grupos específicos substituem o de * por completo, sem herdar suas regras.
export type RobotsGroup = {
  userAgents: readonly string[]
  allow?: readonly string[]
  disallow?: readonly string[]
}
