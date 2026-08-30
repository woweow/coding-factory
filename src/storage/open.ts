import { resolve } from "node:path"
import { createMysqlWorkflowStore } from "./mysql.ts"
import type { WorkflowStore } from "./port.ts"
import { createSqliteWorkflowStore } from "./sqlite.ts"

const DEFAULT_SQLITE_PATH = resolve("data/factory.db")

export const isMysqlDatabaseUrl = (databaseUrl: string): boolean =>
  databaseUrl.startsWith("mysql://") || databaseUrl.startsWith("mysql2://")

const redactMysqlUrl = (databaseUrl: string): string => {
  try {
    const parsed = new URL(databaseUrl)
    if (parsed.password) parsed.password = "***"
    return parsed.toString()
  } catch {
    return "mysql://***"
  }
}

export const openWorkflowStore = async (): Promise<{
  store: WorkflowStore
  kind: "mysql" | "sqlite"
  location: string
}> => {
  const databaseUrl = process.env.DATABASE_URL?.trim()
  if (databaseUrl) {
    if (!isMysqlDatabaseUrl(databaseUrl)) {
      throw new Error("DATABASE_URL must be a mysql:// URL")
    }
    const store = await createMysqlWorkflowStore(databaseUrl)
    return { store, kind: "mysql", location: redactMysqlUrl(databaseUrl) }
  }
  const sqlitePath = process.env.SQLITE_PATH ?? DEFAULT_SQLITE_PATH
  return { store: createSqliteWorkflowStore(sqlitePath), kind: "sqlite", location: sqlitePath }
}
