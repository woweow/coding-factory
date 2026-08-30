import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import type { AddressInfo } from "node:net"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { createFactoryServer } from "./create-server.ts"
import { seedWorkflowsIfEmpty } from "../storage/seed.ts"
import { createSqliteWorkflowStore } from "../storage/sqlite.ts"

const fixturePath = join(dirname(fileURLToPath(import.meta.url)), "../../dev/fixtures/implement-review.json")
const fixtureJson = readFileSync(fixturePath, "utf8")

const listen = async () => {
  const store = createSqliteWorkflowStore(":memory:")
  const started: string[] = []
  const server = createFactoryServer(store, async (input) => {
    started.push(input.runId)
  })
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve)
  })
  const address = server.address()
  assert.ok(address && typeof address === "object")
  const { port } = address as AddressInfo
  const close = async (): Promise<void> => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error)
        else resolve()
      })
    })
    await store.close()
  }
  return { baseUrl: `http://127.0.0.1:${port}`, close, store, started }
}

const register = async (baseUrl: string, body: string = fixtureJson): Promise<{ id: string; name: string }> => {
  const res = await fetch(`${baseUrl}/workflows`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body
  })
  assert.equal(res.status, 201)
  const created: unknown = await res.json()
  assert.ok(created !== null && typeof created === "object")
  return created as { id: string; name: string }
}

test("GET /workflows lists live workflows and showDeleted includes soft-deleted", async (t) => {
  const { baseUrl, close } = await listen()
  t.after(close)
  const empty = await fetch(`${baseUrl}/workflows`)
  assert.equal(empty.status, 200)
  assert.deepEqual(await empty.json(), [])

  const first = await register(baseUrl)
  const secondBody = JSON.parse(fixtureJson) as { name: string } & Record<string, unknown>
  secondBody.name = "second"
  const second = await register(baseUrl, JSON.stringify(secondBody))

  const listed = await fetch(`${baseUrl}/workflows`)
  assert.equal(listed.status, 200)
  const live: unknown = await listed.json()
  assert.ok(Array.isArray(live))
  assert.deepEqual(
    new Set(live.map((row) => (row as { id: string }).id)),
    new Set([first.id, second.id])
  )

  const del = await fetch(`${baseUrl}/workflows/${first.id}`, { method: "DELETE" })
  assert.equal(del.status, 204)

  const hidden = await fetch(`${baseUrl}/workflows`)
  const hiddenBody: unknown = await hidden.json()
  assert.ok(Array.isArray(hiddenBody))
  assert.equal(hiddenBody.length, 1)
  assert.equal((hiddenBody[0] as { id: string }).id, second.id)

  const shown = await fetch(`${baseUrl}/workflows?showDeleted=true`)
  const shownBody: unknown = await shown.json()
  assert.ok(Array.isArray(shownBody))
  assert.equal(shownBody.length, 2)
  const deletedRow = shownBody.find((row) => (row as { id: string }).id === first.id) as { deletedAt: string | null }
  assert.equal(typeof deletedRow.deletedAt, "string")
})

test("GET /workflows/:id 404s soft-deleted unless showDeleted=true", async (t) => {
  const { baseUrl, close } = await listen()
  t.after(close)
  const created = await register(baseUrl)
  const del = await fetch(`${baseUrl}/workflows/${created.id}`, { method: "DELETE" })
  assert.equal(del.status, 204)

  const hidden = await fetch(`${baseUrl}/workflows/${created.id}`)
  assert.equal(hidden.status, 404)

  const shown = await fetch(`${baseUrl}/workflows/${created.id}?showDeleted=true`)
  assert.equal(shown.status, 200)
  const body: unknown = await shown.json()
  assert.ok(body !== null && typeof body === "object")
  assert.equal((body as { id: string }).id, created.id)
  assert.equal(typeof (body as { deletedAt: string }).deletedAt, "string")
})

