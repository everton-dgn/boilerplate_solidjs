import 'vite/client'

// Variáveis públicas validadas em env.ts e expostas pelo Vite em import.meta.env.
// A interface do Vite exige mesclagem de declarações.
declare global {
  interface ImportMetaEnv {
    readonly VITE_SITE_URL: string
  }
}
