import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { createSqliteWorkflowStore } from "../storage/sqlite.ts"
import { createFactoryService } from "./factory.ts"
import { FactoryError } from "./errors.ts"
import { parseWorkflowDefinition } from "./definition.ts"

const fixturePath = join(dirname(fileURLToPath(import.meta.url)), "../../dev/fixtures/implement-review.json")
const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as Record<string, unknown>

const serviceWithStore = (startRun?: Parameters<typeof createFactoryService>[1]) => {
  const store = createSqliteWorkflowStore(":memory:")
  return { store, service: createFactoryService(store, startRun) }
}

test("business CRUD honors showDeleted and soft-delete", async (t) => {
  const { store, service } = serviceWithStore()
  t.after(async () => {
    await store.close()
  })
  const created = await service.createWorkflow(fixture)
  assert.match(created.id, /^wf_/)
  assert.equal(created.deletedAt, null)
  const listed = await service.listWorkflows()
  assert.equal(listed.length, 1)
  await service.deleteWorkflow(created.id)
  assert.equal((await service.listWorkflows()).length, 0)
  assert.equal((await service.listWorkflows({ showDeleted: true })).length, 1)
  await assert.rejects(() => service.getWorkflow(created.id), (error: unknown) => {
    assert.ok(error instanceof FactoryError)
    assert.equal(error.code, "not_found")
    return true
  })
  const hidden = await service.getWorkflow(created.id, { showDeleted: true })
  assert.equal(typeof hidden.deletedAt, "string")
})

test("business update replaces definition and 404s after delete", async (t) => {
  const { store, service } = serviceWithStore()
  t.after(async () => {
    await store.close()
  })
  const created = await service.createWorkflow(fixture)
  const next = { ...fixture, name: "patched" }
  const updated = await service.updateWorkflow(created.id, next)
  assert.equal(updated.name, "patched")
  await service.deleteWorkflow(created.id)
  await assert.rejects(() => service.updateWorkflow(created.id, next), /not found/)
})

test("business persist keeps explicit defaults and omitted optionals", async (t) => {
  const { store, service } = serviceWithStore()
  t.after(async () => {
    await store.close()
  })
  const sparse = {
    name: "sparse-ui",
    entry: "only",
    agent: {
      model: { id: "composer-2.5" },
      cloud: { repos: [{ url: "https://github.com/woweow/coding-factory" }] }
    },
    steps: [{ id: "only", mode: "agent" }]
  }
  const created = await service.createWorkflow(sparse)
  assert.equal("systemPrompt" in created.definition.steps[0]!, false)
  assert.equal("routes" in created.definition.steps[0]!, false)
  assert.equal(created.definition.steps[0]?.mode, "agent")
  const fetched = await service.getWorkflow(created.id)
  assert.deepEqual(fetched.definition, sparse)
  const patched = { ...sparse, name: "sparse-patched" }
  const updated = await service.updateWorkflow(created.id, patched)
  assert.deepEqual(updated.definition, patched)
})

test("business create rejects invalid definitions via the conversion site", async (t) => {
  const { store, service } = serviceWithStore()
  t.after(async () => {
    await store.close()
  })
  const parsed = parseWorkflowDefinition({ name: "x" })
  assert.equal(parsed.ok, false)
  await assert.rejects(() => service.createWorkflow({ name: "x" }), (error: unknown) => {
    assert.ok(error instanceof FactoryError)
    assert.equal(error.code, "validation_error")
    return true
  })
})

test("business startRun and getRun use the same run record", async (t) => {
  const started: string[] = []
  const { store, service } = serviceWithStore(async (input) => {
    started.push(input.runId)
  })
  t.after(async () => {
    await store.close()
  })
  const created = await service.createWorkflow(fixture)
  const run = await service.startWorkflowRun(created.id, { prompt: "go" })
  assert.match(run.id, /^run_/)
  assert.equal(run.state, "running")
  assert.deepEqual(run.steps, [])
  assert.equal(started[0], run.id)
  const fetched = await service.getRun(run.id)
  assert.equal(fetched.id, run.id)
  const listed = await service.listRuns(created.id)
  assert.equal(listed.length, 1)
})

test("business startRun 404s deleted workflows and unknown runs", async (t) => {
  const { store, service } = serviceWithStore(async () => undefined)
  t.after(async () => {
    await store.close()
  })
  const created = await service.createWorkflow(fixture)
  await service.deleteWorkflow(created.id)
  await assert.rejects(() => service.startWorkflowRun(created.id, {}), /not found/)
  await assert.rejects(() => service.getRun("run_missing"), /not found/)
})
