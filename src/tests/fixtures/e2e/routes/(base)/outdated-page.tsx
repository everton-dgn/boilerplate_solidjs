import {
  query,
  useBeforeLeave,
  useSearchParams,
  type RouteDefinition
} from '@solidjs/router'
import {
  createMemo,
  createSignal,
  Errored,
  Loading,
  onSettled,
  Show
} from 'solid-js'

import { LocalizedLink } from '@/components/atoms/LocalizedLink/index.tsx'
import { registerUnsavedChanges } from '@/primitives/createOutdatedPageGuard/index.ts'

import { requestFixtureNote } from '../../outdated-page/requestFixtureNote/index.ts'

const getNote = query(requestFixtureNote, 'outdated-page-note')

type NoteProps = { id: string }

function isUnknownFunction(error: unknown): boolean {
  return (
    error instanceof Error &&
    'unknownFunction' in error &&
    error.unknownFunction === true
  )
}

function RenderedNote(props: NoteProps) {
  const note = createMemo(() => getNote(props.id))
  return <p>{note().message}</p>
}

export const route = {
  info: {
    seo: { title: 'Outdated page', noindex: true },
    llms: { optional: true }
  }
} satisfies RouteDefinition

export default function OutdatedPage() {
  const [params] = useSearchParams()
  const [status, setStatus] = createSignal('Nothing sent')
  const [isLocalReadRequested, setIsLocalReadRequested] = createSignal(false)
  const [isRootReadRequested, setIsRootReadRequested] = createSignal(false)
  const [draft, setDraft] = createSignal('')

  // Draft guard in the router pattern: it only asks with !defaultPrevented, which
  // is why the page also registers the check in the version guard.
  onSettled(() => registerUnsavedChanges(() => draft() !== ''))
  useBeforeLeave(event => {
    if (event.defaultPrevented || draft() === '') return
    event.preventDefault()
    setStatus('Leave blocked')
  })

  async function send(): Promise<void> {
    try {
      const note = await requestFixtureNote(String(params.id))
      setStatus(note.message)
    } catch (error) {
      setStatus(
        isUnknownFunction(error) ? 'Unknown function' : 'Submission failed'
      )
    }
  }

  return (
    <main>
      <h1>Outdated page</h1>
      <label>
        Draft
        <textarea
          name="draft"
          value={draft()}
          onInput={event => setDraft(event.currentTarget.value)}
        />
      </label>
      <LocalizedLink href="/about">Go to About</LocalizedLink>
      {/* The About CSS already comes in the document; the UI kit one does not. */}
      <LocalizedLink href="/ui-kit">Go to UI kit</LocalizedLink>
      <p>{status()}</p>
      <button type="button" onClick={send}>
        Send note
      </button>
      <button type="button" onClick={() => setIsLocalReadRequested(true)}>
        Read note
      </button>
      <button type="button" onClick={() => setIsRootReadRequested(true)}>
        Read note without a local boundary
      </button>
      {/* The memo is created and read inside the local Errored, which contains the
          rejection without unmounting the Provider: an unwanted notice would show
          next to the fallback. */}
      <Show when={isLocalReadRequested()}>
        <Errored fallback={<p>Read refused</p>}>
          <Loading fallback={<p>Loading note...</p>}>
            <RenderedNote id={String(params.id)} />
          </Loading>
        </Errored>
      </Show>
      {/* Without a local boundary, the rejection reaches the root Errored. */}
      <Show when={isRootReadRequested()}>
        <Loading fallback={<p>Loading note...</p>}>
          <RenderedNote id={String(params.id)} />
        </Loading>
      </Show>
    </main>
  )
}
