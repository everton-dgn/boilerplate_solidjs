type WritableHandle = {
  write: (buffer: Uint8Array) => Promise<{ bytesWritten: number }>
}
type WriteAllOptions = {
  output: WritableHandle
  bytes: Uint8Array
  signal?: AbortSignal
}

// `FileHandle.write` pode gravar menos bytes do que recebeu; o laço continua do
// ponto em que parou e recusa uma gravação sem progresso.
export async function writeAll({
  output,
  bytes,
  signal
}: WriteAllOptions): Promise<void> {
  let offset = 0
  while (offset < bytes.byteLength) {
    signal?.throwIfAborted()
    const { bytesWritten } = await output.write(bytes.subarray(offset))
    if (bytesWritten <= 0) throw new Error('File write made no progress')
    offset += bytesWritten
  }
}
