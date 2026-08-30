import { openWorkflowStore } from "../storage/open.ts"
import { seedWorkflowsIfEmpty } from "../storage/seed.ts"
import { startFactoryRun } from "../temporal/start.ts"
import { createFactoryService, type FactoryService, type StartRunFn } from "./factory.ts"
import { loadOnce } from "./once.ts"
import type { WorkflowStore } from "../storage/port.ts"

let servicePromise: Promise<FactoryService> | undefined

export const createBoundFactoryService = (
  store: WorkflowStore,
  startRun?: StartRunFn
): FactoryService => createFactoryService(store, startRun)

export const getFactoryService = async (): Promise<FactoryService> =>
  loadOnce(
    () => servicePromise,
    (pending) => {
      servicePromise = pending
    },
    async () => {
      const { store } = await openWorkflowStore()
      await seedWorkflowsIfEmpty(store)
      return createFactoryService(store, startFactoryRun)
    }
  )
