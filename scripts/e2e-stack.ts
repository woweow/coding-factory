import { spawn, type ChildProcess } from "node:child_process"
import { closeSync, existsSync, mkdirSync, openSync, rmSync, unlinkSync } from "node:fs"
import { connect } from "node:net"
import { resolve } from "node:path"

const root = resolve(process.cwd())
const sqlitePath = resolve(root, "data/e2e.db")
const children: ChildProcess[] = []
const lockPath = resolve(root, "data/e2e-stack.lock")
let lockFd: number | undefined

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
    await new Promise((resolveWait) => setTimeout(resolveWait, 300))
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
      await new Promise((resolveWait) => setTimeout(resolveWait, 300))
    }
  }
  throw new Error(`timed out waiting for ${url}`)
}

const spawnLogged = (command: string, args: string[], extraEnv: Record<string, string>): ChildProcess => {
  const child = spawn(command, args, {
    cwd: root,
    env: { ...process.env, ...extraEnv, FACTORY_ROOT: root },
    stdio: "inherit"
  })
  children.push(child)
  return child
}

const shutdown = (): void => {
  for (const child of children) {
    if (!child.pid) continue
    try {
      process.kill(child.pid, "SIGKILL")
    } catch {
      continue
    }
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
  lockFd = openSync(lockPath, "wx")
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
