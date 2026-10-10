import { useSearchParams, type RouteDefinition } from '@solidjs/router'
import { createSignal } from 'solid-js'

import { Button } from '@/components/atoms/Button/index.tsx'
import { Input } from '@/components/atoms/Input/index.tsx'
import { LocalizedLink } from '@/components/atoms/LocalizedLink/index.tsx'
import { Textarea } from '@/components/atoms/Textarea/index.tsx'
import { useToast } from '@/components/atoms/ToastProvider/useToast/index.ts'
import { Dialog } from '@/components/molecules/Dialog/index.tsx'
import { createLocalizedNavigate } from '@/primitives/createLocalizedNavigate/index.ts'

import S from './styles.module.css'

export const route = {
  info: { seo: { noindex: true } }
} satisfies RouteDefinition

export default function UiKit() {
  const [params] = useSearchParams()
  const [open, setOpen] = createSignal(params.open === '1')
  const [submitted, setSubmitted] = createSignal(false)
  const toast = useToast()
  const navigate = createLocalizedNavigate()
  let notification: ReturnType<typeof toast.show> | undefined
  return (
    <main class={S.page}>
      <h1>UI fixture</h1>
      <nav aria-label="Fixture navigation" class={S.actions}>
        <LocalizedLink href="?source=link#target">Localized page</LocalizedLink>
        <LocalizedLink href="/ui-kit?source=language#target" locale="es">
          Spanish page
        </LocalizedLink>
        <LocalizedLink href="/robots.txt" localize={false}>
          Robots file
        </LocalizedLink>
        <Button onClick={() => navigate({ href: '?source=navigate#target' })}>
          Navigate page
        </Button>
        <Button
          onClick={() =>
            navigate({ href: '/ui-kit?source=replace', replace: true })
          }
        >
          Replace page
        </Button>
      </nav>
      <form
        class={S.form}
        onSubmit={event => {
          event.preventDefault()
          setSubmitted(true)
        }}
      >
        <label for="fixture-name">Name</label>
        <Input id="fixture-name" name="name" required defaultValue="Ada" />
        <label for="fixture-subscribe">Subscribe</label>
        <Input
          id="fixture-subscribe"
          name="subscribe"
          type="checkbox"
          defaultChecked
        />
        <label for="fixture-message">Message</label>
        <Textarea
          id="fixture-message"
          name="message"
          defaultValue={'First line\nSecond line'}
        />
        <Button type="submit">Submit form</Button>
        <Button type="reset">Reset form</Button>
        <output>{submitted() ? 'Submitted' : 'Pending'}</output>
      </form>
      <div class={S.actions}>
        <Button onClick={() => setOpen(true)}>Open dialog</Button>
        <Button
          onClick={() => {
            notification = toast.show({
              message: 'Saving fixture',
              variant: 'loading'
            })
          }}
        >
          Show notification
        </Button>
        <Button
          onClick={() => {
            if (notification !== undefined) {
              toast.update({
                id: notification,
                message: 'Fixture saved',
                variant: 'success',
                duration: 0
              })
            }
          }}
        >
          Update notification
        </Button>
        <Button
          onClick={() => {
            toast.show({
              message: '<strong>Plain text</strong>',
              variant: 'error',
              duration: 0
            })
          }}
        >
          Show error
        </Button>
      </div>
      <Dialog
        open={open()}
        onOpenChange={setOpen}
        title="Fixture dialog"
        description="Dialog description"
      >
        <label for="dialog-name">Dialog name</label>
        <Input id="dialog-name" />
        <Button onClick={() => setOpen(false)}>Close from content</Button>
      </Dialog>
      <p id="target">Navigation target</p>
    </main>
  )
}
