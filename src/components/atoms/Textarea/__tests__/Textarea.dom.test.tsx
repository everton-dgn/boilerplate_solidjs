import { createSignal, untrack } from 'solid-js'

import { renderComponent } from '@/tests/providers/renderComponent/index.tsx'

import { Textarea } from '../index.tsx'

describe('campo de texto multilinha', () => {
  it('preserva valor inicial, ref e atributos de formulário', () => {
    const ref = vi.fn<(element: HTMLTextAreaElement) => void>()
    const host = renderComponent(() => (
      <Textarea
        ref={ref}
        name="message"
        defaultValue={'First line\nSecond line'}
        required
        rows={4}
        aria-label="Mensagem"
        aria-describedby="message-help"
      />
    ))
    const textarea = host.querySelector('textarea')
    assert(textarea)
    expect(ref).toHaveBeenCalledWith(textarea)
    expect(textarea).toHaveValue('First line\nSecond line')
    expect({
      required: textarea.required,
      name: textarea.name,
      rows: textarea.getAttribute('rows'),
      description: textarea.getAttribute('aria-describedby')
    }).toStrictEqual({
      required: true,
      name: 'message',
      rows: '4',
      description: 'message-help'
    })
  })

  it('mantém o valor controlado e o estado de erro reativos', async () => {
    const [value, setValue] = createSignal('initial')
    const [invalid, setInvalid] = createSignal(true)
    const host = renderComponent(() => (
      <Textarea
        value={value()}
        variant={invalid() ? 'destructive' : 'default'}
        onInput={event => setValue(event.currentTarget.value)}
      />
    ))
    const textarea = host.querySelector('textarea')
    assert(textarea)
    expect(textarea).toHaveAttribute('aria-invalid', 'true')
    textarea.value = 'edited\ntext'
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    await expect.poll(() => untrack(value)).toBe('edited\ntext')
    setInvalid(false)
    setValue('replaced')
    await expect.poll(() => textarea.value).toBe('replaced')
    expect(textarea).not.toHaveAttribute('aria-invalid')
  })
})
