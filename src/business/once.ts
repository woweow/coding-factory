export const loadOnce = <T>(
  getPending: () => Promise<T> | undefined,
  setPending: (pending: Promise<T> | undefined) => void,
  load: () => Promise<T>
): Promise<T> => {
  const existing = getPending()
  if (existing) return existing
  const pending = load()
  setPending(pending)
  void pending.catch(() => {
    if (getPending() === pending) {
      setPending(undefined)
    }
  })
  return pending
}
