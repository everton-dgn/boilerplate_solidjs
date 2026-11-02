import {
  PUBLICATION_PHASE_ENV,
  PUBLICATION_PRERENDER_PHASE
} from '@/constants/publication.ts'

type PublicationPhase = 'direct' | 'prerender' | 'artifact'

// O build define o sinal no ambiente do worker de prerender. Uma requisição não
// alcança esse valor, ao contrário do header público `x-nitro-prerender`.
export function readPublicationPhase(): PublicationPhase {
  if (!import.meta.env.PROD) return 'direct'
  // oxlint-disable-next-line node/no-process-env -- O worker do prerender só recebe a fase pelo ambiente do processo.
  return process.env[PUBLICATION_PHASE_ENV] === PUBLICATION_PRERENDER_PHASE
    ? 'prerender'
    : 'artifact'
}
