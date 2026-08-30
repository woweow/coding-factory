import assert from "node:assert/strict"
import { test } from "node:test"
import { createSqliteWorkflowStore } from "./sqlite.ts"
import { seedWorkflowsIfEmpty } from "./seed.ts"

test("seed inserts pass-json and ping-implement-review-pr when the table is empty", async (t) => {
  const store = createSqliteWorkflowStore(":memory:")
  t.after(async () => {
    await store.close()
  })
  const seeded = await seedWorkflowsIfEmpty(store)
  assert.equal(seeded, 2)
  const listed = await store.listWorkflows()
  const names = listed.map((row) => row.name).sort()
  assert.deepEqual(names, ["pass-json", "ping-implement-review-pr"])
  const pass = listed.find((row) => row.name === "pass-json")
  const ping = listed.find((row) => row.name === "ping-implement-review-pr")
  assert.equal(pass?.definition.agent.model.id, "composer-2.5")
  assert.deepEqual(pass?.definition.agent.model.params, [{ id: "fast", value: "false" }])
  assert.equal(pass?.definition.agent.cloud.repos[0]?.url, "https://github.com/woweow/coding-factory")
  assert.equal(pass?.definition.agent.cloud.repos[0]?.startingRef, "main")
  assert.equal(ping?.definition.agent.cloud.skipReviewerRequest, true)
  assert.equal("autoCreatePR" in (ping?.definition.agent.cloud ?? {}), false)
  assert.equal(ping?.definition.entry, "implementer")
})

test("seed is a no-op when any workflow already exists", async (t) => {
  const store = createSqliteWorkflowStore(":memory:")
  t.after(async () => {
    await store.close()
  })
  const first = await seedWorkflowsIfEmpty(store)
  assert.equal(first, 2)
  const second = await seedWorkflowsIfEmpty(store)
  assert.equal(second, 0)
  assert.equal((await store.listWorkflows({ showDeleted: true })).length, 2)
})

test("seed does not refill after every workflow is soft-deleted", async (t) => {
  const store = createSqliteWorkflowStore(":memory:")
  t.after(async () => {
    await store.close()
  })
  await seedWorkflowsIfEmpty(store)
  for (const row of await store.listWorkflows()) {
    await store.deleteWorkflow(row.id)
  }
  assert.equal((await store.listWorkflows()).length, 0)
  assert.equal(await seedWorkflowsIfEmpty(store), 0)
  assert.equal((await store.listWorkflows({ showDeleted: true })).length, 2)
})
