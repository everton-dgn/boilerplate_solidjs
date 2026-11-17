import { expectTypeOf } from 'vite-plus/test'

import type { createSeo } from '../index.ts'

type Options = Parameters<typeof createSeo>[0]
type RouteOptions = { route: true }
type DataOptions = { structuredData: () => undefined }
type BothOptions = RouteOptions & DataOptions

describe('exclusive contract of createSeo', () => {
  it('accepts exactly one mode without running the primitive outside an owner', () => {
    expectTypeOf<RouteOptions>().toExtend<Options>()
    expectTypeOf<DataOptions>().toExtend<Options>()
    expectTypeOf<BothOptions>().not.toExtend<Options>()
    expectTypeOf<Record<string, never>>().not.toExtend<Options>()
  })
})
