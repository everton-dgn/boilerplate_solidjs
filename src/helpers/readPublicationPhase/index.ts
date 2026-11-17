import {
  PUBLICATION_PHASE_ENV,
  PUBLICATION_PRERENDER_PHASE
} from '@/constants/publication.ts'

type PublicationPhase = 'direct' | 'prerender' | 'artifact'

// The build sets the signal in the environment of the prerender worker. A request
// does not reach that value, unlike the public `x-nitro-prerender` header.
export function readPublicationPhase(): PublicationPhase {
  if (!import.meta.env.PROD) return 'direct'
  // oxlint-disable-next-line node/no-process-env -- The prerender worker only receives the phase through the process environment.
  return process.env[PUBLICATION_PHASE_ENV] === PUBLICATION_PRERENDER_PHASE
    ? 'prerender'
    : 'artifact'
}
