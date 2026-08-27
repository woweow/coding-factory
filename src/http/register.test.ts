import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import type { AddressInfo } from "node:net"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { createFactoryServer } from "./create-server.ts"
import { createSqliteWorkflowStore } from "../storage/sqlite.ts"

const fixturePath = join(dirname(fileURLToPath(import.meta.url)), "../../dev/fixtures/implement-review.json")
const fixtureJson = readFileSync(fixturePath, "utf8")

const listen = async () => {
  const store = createSqliteWorkflowStore(":memory:")
  const server = createFactoryServer(store)
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve)
  })
  const address = server.address()
  assert.ok(address && typeof address === "object")
  const { port } = address as AddressInfo
  const baseUrl = `http://127.0.0.1:${port}`
  const close = async (): Promise<void> => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error)
        else resolve()
      })
    })
    await store.close()
  }
  return { baseUrl, close }
}

test("POST /workflows registers a cloud workflow and GET returns it", async (t) => {
  const { baseUrl, close } = await listen()
  t.after(close)

  const createdRes = await fetch(`${baseUrl}/workflows`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: fixtureJson
  })
  assert.equal(createdRes.status, 201)
  const created: unknown = await createdRes.json()
  assert.ok(created !== null && typeof created === "object")
  const createdBody = created as {
    id: string
    name: string
    definition: { agent: { model: { id: string; params?: Array<{ id: string; value: string }> } } }
  }
  assert.match(createdBody.id, /^wf_/)
  assert.equal(createdBody.name, "implement-review")
  assert.equal(createdBody.definition.agent.model.id, "composer-2.5")
  assert.deepEqual(createdBody.definition.agent.model.params, [{ id: "fast", value: "false" }])

  const fetchedRes = await fetch(`${baseUrl}/workflows/${createdBody.id}`)
  assert.equal(fetchedRes.status, 200)
  const fetched: unknown = await fetchedRes.json()
  assert.deepEqual(fetched, created)
})

test("POST /register-workflow is an alias of POST /workflows", async (t) => {
  const { baseUrl, close } = await listen()
  t.after(close)
  const res = await fetch(`${baseUrl}/register-workflow`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: fixtureJson
  })
  assert.equal(res.status, 201)
})

test("GET /workflows/:id returns 404 for unknown ids", async (t) => {
  const { baseUrl, close } = await listen()
  t.after(close)
  const res = await fetch(`${baseUrl}/workflows/wf_missing`)
  assert.equal(res.status, 404)
  const body: unknown = await res.json()
  assert.ok(body !== null && typeof body === "object")
  assert.equal((body as { error: string }).error, "not_found")
})

test("POST /workflows rejects apiKey and agent.local", async (t) => {
  const { baseUrl, close } = await listen()
  t.after(close)
  const payload = {
    name: "bad",
    entry: "only",
    agent: {
      apiKey: "secret",
      local: { cwd: "/tmp" },
      model: { id: "composer-2.5", params: [{ id: "fast", value: "false" }] },
      cloud: { repos: [{ url: "https://github.com/woweow/coding-factory", startingRef: "main" }] }
    },
    steps: [{ id: "only", routes: [] }]
  }
  const res = await fetch(`${baseUrl}/workflows`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  })
  assert.equal(res.status, 400)
  const body: unknown = await res.json()
  assert.ok(body !== null && typeof body === "object")
  const errorBody = body as { error: string; details: Array<{ path: string }> }
  assert.equal(errorBody.error, "validation_error")
  const paths = errorBody.details.map((issue) => issue.path)
  assert.ok(paths.includes("agent.apiKey"))
  assert.ok(paths.includes("agent.local"))
  assert.equal(errorBody.details.length, 2)
})

test("POST /workflows rejects agent.mcpServers and agent.agents", async (t) => {
  const { baseUrl, close } = await listen()
  t.after(close)
  const payload = JSON.parse(fixtureJson) as {
    agent: Record<string, unknown>
  } & Record<string, unknown>
  payload.agent = {
    ...payload.agent,
    mcpServers: { linear: { type: "http", url: "https://example.com" } },
    agents: { helper: { description: "x", prompt: "y" } }
  }
  const res = await fetch(`${baseUrl}/workflows`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  })
  assert.equal(res.status, 400)
  const body: unknown = await res.json()
  assert.ok(body !== null && typeof body === "object")
  const errorBody = body as { error: string; details: Array<{ path: string; message: string }> }
  assert.equal(errorBody.error, "validation_error")
  const paths = errorBody.details.map((issue) => issue.path)
  assert.ok(paths.includes("agent.mcpServers"))
  assert.ok(paths.includes("agent.agents"))
})

test("GET /health is ok", async (t) => {
  const { baseUrl, close } = await listen()
  t.after(close)
  const res = await fetch(`${baseUrl}/health`)
  assert.equal(res.status, 200)
})
