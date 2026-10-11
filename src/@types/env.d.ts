import 'vite/client'

declare global {
  interface ImportMetaEnv {
    readonly VITE_SITE_URL: string
  }
}
