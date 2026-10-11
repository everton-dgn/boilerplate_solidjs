type ToastOptions = {
  message: string
  variant?: ToastVariant
  duration?: number
}

type ToastUpdate = Partial<ToastOptions> & { id: string }

export type ToastVariant = 'info' | 'success' | 'warning' | 'error' | 'loading'

export type ToastApi = {
  show: (options: ToastOptions) => string
  update: (options: ToastUpdate) => void
  dismiss: (id: string) => void
}

export type ToastEntry = {
  id: string
  message: string
  variant: ToastVariant
}
