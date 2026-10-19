export type Ports = {
  api: <T>(path: string) => Promise<T>
  git: (args: string[]) => Promise<string>
  readBlob: (spec: string) => Promise<Uint8Array>
  readEvidence: (artifactId: number) => Promise<unknown>
}
