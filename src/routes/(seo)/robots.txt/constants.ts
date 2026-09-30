import { endpoint } from 'virtual:solid-server-function-handler'

import type { RobotsGroup } from './types.ts'

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
// `route.info.seo`. O endpoint das server functions vem do módulo virtual do
// @solidjs/vite-plugin, com `serverFunctions.endpoint` e o `base` do Vite já
// aplicados: não é página e não deve gastar rastreio. O módulo só resolve no
// servidor, e esta rota de API não entra no bundle do cliente.
export const ROBOTS_GROUPS: readonly RobotsGroup[] = [
  { userAgents: ['*'], allow: ['/'], disallow: [endpoint] },
  { userAgents: AI_TRAINING_BOTS, disallow: ['/'] }
]
