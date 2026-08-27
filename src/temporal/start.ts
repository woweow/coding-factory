import { Client, Connection } from "@temporalio/client"
import { loadClientConnectConfig } from "@temporalio/envconfig"
import type { WorkflowDefinition } from "../domain/types.ts"
import { FACTORY_TASK_QUEUE } from "./shared.ts"
import { factoryWorkflow } from "./workflows.ts"

let clientPromise: Promise<Client> | undefined

const getClient = async (): Promise<Client> => {
  if (!clientPromise) {
    clientPromise = (async () => {
      const config = loadClientConnectConfig()
      const connection = await Connection.connect(config.connectionOptions)
      return new Client({ connection, namespace: config.namespace })
    })()
  }
  return clientPromise
}

export const startFactoryRun = async (input: {
  runId: string
  temporalWorkflowId: string
  definition: WorkflowDefinition
  prompt: string
}): Promise<void> => {
  const client = await getClient()
  await client.workflow.start(factoryWorkflow, {
    taskQueue: FACTORY_TASK_QUEUE,
    workflowId: input.temporalWorkflowId,
    args: [{ runId: input.runId, definition: input.definition, prompt: input.prompt }]
  })
}
