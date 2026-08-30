import assert from "node:assert/strict"
import { test } from "node:test"

import { loadOnce } from "./once.ts"

test("loadOnce shares one in-flight promise", async () => {
  let pending: Promise<string> | undefined
  let loads = 0
  const load = (): Promise<string> =>
    loadOnce(
      () => pending,
      (next) => {
        pending = next
      },
      async () => {
        loads += 1
        return "ok"
      }
    )
  const [first, second] = await Promise.all([load(), load()])
  assert.equal(first, "ok")
  assert.equal(second, "ok")
  assert.equal(loads, 1)
})

test("loadOnce retries after a failed load", async () => {
  let pending: Promise<string> | undefined
  let loads = 0
  const load = (): Promise<string> =>
    loadOnce(
      () => pending,
      (next) => {
        pending = next
      },
      async () => {
        loads += 1
        if (loads === 1) throw new Error("boom")
        return "ok"
      }
    )
  await assert.rejects(load(), /boom/)
  assert.equal(await load(), "ok")
  assert.equal(loads, 2)
})
