type SettlementOptions = { task: Promise<unknown>; settle: () => void }

export async function observeSettlement({
  task,
  settle
}: SettlementOptions): Promise<void> {
  try {
    await task
  } catch {
    // Quem chama observa a rejeição original.
  } finally {
    settle()
  }
}
