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

// O endpoint das server functions não é uma página para rastrear.
export const ROBOTS_GROUPS: readonly RobotsGroup[] = [
  { userAgents: ['*'], allow: ['/'], disallow: [endpoint] },
  { userAgents: AI_TRAINING_BOTS, disallow: ['/'] }
]
