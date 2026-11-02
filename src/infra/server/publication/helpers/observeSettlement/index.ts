export async function observeSettlement(
  task: Promise<unknown>,
  settle: () => void
): Promise<void> {
  try {
    await task
  } catch {
    // The caller observes the original rejection.
  } finally {
    settle()
  }
}
