import type { RobotsGroup } from './types.ts'

// Endpoint das server functions (`serverFunctions.endpoint` do
// @solidjs/vite-plugin). Não é página e não deve gastar rastreio.
const SERVER_FUNCTIONS_PATH = '/_server'

// Robôs que coletam conteúdo para treinar modelos. Ficam liberados os
// buscadores e os agentes que leem páginas a pedido do usuário (ChatGPT-User,
// Claude-User, OAI-SearchBot, PerplexityBot), que são o público do llms.txt.
const AI_TRAINING_BOTS: readonly string[] = [
  'GPTBot',
  'ClaudeBot',
  'anthropic-ai',
  'CCBot',
  'Google-Extended',
  'Applebot-Extended',
  'meta-externalagent',
  'Bytespider'
]

// Grupos publicados nesta ordem. O robots.txt é um pedido: robôs mal
// comportados o ignoram, e `Disallow` não tira uma URL do índice nem deixa o
// robô ler a meta `noindex`; para não indexar uma página, use `noindex` em
// `route.info.seo`.
export const ROBOTS_GROUPS: readonly RobotsGroup[] = [
  { userAgents: ['*'], allow: ['/'], disallow: [SERVER_FUNCTIONS_PATH] },
  { userAgents: AI_TRAINING_BOTS, disallow: ['/'] }
]
