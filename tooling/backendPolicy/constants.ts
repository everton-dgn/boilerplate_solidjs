export const RELATIVE_IMPORT_RESTRICTION = {
  regex: '^(\\.\\./){4,}',
  message:
    'Imports relativos podem subir no máximo três níveis. Use o alias @/ para caminhos mais distantes.'
}
