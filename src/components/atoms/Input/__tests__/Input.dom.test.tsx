import { createSignal, flush } from 'solid-js'

import { renderComponent } from '@/tests/providers/renderComponent/index.tsx'

import { Input } from '../index.tsx'

describe('input field', () => {
  it('keeps the ref, the native attributes and the link to the error message', () => {
    const ref = vi.fn<(element: HTMLInputElement) => void>()
    const onInput = vi.fn<() => void>()
    const host = renderComponent(() => (
      <Input
        ref={ref}
        type="email"
        name="email"
        required
        autocomplete="email"
        aria-label="E-mail"
        aria-describedby="email-error"
        variant="destructive"
        onInput={onInput}
      />
    ))
    const input = host.querySelector('input')
    assert(input)
    expect(ref).toHaveBeenCalledWith(input)
    expect({
      type: input.type,
      name: input.name,
      required: input.required,
      autocomplete: input.autocomplete,
      description: input.getAttribute('aria-describedby')
    }).toStrictEqual({
      type: 'email',
      name: 'email',
      required: true,
      autocomplete: 'email',
      description: 'email-error'
    })
    expect(input).toHaveAttribute('aria-invalid', 'true')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    expect(onInput).toHaveBeenCalledOnce()
  })

  it('keeps what the user typed or checked without control when the variant changes', () => {
    const [isInvalid, setIsInvalid] = createSignal(false)
    const variant = () => (isInvalid() ? 'destructive' : 'default')
    const host = renderComponent(() => (
      <>
        <Input defaultValue="Ada" variant={variant()} />
        <Input type="checkbox" defaultChecked variant={variant()} />
      </>
    ))
    const [text, checkbox] = host.querySelectorAll('input')
    assert(text && checkbox)
    text.value = 'Grace'
    text.dispatchEvent(new Event('input', { bubbles: true }))
    checkbox.click()
    setIsInvalid(true)
    flush()
    expect(text).toHaveAttribute('aria-invalid', 'true')
    expect(text).toHaveValue('Grace')
    expect(checkbox).not.toBeChecked()
  })

  it('updates the value, disabled and the error state without recreating the field', async () => {
    const [isInvalid, setIsInvalid] = createSignal(true)
    const [value, setValue] = createSignal('first')
    const host = renderComponent(() => (
      <Input
        value={value()}
        disabled={isInvalid()}
        variant={isInvalid() ? 'destructive' : 'default'}
      />
    ))
    const input = host.querySelector('input')
    expect(input).toBeDisabled()
    setIsInvalid(false)
    setValue('second')
    await expect.poll(() => input?.value).toBe('second')
    expect(input).not.toBeDisabled()
    expect(input).not.toHaveAttribute('aria-invalid')
    expect(host.querySelector('input')).toBe(input)
  })
})
