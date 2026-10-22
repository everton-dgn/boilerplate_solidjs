import { createSignal, flush } from 'solid-js'

import { renderComponent } from '@/tests/providers/renderComponent/index.tsx'

import { Input } from '../index.tsx'

describe('campo de entrada', () => {
  it('preserva ref, atributos nativos e o vínculo com a mensagem de erro', () => {
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

  it('preserva o que o usuário digitou ou marcou sem controle quando a variante muda', () => {
    const [invalid, setInvalid] = createSignal(false)
    const variant = () => (invalid() ? 'destructive' : 'default')
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
    setInvalid(true)
    flush()
    expect(text).toHaveAttribute('aria-invalid', 'true')
    expect(text).toHaveValue('Grace')
    expect(checkbox).not.toBeChecked()
  })

  it('atualiza valor, disabled e estado de erro sem recriar o campo', async () => {
    const [invalid, setInvalid] = createSignal(true)
    const [value, setValue] = createSignal('first')
    const host = renderComponent(() => (
      <Input
        value={value()}
        disabled={invalid()}
        variant={invalid() ? 'destructive' : 'default'}
      />
    ))
    const input = host.querySelector('input')
    expect(input).toBeDisabled()
    setInvalid(false)
    setValue('second')
    await expect.poll(() => input?.value).toBe('second')
    expect(input).not.toBeDisabled()
    expect(input).not.toHaveAttribute('aria-invalid')
    expect(host.querySelector('input')).toBe(input)
  })
})
