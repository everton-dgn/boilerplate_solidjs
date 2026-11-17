import {
  PUBLICATION_PHASE_ENV,
  PUBLICATION_PRERENDER_PHASE
} from '@/constants/publication.ts'

import { readPublicationPhase } from '../index.ts'

describe('publication phase', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('generates directly outside the production build', () => {
    vi.stubEnv('PROD', false)
    vi.stubEnv(PUBLICATION_PHASE_ENV, PUBLICATION_PRERENDER_PHASE)
    expect(readPublicationPhase()).toBe('direct')
  })

  it('only recognizes the prerender through the process environment', () => {
    vi.stubEnv('PROD', true)
    vi.stubEnv(PUBLICATION_PHASE_ENV, PUBLICATION_PRERENDER_PHASE)
    expect(readPublicationPhase()).toBe('prerender')
    vi.stubEnv(PUBLICATION_PHASE_ENV, 'other')
    expect(readPublicationPhase()).toBe('artifact')
  })
})
