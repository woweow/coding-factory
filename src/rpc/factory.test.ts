import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { createFactoryService } from "../business/factory.ts"
import { createFactoryRpc } from "./factory.ts"
import { createSqliteWorkflowStore } from "../storage/sqlite.ts"

const fixturePath = join(dirname(fileURLToPath(import.meta.url)), "../../dev/fixtures/implement-review.json")
const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as Record<string, unknown>

test("RPC maps business success and errors without HTTP", async (t) => {
  const store = createSqliteWorkflowStore(":memory:")
  t.after(async () => {
    await store.close()
  })
  const rpc = createFactoryRpc(createFactoryService(store, async () => undefined))
  const created = await rpc.createWorkflow({ definition: fixture })
  assert.equal(created.ok, true)
  if (!created.ok) throw new Error("expected create")
  const listed = await rpc.listWorkflows()
  assert.equal(listed.ok, true)
  if (!listed.ok) throw new Error("expected list")
  assert.equal(listed.data.length, 1)
  const missing = await rpc.getWorkflow({ id: "wf_missing" })
  assert.equal(missing.ok, false)
  if (missing.ok) throw new Error("expected missing")
  assert.equal(missing.error.code, "not_found")
  const invalid = await rpc.createWorkflow({ definition: { name: "nope" } })
  assert.equal(invalid.ok, false)
  if (invalid.ok) throw new Error("expected invalid")
  assert.equal(invalid.error.code, "validation_error")
  const run = await rpc.startRun({ workflowId: created.data.id, prompt: "go" })
  assert.equal(run.ok, true)
  if (!run.ok) throw new Error("expected run")
  const fetched = await rpc.getRun({ id: run.data.id })
  assert.equal(fetched.ok, true)
  await rpc.deleteWorkflow({ id: created.data.id })
  const afterDelete = await rpc.startRun({ workflowId: created.data.id })
  assert.equal(afterDelete.ok, false)
})
