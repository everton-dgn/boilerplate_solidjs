type SettlementOptions = { task: Promise<unknown>; settle: () => void }

export async function observeSettlement({
  task,
  settle
}: SettlementOptions): Promise<void> {
  try {
    await task
  } catch {
    // The caller observes the original rejection.
  } finally {
    settle()
  }
}
