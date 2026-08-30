export type E2eLockPayload = {
  stackPid: number
  childPids: number[]
}

export const parseE2eLock = (raw: string): E2eLockPayload | null => {
  const trimmed = raw.trim()
  if (!trimmed) return null
  try {
    const parsed: unknown = JSON.parse(trimmed)
    if (parsed === null || typeof parsed !== "object") return null
    const rec = parsed as Record<string, unknown>
    if (typeof rec.stackPid !== "number" || !Number.isInteger(rec.stackPid) || rec.stackPid <= 0) {
      return null
    }
    const childPids = Array.isArray(rec.childPids)
      ? rec.childPids.filter((pid): pid is number => typeof pid === "number" && Number.isInteger(pid) && pid > 0)
      : []
    return { stackPid: rec.stackPid, childPids }
  } catch {
    return null
  }
}

export const isProcessAlive = (
  pid: number,
  killFn: (pid: number, signal: 0) => void = (target, signal) => {
    process.kill(target, signal)
  }
): boolean => {
  try {
    killFn(pid, 0)
    return true
  } catch {
    return false
  }
}

export const lockIsHeld = (payload: E2eLockPayload | null, alive: (pid: number) => boolean): boolean =>
  payload !== null && alive(payload.stackPid)

export const pidsToReap = (payload: E2eLockPayload | null, alive: (pid: number) => boolean): number[] => {
  if (lockIsHeld(payload, alive) || payload === null) return []
  return payload.childPids.filter((pid) => alive(pid))
}
