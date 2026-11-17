export const RELATIVE_IMPORT_RESTRICTION = {
  regex: String.raw`^(\.\./){4,}`,
  message:
    'Relative imports can go up at most three levels. Use the @/ alias for farther paths.'
}

// Path of the module that creates the render integrity state, through the alias
// or relative, with or without index.ts.
export const RENDER_INTEGRITY_MODULE = String.raw`(?:^|/)renderIntegrity(?:/index(?:\.ts)?)?$`
