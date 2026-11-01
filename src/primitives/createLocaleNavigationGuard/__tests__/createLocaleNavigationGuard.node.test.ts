import { createLocaleNavigationGuard } from '../index.ts'

describe('locale navigation guard on the server', () => {
  it('does not require a Router or browser globals during SSR', () => {
    expect(() => createLocaleNavigationGuard()).not.toThrow()
  })
})
