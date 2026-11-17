import { isServer } from '@solidjs/web'

import { registerUnsavedChanges } from '../index.ts'

describe('change checks on the server', () => {
  it('neither registers nor runs the check during SSR', () => {
    expect(isServer).toBe(true)
    const check = vi.fn<() => boolean>(() => true)
    const add = vi.spyOn(Set.prototype, 'add')
    const remove = registerUnsavedChanges(check)
    const registrations = [...add.mock.calls]
    add.mockRestore()
    expect(registrations).toHaveLength(0)
    expect(() => {
      remove()
      remove()
    }).not.toThrow()
    expect(check).not.toHaveBeenCalled()
  })
})
