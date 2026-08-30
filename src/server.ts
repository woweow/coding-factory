import { createFactoryServer } from "./http/create-server.ts"
import { openWorkflowStore } from "./storage/open.ts"
import { seedWorkflowsIfEmpty } from "./storage/seed.ts"
import { startFactoryRun } from "./temporal/start.ts"

const DEFAULT_PORT = 8787

const listen = async (port: number): Promise<void> => {
  const { store, kind, location } = await openWorkflowStore()
  const seeded = await seedWorkflowsIfEmpty(store)
  const server = createFactoryServer(store, startFactoryRun)
  server.listen(port, "127.0.0.1", () => {
    console.log(`coding-factory listening on http://127.0.0.1:${port}`)
    console.log(`${kind}: ${location}`)
    if (seeded > 0) console.log(`seeded ${seeded} workflow template(s)`)
    console.log("GET/POST /workflows; GET/PATCH/DELETE /workflows/:id; POST /workflows/:id/runs; GET /runs/:id")
  })
}

const portRaw = process.env.PORT ?? String(DEFAULT_PORT)
const port = Number.parseInt(portRaw, 10)
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(`invalid PORT: ${portRaw}`)
}

listen(port).catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
