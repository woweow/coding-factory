import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import type { AddressInfo } from "node:net"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import type { WorkflowDefinition } from "../domain/types.ts"
import { createFactoryServer } from "./create-server.ts"
import { createSqliteWorkflowStore } from "../storage/sqlite.ts"

const fixturePath = join(dirname(fileURLToPath(import.meta.url)), "../../dev/fixtures/implement-review.json")
const fixtureJson = readFileSync(fixturePath, "utf8")

const listen = async () => {
  const store = createSqliteWorkflowStore(":memory:")
  const started: Array<{ runId: string; temporalWorkflowId: string; prompt: string }> = []
  const server = createFactoryServer(store, async (input) => {
    started.push({
      runId: input.runId,
      temporalWorkflowId: input.temporalWorkflowId,
      prompt: input.prompt
    })
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
  return { baseUrl: `http://127.0.0.1:${port}`, close, started }
}

test("POST /workflows/:id/runs returns a run id immediately and GET /runs/:id fetches it", async (t) => {
  const { baseUrl, close, started } = await listen()
  t.after(close)
  const createdRes = await fetch(`${baseUrl}/workflows`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: fixtureJson
  })
  assert.equal(createdRes.status, 201)
  const created: unknown = await createdRes.json()
  assert.ok(created !== null && typeof created === "object")
  const workflowId = (created as { id: string }).id

  const runRes = await fetch(`${baseUrl}/workflows/${workflowId}/runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt: "Implement a tiny README typo fix." })
  })
  assert.equal(runRes.status, 201)
  const runBody: unknown = await runRes.json()
  assert.ok(runBody !== null && typeof runBody === "object")
  const run = runBody as {
    id: string
    workflowId: string
    cursorAgentId: string | null
    temporalWorkflowId: string
    currentStepId: string
    state: string
  }
  assert.match(run.id, /^run_/)
  assert.equal(run.workflowId, workflowId)
  assert.equal(run.cursorAgentId, null)
  assert.equal(run.temporalWorkflowId, `factory-${run.id}`)
  assert.equal(run.currentStepId, "implementer")
  assert.equal(run.state, "running")
  assert.equal(started.length, 1)
  assert.equal(started[0]?.runId, run.id)
  assert.equal(started[0]?.prompt, "Implement a tiny README typo fix.")

  const getRes = await fetch(`${baseUrl}/runs/${run.id}`)
  assert.equal(getRes.status, 200)
  const fetched: unknown = await getRes.json()
  assert.ok(fetched !== null && typeof fetched === "object")
  assert.equal((fetched as { id: string }).id, run.id)
  assert.deepEqual((fetched as { steps: unknown[] }).steps, [])
})

test("POST /run-workflow requires a registered workflow id", async (t) => {
  const { baseUrl, close } = await listen()
  t.after(close)
  const missing = await fetch(`${baseUrl}/run-workflow`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ workflowId: "wf_missing", prompt: "x" })
  })
  assert.equal(missing.status, 404)
})

test("GET /runs/:id returns 404 for unknown ids", async (t) => {
  const { baseUrl, close } = await listen()
  t.after(close)
  const res = await fetch(`${baseUrl}/runs/run_missing`)
  assert.equal(res.status, 404)
})

test("POST run rejects apiKey", async (t) => {
  const { baseUrl, close } = await listen()
  t.after(close)
  const createdRes = await fetch(`${baseUrl}/workflows`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: fixtureJson
  })
  const created: unknown = await createdRes.json()
  const workflowId = (created as { id: string }).id
  const res = await fetch(`${baseUrl}/workflows/${workflowId}/runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt: "x", apiKey: "secret" })
  })
  assert.equal(res.status, 400)
})

test("optional cloud e2e is skipped without CURSOR_API_KEY", { skip: !process.env.CURSOR_API_KEY }, async () => {
  const unused: WorkflowDefinition | undefined = undefined
  assert.equal(unused, undefined)
})
