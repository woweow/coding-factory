import { spawn, type ChildProcess } from "node:child_process"
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs"
import { connect } from "node:net"
import { resolve } from "node:path"

import { isProcessAlive, lockIsHeld, parseE2eLock, pidsToReap, type E2eLockPayload } from "./e2e-lock.ts"

const root = resolve(process.cwd())
const sqlitePath = resolve(root, "data/e2e.db")
const children: ChildProcess[] = []
const lockPath = resolve(root, "data/e2e-stack.lock")
let lockFd: number | undefined

const sleep = (ms: number): Promise<void> => new Promise((resolveWait) => setTimeout(resolveWait, ms))

const isErrno = (error: unknown, code: string): boolean =>
  typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === code

const portOpen = (port: number): Promise<boolean> =>
  new Promise((resolveOpen) => {
    const socket = connect({ host: "127.0.0.1", port }, () => {
      socket.end()
      resolveOpen(true)
    })
    socket.on("error", () => resolveOpen(false))
  })

const waitPort = async (port: number, timeoutMs: number): Promise<void> => {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await portOpen(port)) return
    await sleep(300)
  }
  throw new Error(`timed out waiting for port ${port}`)
}

const waitHttp = async (url: string, timeoutMs: number): Promise<void> => {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {
      /* retry */
    }
    await sleep(300)
  }
  throw new Error(`timed out waiting for ${url}`)
}

const killPidTree = (pid: number): void => {
  try {
    process.kill(-pid, "SIGKILL")
  } catch {
    /* ignore */
  }
  try {
    process.kill(pid, "SIGKILL")
  } catch {
    /* ignore */
  }
}

const currentLock = (): E2eLockPayload => ({
  stackPid: process.pid,
  childPids: children.flatMap((child) => (child.pid ? [child.pid] : []))
})

const persistLock = (): void => {
  writeFileSync(lockPath, `${JSON.stringify(currentLock())}\n`)
}

const readLockFile = (): E2eLockPayload | null => {
  try {
    return parseE2eLock(readFileSync(lockPath, "utf8"))
  } catch {
    return null
  }
}

const reapStaleLock = (): void => {
  const payload = readLockFile()
  if (lockIsHeld(payload, isProcessAlive)) {
    throw new Error("Another e2e stack is already running (data/e2e-stack.lock).")
  }
  for (const pid of pidsToReap(payload, isProcessAlive)) {
    killPidTree(pid)
  }
  try {
    unlinkSync(lockPath)
  } catch {
    /* ignore */
  }
}

const acquireLock = (): void => {
  try {
    lockFd = openSync(lockPath, "wx")
    persistLock()
    return
  } catch (error) {
    if (!isErrno(error, "EEXIST")) throw error
  }
  reapStaleLock()
  lockFd = openSync(lockPath, "wx")
  persistLock()
}

const spawnLogged = (command: string, args: string[], extraEnv: Record<string, string>): ChildProcess => {
  const child = spawn(command, args, {
    cwd: root,
    env: { ...process.env, ...extraEnv, FACTORY_ROOT: root },
    stdio: "inherit",
    detached: true
  })
  children.push(child)
  persistLock()
  return child
}

const shutdown = (): void => {
  for (const child of children) {
    if (!child.pid) continue
    killPidTree(child.pid)
  }
  if (lockFd !== undefined) {
    try {
      closeSync(lockFd)
    } catch {
      /* ignore */
    }
    try {
      unlinkSync(lockPath)
    } catch {
      /* ignore */
    }
  }
}

const main = async (): Promise<void> => {
  mkdirSync(resolve(root, "data"), { recursive: true })
  acquireLock()
  if (existsSync(sqlitePath)) rmSync(sqlitePath)
  if (existsSync(`${sqlitePath}-wal`)) rmSync(`${sqlitePath}-wal`)
  if (existsSync(`${sqlitePath}-shm`)) rmSync(`${sqlitePath}-shm`)

  const temporalDb = resolve(root, "data/temporal-e2e.db")
  if (existsSync(temporalDb)) rmSync(temporalDb)
  if (existsSync(`${temporalDb}-wal`)) rmSync(`${temporalDb}-wal`)
  if (existsSync(`${temporalDb}-shm`)) rmSync(`${temporalDb}-shm`)

  if (!(await portOpen(7233))) {
    spawnLogged("temporal", ["server", "start-dev", "--headless", "--db-filename", temporalDb], {})
    await waitPort(7233, 60_000)
  }

  const sharedEnv = {
    SQLITE_PATH: sqlitePath,
    FACTORY_AGENT_DRIVER: "fake"
  }
  spawnLogged("npx", ["tsx", "src/temporal/worker.ts"], sharedEnv)
  if (await portOpen(8787)) throw new Error("port 8787 already in use")
  spawnLogged("npx", ["tsx", "src/server.ts"], { ...sharedEnv, PORT: "8787" })
  await waitHttp("http://127.0.0.1:8787/health", 60_000)
  if (await portOpen(3000)) throw new Error("port 3000 already in use")
  spawnLogged("npx", ["next", "dev", "ui", "--hostname", "127.0.0.1", "--port", "3000"], sharedEnv)
  await waitHttp("http://127.0.0.1:3000", 120_000)
  console.log("e2e stack ready: ui :3000 rest :8787")
  await new Promise(() => undefined)
}

process.on("SIGINT", () => {
  shutdown()
  process.exit(0)
})
process.on("SIGTERM", () => {
  shutdown()
  process.exit(0)
})

main().catch((error: unknown) => {
  console.error(error)
  shutdown()
  process.exit(1)
})
