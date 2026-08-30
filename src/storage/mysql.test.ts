import assert from "node:assert/strict"
import { test } from "node:test"
import { parseMysqlUrl } from "./mysql.ts"
import { isMysqlDatabaseUrl } from "./open.ts"

test("isMysqlDatabaseUrl accepts mysql and mysql2 URLs", () => {
  assert.equal(isMysqlDatabaseUrl("mysql://factory:factory@127.0.0.1:3306/factory"), true)
  assert.equal(isMysqlDatabaseUrl("mysql2://factory@localhost/factory"), true)
  assert.equal(isMysqlDatabaseUrl("sqlite:///tmp/factory.db"), false)
  assert.equal(isMysqlDatabaseUrl(""), false)
})

test("parseMysqlUrl reads host user password and database", () => {
  const parsed = parseMysqlUrl("mysql://factory:s3cret@127.0.0.1:3307/factory")
  assert.deepEqual(parsed, {
    host: "127.0.0.1",
    port: 3307,
    user: "factory",
    password: "s3cret",
    database: "factory"
  })
})

test("parseMysqlUrl rejects non-mysql URLs and missing database", () => {
  assert.throws(() => parseMysqlUrl("postgres://x/y"), /mysql:\/\//)
  assert.throws(() => parseMysqlUrl("mysql://factory:factory@127.0.0.1:3306/"), /database name/)
})
