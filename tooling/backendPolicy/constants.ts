export const RELATIVE_IMPORT_RESTRICTION = {
  regex: String.raw`^(\.\./){4,}`,
  message:
    'Imports relativos podem subir no máximo três níveis. Use o alias @/ para caminhos mais distantes.'
}

// Caminho do módulo que cria o estado de integridade do render, pelo alias ou
// relativo, com ou sem o index.ts.
export const RENDER_INTEGRITY_MODULE = String.raw`(?:^|/)renderIntegrity(?:/index(?:\.ts)?)?$`
