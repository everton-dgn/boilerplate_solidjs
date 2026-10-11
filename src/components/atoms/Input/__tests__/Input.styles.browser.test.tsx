import { Textarea } from '@/components/atoms/Textarea/index.tsx'
import { renderComponent } from '@/tests/providers/renderComponent/index.tsx'

import '@/theme/globalStyles.css'

import { Input } from '../index.tsx'

describe('shared input and textarea styles', () => {
  it('preserves the distinct dimensions and textarea resizing', () => {
    const host = renderComponent(
      () => (
        <>
          <Input />
          <Textarea />
        </>
      ),
      { providers: false }
    )
    const input = host.querySelector('input')
    const textarea = host.querySelector('textarea')
    assert(input && textarea)
    expect(getComputedStyle(input)).toMatchObject({
      boxSizing: 'border-box',
      height: '36px',
      padding: '6px 12px',
      fontSize: '14px'
    })
    expect(getComputedStyle(textarea)).toMatchObject({
      boxSizing: 'border-box',
      minHeight: '80px',
      padding: '8px 12px',
      fontSize: '14px',
      resize: 'vertical'
    })
  })

  it.each([
    ['input', Input],
    ['textarea', Textarea]
  ] as const)('preserves %s border and focus precedence', (tag, Field) => {
    const host = renderComponent(
      () => (
        <>
          <Field placeholder="Default" />
          <Field variant="destructive" aria-invalid="false" />
          <Field aria-invalid="true" />
        </>
      ),
      { providers: false }
    )
    const [normal, destructive, invalid] = host.querySelectorAll(tag)
    assert(normal && destructive && invalid)
    const normalBorder = getComputedStyle(normal).borderTopColor
    const destructiveBorder = getComputedStyle(destructive).borderTopColor
    expect(destructiveBorder).not.toBe(normalBorder)
    expect(getComputedStyle(invalid).borderTopColor).toBe(destructiveBorder)
    normal.focus()
    const normalRing = getComputedStyle(normal).boxShadow
    expect({
      isFocusVisible: normal.matches(':focus-visible'),
      hasFocusRing: normalRing.includes('0px 0px 0px 3px')
    }).toStrictEqual({
      isFocusVisible: true,
      hasFocusRing: true
    })
    destructive.focus()
    expect({
      isFocusVisible: destructive.matches(':focus-visible'),
      shadow: getComputedStyle(destructive).boxShadow
    }).toStrictEqual({
      isFocusVisible: true,
      shadow: `${destructiveBorder} 0px 0px 0px 3px`
    })
    expect(getComputedStyle(destructive).boxShadow).not.toBe(normalRing)
  })

  it('preserves disabled and placeholder styles in both fields', () => {
    const host = renderComponent(
      () => (
        <>
          <Input disabled placeholder="Name" />
          <Textarea disabled placeholder="Message" />
        </>
      ),
      { providers: false }
    )
    const input = host.querySelector('input')
    const textarea = host.querySelector('textarea')
    assert(input && textarea)
    expect(getComputedStyle(input)).toMatchObject({
      cursor: 'not-allowed',
      opacity: '0.5'
    })
    expect(getComputedStyle(textarea)).toMatchObject({
      cursor: 'not-allowed',
      opacity: '0.5'
    })
    expect(getComputedStyle(input, '::placeholder').color).toBe(
      getComputedStyle(textarea, '::placeholder').color
    )
  })
})
