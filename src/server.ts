import { mkdirSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { createFactoryServer } from "./http/create-server.ts"
import { createSqliteWorkflowStore } from "./storage/sqlite.ts"

const DEFAULT_PORT = 8787
const DEFAULT_SQLITE_PATH = resolve("data/factory.db")

const listen = (port: number, sqlitePath: string): void => {
  mkdirSync(dirname(sqlitePath), { recursive: true })
  const store = createSqliteWorkflowStore(sqlitePath)
  const server = createFactoryServer(store)
  server.listen(port, "127.0.0.1", () => {
    console.log(`coding-factory listening on http://127.0.0.1:${port}`)
    console.log(`sqlite: ${sqlitePath}`)
    console.log("POST /workflows to register; GET /workflows/:id to fetch")
    console.log("run-workflow is not implemented in this slice; Temporal local is next")
  })
}

const portRaw = process.env.PORT ?? String(DEFAULT_PORT)
const port = Number.parseInt(portRaw, 10)
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(`invalid PORT: ${portRaw}`)
}

listen(port, process.env.SQLITE_PATH ?? DEFAULT_SQLITE_PATH)
