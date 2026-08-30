import assert from "node:assert/strict"
import { test } from "node:test"

import { lockIsHeld, parseE2eLock, pidsToReap } from "./e2e-lock.ts"

test("parseE2eLock accepts a recorded stack pid and child pids", () => {
  const parsed = parseE2eLock('{"stackPid":12,"childPids":[34,56]}\n')
  assert.deepEqual(parsed, { stackPid: 12, childPids: [34, 56] })
})

test("parseE2eLock treats empty or invalid lock files as stale", () => {
  assert.equal(parseE2eLock(""), null)
  assert.equal(parseE2eLock("not-json"), null)
  assert.equal(parseE2eLock('{"stackPid":-1,"childPids":[]}'), null)
})

test("lockIsHeld is false when the stack pid is dead or the file is unreadable", () => {
  const alive = (pid: number) => pid === 12
  assert.equal(lockIsHeld({ stackPid: 12, childPids: [34] }, alive), true)
  assert.equal(lockIsHeld({ stackPid: 99, childPids: [34] }, alive), false)
  assert.equal(lockIsHeld(null, alive), false)
})

test("pidsToReap returns the stale stack pid and children so leftover groups can be signaled", () => {
  const alive = (pid: number) => pid === 34 || pid === 12
  assert.deepEqual(pidsToReap({ stackPid: 12, childPids: [34] }, alive), [])
  assert.deepEqual(pidsToReap({ stackPid: 99, childPids: [34, 56] }, alive), [99, 34, 56])
  assert.deepEqual(pidsToReap(null, alive), [])
})
