import { endpoint } from 'virtual:solid-server-function-handler'

import type { RobotsGroup } from './types.ts'

// Robots that collect content to train models. Search engines and the agents that
// read pages at the request of the user (ChatGPT-User, Claude-User,
// OAI-SearchBot, PerplexityBot) stay allowed, because they are the audience of
// llms.txt.
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

// The server function endpoint is not a page to crawl.
export const ROBOTS_GROUPS: readonly RobotsGroup[] = [
  { userAgents: ['*'], allow: ['/'], disallow: [endpoint] },
  { userAgents: AI_TRAINING_BOTS, disallow: ['/'] }
]
