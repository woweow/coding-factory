import { readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import type { WorkflowDefinition } from "../domain/types.ts"
import { validateWorkflowDefinition } from "../domain/validate.ts"
import type { WorkflowStore } from "./port.ts"

const TEMPLATES_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../templates")

export const seedWorkflowsIfEmpty = async (store: WorkflowStore): Promise<number> => {
  const existing = await store.listWorkflows({ showDeleted: true })
  if (existing.length > 0) return 0
  const files = readdirSync(TEMPLATES_DIR)
    .filter((file) => file.endsWith(".json"))
    .sort()
  if (files.length === 0) throw new Error(`no workflow templates in ${TEMPLATES_DIR}`)
  let seeded = 0
  for (const file of files) {
    const raw = readFileSync(join(TEMPLATES_DIR, file), "utf8")
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      throw new Error(`workflow template ${file} is not valid JSON`)
    }
    const result = validateWorkflowDefinition(parsed)
    if (!result.ok) {
      const details = result.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ")
      throw new Error(`workflow template ${file} is invalid: ${details}`)
    }
    await store.insertWorkflow({ definition: parsed as WorkflowDefinition })
    seeded += 1
  }
  return seeded
}
