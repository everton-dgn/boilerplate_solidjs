// Um grupo do robots.txt: os user-agents cobertos e as regras aplicadas a
// eles. Um robô obedece só ao grupo mais específico para o seu nome, então um
// grupo dedicado substitui o de `*` por completo, sem herdar nada dele.
export type RobotsGroup = {
  userAgents: readonly string[]
  allow?: readonly string[]
  disallow?: readonly string[]
}
