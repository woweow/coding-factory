import { readdirSync } from "node:fs"
import type { WorkflowDefinition } from "../domain/types.ts"
import { parseWorkflowDefinition } from "../business/definition.ts"
import { factoryPath, readFactoryFile } from "../paths.ts"
import type { WorkflowStore } from "./port.ts"

export const seedWorkflowsIfEmpty = async (store: WorkflowStore): Promise<number> => {
  const existing = await store.listWorkflows({ showDeleted: true })
  if (existing.length > 0) return 0
  const templatesDir = factoryPath("templates")
  const files = readdirSync(templatesDir)
    .filter((file) => file.endsWith(".json"))
    .sort()
  if (files.length === 0) throw new Error(`no workflow templates in ${templatesDir}`)
  let seeded = 0
  for (const file of files) {
    const raw = readFactoryFile("templates", file)
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      throw new Error(`workflow template ${file} is not valid JSON`)
    }
    const result = parseWorkflowDefinition(parsed)
    if (!result.ok) {
      const details = result.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ")
      throw new Error(`workflow template ${file} is invalid: ${details}`)
    }
    await store.insertWorkflow({ definition: parsed as WorkflowDefinition })
    seeded += 1
  }
  return seeded
}
