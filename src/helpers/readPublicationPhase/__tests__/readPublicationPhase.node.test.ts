import {
  PUBLICATION_PHASE_ENV,
  PUBLICATION_PRERENDER_PHASE
} from '@/constants/publication.ts'

import { readPublicationPhase } from '../index.ts'

describe('fase de publicação', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('gera direto fora do build de produção', () => {
    vi.stubEnv('PROD', false)
    vi.stubEnv(PUBLICATION_PHASE_ENV, PUBLICATION_PRERENDER_PHASE)
    expect(readPublicationPhase()).toBe('direct')
  })

  it('só reconhece o prerender pelo ambiente do processo', () => {
    vi.stubEnv('PROD', true)
    vi.stubEnv(PUBLICATION_PHASE_ENV, PUBLICATION_PRERENDER_PHASE)
    expect(readPublicationPhase()).toBe('prerender')
    vi.stubEnv(PUBLICATION_PHASE_ENV, 'other')
    expect(readPublicationPhase()).toBe('artifact')
  })
})
