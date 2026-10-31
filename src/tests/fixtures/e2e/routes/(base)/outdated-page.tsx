import { query, useSearchParams, type RouteDefinition } from '@solidjs/router'
import { createMemo, createSignal, Errored, Loading, Show } from 'solid-js'

import { LocalizedLink } from '@/components/atoms/LocalizedLink/index.tsx'

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
    seo: { title: 'Página desatualizada', noindex: true },
    llms: { optional: true }
  }
} satisfies RouteDefinition

export default function OutdatedPage() {
  const [params] = useSearchParams()
  const [status, setStatus] = createSignal('Nada enviado')
  const [isLocalReadRequested, setIsLocalReadRequested] = createSignal(false)
  const [isRootReadRequested, setIsRootReadRequested] = createSignal(false)

  async function send(): Promise<void> {
    try {
      const note = await requestFixtureNote(String(params.id))
      setStatus(note.message)
    } catch (error) {
      setStatus(
        isUnknownFunction(error) ? 'Função desconhecida' : 'Falha no envio'
      )
    }
  }

  return (
    <main>
      <h1>Página desatualizada</h1>
      <label>
        Rascunho
        <textarea name="draft" />
      </label>
      <LocalizedLink href="/about">Ir para Sobre</LocalizedLink>
      {/* O CSS de Sobre já vem no documento; o do UI kit, não. */}
      <LocalizedLink href="/ui-kit">Ir para UI kit</LocalizedLink>
      <p>{status()}</p>
      <button type="button" onClick={send}>
        Enviar nota
      </button>
      <button type="button" onClick={() => setIsLocalReadRequested(true)}>
        Ler nota
      </button>
      <button type="button" onClick={() => setIsRootReadRequested(true)}>
        Ler nota sem limite local
      </button>
      {/* A memo nasce e é lida dentro do Errored local, que contém a rejeição
          sem desmontar o Provider: um aviso indevido ficaria visível ao lado
          do fallback. */}
      <Show when={isLocalReadRequested()}>
        <Errored fallback={<p>Leitura recusada</p>}>
          <Loading fallback={<p>Carregando nota...</p>}>
            <RenderedNote id={String(params.id)} />
          </Loading>
        </Errored>
      </Show>
      {/* Sem limite local, a rejeição chega ao Errored raiz. */}
      <Show when={isRootReadRequested()}>
        <Loading fallback={<p>Carregando nota...</p>}>
          <RenderedNote id={String(params.id)} />
        </Loading>
      </Show>
    </main>
  )
}
