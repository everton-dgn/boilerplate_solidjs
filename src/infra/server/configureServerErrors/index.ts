import 'server-only'
import {
  configureServerErrors,
  isResponseEnvelope,
  type ServerErrorContext
} from '@solidjs/web'
import { configureServerFunctionsServer } from '@solidjs/web/server-functions/server'
import { NotReadyError } from 'solid-js'

import { isControlResponse } from '../isControlResponse/index.ts'
import { logServerFailure } from '../logServerFailure/index.ts'
import { protectServerOperation } from '../protectServerOperation/index.ts'
import { createPublicError, isPublicError } from '../publicErrors/index.ts'
import {
  markRenderFailure,
  observeRenderFailures
} from '../renderIntegrity/index.ts'

const isDevelopment = import.meta.env.DEV

configureServerFunctionsServer({
  wrapInvocation: run => protectServerOperation({ run, allowControl: true })
})

function isControlSignal(value: unknown): boolean {
  try {
    return (
      isControlResponse(value) ||
      value instanceof NotReadyError ||
      isResponseEnvelope(value)
    )
  } catch {
    // Inspecting a thrown object can also fail (a getter or a Proxy).
    return false
  }
}

// The runtime already replaces thrown errors with the generic message in
// production. The hook only makes the public message uniform and writes the
// filtered log, render failures and rejections outside server functions included.
// It runs synchronously, its return goes to the client without another
// sanitization, and a throw here would make the runtime log the error of the hook.
function mapServerError(error: unknown): Error | undefined {
  if (isControlSignal(error)) return undefined
  if (!isPublicError(error)) {
    // With a hook installed, the runtime stops printing the error; in development
    // the log brings the original back to the terminal.
    logServerFailure({
      source: 'server-error',
      error,
      shouldPrintOriginal: isDevelopment
    })
  }
  // In development the runtime sends the original error, and the public error
  // would hide the diagnostic.
  if (isDevelopment) return undefined
  // Also drops fields added to a public error after it was created.
  return createPublicError()
}

// The Markdown only publishes a render without failures, and since
// solidjs/solid#4130 the hook is the source of that signal; that is why it also
// applies in development.
function handleServerError(
  error: unknown,
  context: ServerErrorContext
): Error | undefined {
  // Control signals mark it too: a redirect() or respond() thrown in the render
  // and caught by a nested <Errored> becomes a fallback with HTML 200.
  if (context.kind === 'render') markRenderFailure(context.event)
  return mapServerError(error)
}

configureServerErrors({ onError: handleServerError })
observeRenderFailures()