test("PATCH /workflows/:id updates definition/name and 404s if deleted", async (t) => {
  const { baseUrl, close } = await listen()
  t.after(close)
  const created = await register(baseUrl)
  const next = JSON.parse(fixtureJson) as { name: string } & Record<string, unknown>
  next.name = "implement-review-patched"
  const patched = await fetch(`${baseUrl}/workflows/${created.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(next)
  })
  assert.equal(patched.status, 200)
  const body: unknown = await patched.json()
  assert.ok(body !== null && typeof body === "object")
  assert.equal((body as { name: string }).name, "implement-review-patched")
  assert.equal((body as { definition: { name: string } }).definition.name, "implement-review-patched")
  assert.equal((body as { deletedAt: string | null }).deletedAt, null)

  await fetch(`${baseUrl}/workflows/${created.id}`, { method: "DELETE" })
  const afterDelete = await fetch(`${baseUrl}/workflows/${created.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(next)
  })
  assert.equal(afterDelete.status, 404)
})

test("PATCH keeps the submitted user document including omitted and explicit defaults", async (t) => {
  const { baseUrl, close } = await listen()
  t.after(close)
  const created = await register(baseUrl)
  const sparse = {
    name: "patched-sparse",
    entry: "only",
    agent: {
      model: { id: "composer-2.5", params: [{ id: "fast", value: "false" }] },
      cloud: { repos: [{ url: "https://github.com/woweow/coding-factory", startingRef: "main" }] }
    },
    steps: [{ id: "only" }]
  }
  const patched = await fetch(`${baseUrl}/workflows/${created.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(sparse)
  })
  assert.equal(patched.status, 200)
  const body: unknown = await patched.json()
  assert.ok(body !== null && typeof body === "object")
  assert.deepEqual((body as { definition: typeof sparse }).definition, sparse)
  const fetched = await fetch(`${baseUrl}/workflows/${created.id}`)
  const fetchedBody: unknown = await fetched.json()
  assert.deepEqual((fetchedBody as { definition: typeof sparse }).definition, sparse)
})

test("DELETE /workflows/:id is idempotent and missing ids 404", async (t) => {
  const { baseUrl, close } = await listen()
  t.after(close)
  const created = await register(baseUrl)
  const first = await fetch(`${baseUrl}/workflows/${created.id}`, { method: "DELETE" })
  assert.equal(first.status, 204)
  const second = await fetch(`${baseUrl}/workflows/${created.id}`, { method: "DELETE" })
  assert.equal(second.status, 204)
  const missing = await fetch(`${baseUrl}/workflows/wf_missing`, { method: "DELETE" })
  assert.equal(missing.status, 404)
})

test("POST run and GET /workflows/:id/runs hide deleted workflows", async (t) => {
  const { baseUrl, close, started } = await listen()
  t.after(close)
  const created = await register(baseUrl)
  const runRes = await fetch(`${baseUrl}/workflows/${created.id}/runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt: "go" })
  })
  assert.equal(runRes.status, 201)
  const run: unknown = await runRes.json()
  assert.equal(started.length, 1)

  const listed = await fetch(`${baseUrl}/workflows/${created.id}/runs`)
  assert.equal(listed.status, 200)
  const runs: unknown = await listed.json()
  assert.ok(Array.isArray(runs))
  assert.equal(runs.length, 1)
  assert.equal((runs[0] as { id: string }).id, (run as { id: string }).id)

  await fetch(`${baseUrl}/workflows/${created.id}`, { method: "DELETE" })
  const hiddenRuns = await fetch(`${baseUrl}/workflows/${created.id}/runs`)
  assert.equal(hiddenRuns.status, 404)
  const startDeleted = await fetch(`${baseUrl}/workflows/${created.id}/runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt: "go" })
  })
  assert.equal(startDeleted.status, 404)
})

test("GET /workflows rejects invalid showDeleted", async (t) => {
  const { baseUrl, close } = await listen()
  t.after(close)
  const res = await fetch(`${baseUrl}/workflows?showDeleted=yes`)
  assert.equal(res.status, 400)
})

test("seeded store is visible on GET /workflows", async (t) => {
  const store = createSqliteWorkflowStore(":memory:")
  await seedWorkflowsIfEmpty(store)
  const server = createFactoryServer(store)
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve)
  })
  t.after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error)
        else resolve()
      })
    })
    await store.close()
  })
  const address = server.address()
  assert.ok(address && typeof address === "object")
  const res = await fetch(`http://127.0.0.1:${(address as AddressInfo).port}/workflows`)
  assert.equal(res.status, 200)
  const body: unknown = await res.json()
  assert.ok(Array.isArray(body))
  assert.equal(body.length, 2)
})
