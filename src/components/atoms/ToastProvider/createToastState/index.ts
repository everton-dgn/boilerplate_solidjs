import { type Accessor, createSignal, onCleanup, onSettled } from 'solid-js'

import type { ToastApi, ToastEntry, ToastVariant } from '../types.ts'

type TimerEntry = {
  toast: ToastEntry
  remaining: number
  started: number
  timer?: ReturnType<typeof setTimeout>
  hovered: boolean
  focused: boolean
}

type PauseOptions = {
  id: string
  reason: 'hovered' | 'focused'
  paused: boolean
}

type ToastState = {
  api: ToastApi
  toasts: Accessor<ToastEntry[]>
  polite: Accessor<ToastEntry | undefined>
  assertive: Accessor<ToastEntry | undefined>
  pause: (options: PauseOptions) => void
}

const DEFAULT_DURATION = 5000
const ANNOUNCEMENT_DELAY = 150
const MAX_TOASTS = 5

type DurationOptions = { duration?: number; variant: ToastVariant }

function getDuration({ duration, variant }: DurationOptions) {
  if (duration !== undefined && Number.isFinite(duration)) {
    return Math.max(0, duration)
  }
  return variant === 'loading' ? 0 : DEFAULT_DURATION
}

export function createToastState(): ToastState {
  const [toasts, setToasts] = createSignal<ToastEntry[]>([])
  const [polite, setPolite] = createSignal<ToastEntry | undefined>()
  const [assertive, setAssertive] = createSignal<ToastEntry | undefined>()
  const entries = new Map<string, TimerEntry>()
  const pending = new Map<'polite' | 'assertive', ToastEntry>()
  const lastAnnouncement = new Map<'polite' | 'assertive', ToastEntry>()
  let announcementTimer: ReturnType<typeof setTimeout> | undefined
  let sequence = 0
  let disposed = false
  let hidden = false

  function publish() {
    setToasts(Array.from(entries.values(), entry => entry.toast))
  }

  function stop(entry: TimerEntry) {
    if (entry.timer === undefined) return
    clearTimeout(entry.timer)
    entry.timer = undefined
    entry.remaining = Math.max(
      1,
      entry.remaining - (performance.now() - entry.started)
    )
  }

  function dismiss(id: string) {
    if (disposed) return
    const entry = entries.get(id)
    if (!entry) return
    stop(entry)
    entries.delete(id)
    for (const [channel, toast] of pending) {
      if (toast.id === id) pending.delete(channel)
    }
    publish()
  }

  function start(entry: TimerEntry) {
    if (
      disposed ||
      hidden ||
      entry.hovered ||
      entry.focused ||
      entry.remaining === 0
    ) {
      return
    }
    entry.started = performance.now()
    entry.timer = setTimeout(() => dismiss(entry.toast.id), entry.remaining)
  }

  function announce(toast: ToastEntry) {
    const channel = toast.variant === 'error' ? 'assertive' : 'polite'
    // A região precisa mudar entre eventos independentes com o mesmo texto.
    const previous = lastAnnouncement.get(channel)
    if (
      previous &&
      previous.id !== toast.id &&
      previous.variant === toast.variant &&
      previous.message === toast.message
    ) {
      if (channel === 'assertive') setAssertive(undefined)
      else setPolite(undefined)
    }
    // Um lote anuncia somente a última mudança de cada prioridade.
    for (const [priority, current] of pending) {
      if (current.id === toast.id) pending.delete(priority)
    }
    pending.set(channel, toast)
    if (announcementTimer !== undefined) return
    announcementTimer = setTimeout(() => {
      announcementTimer = undefined
      for (const [priority, current] of pending) {
        const last = lastAnnouncement.get(priority)
        if (
          last?.id === current.id &&
          last.variant === current.variant &&
          last.message === current.message
        ) {
          continue
        }
        lastAnnouncement.set(priority, current)
        if (priority === 'assertive') setAssertive(current)
        else setPolite(current)
      }
      pending.clear()
    }, ANNOUNCEMENT_DELAY)
  }

  const api: ToastApi = {
    show(options) {
      sequence += 1
      const id = `toast-${sequence}`
      if (disposed) return id
      if (entries.size >= MAX_TOASTS) {
        const oldest = entries.keys().next().value
        if (oldest !== undefined) dismiss(oldest)
      }
      const variant = options.variant ?? 'info'
      const toast = { id, message: options.message, variant }
      const entry: TimerEntry = {
        toast,
        remaining: getDuration({ duration: options.duration, variant }),
        started: 0,
        hovered: false,
        focused: false
      }
      entries.set(id, entry)
      start(entry)
      publish()
      announce(toast)
      return id
    },
    update(options) {
      if (disposed) return
      const entry = entries.get(options.id)
      if (!entry) return
      const previous = entry.toast
      const variant = options.variant ?? previous.variant
      entry.toast = {
        id: previous.id,
        message: options.message ?? previous.message,
        variant
      }
      if (options.duration !== undefined || variant !== previous.variant) {
        stop(entry)
        entry.remaining = getDuration({ duration: options.duration, variant })
        start(entry)
      }
      publish()
      if (
        previous.message !== entry.toast.message ||
        previous.variant !== variant
      ) {
        announce(entry.toast)
      }
    },
    dismiss
  }

  function pause({ id, reason, paused }: PauseOptions) {
    const entry = entries.get(id)
    if (!entry || entry[reason] === paused) return
    stop(entry)
    entry[reason] = paused
    start(entry)
  }

  function visibilityChanged() {
    ;({ hidden } = document)
    for (const entry of entries.values()) {
      stop(entry)
      start(entry)
    }
  }

  onSettled(() => {
    visibilityChanged()
    document.addEventListener('visibilitychange', visibilityChanged)
    return () =>
      document.removeEventListener('visibilitychange', visibilityChanged)
  })

  onCleanup(() => {
    disposed = true
    clearTimeout(announcementTimer)
    for (const entry of entries.values()) stop(entry)
    entries.clear()
    pending.clear()
  })

  return { api, toasts, polite, assertive, pause }
}
