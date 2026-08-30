export type RunStepView = {
  id: string
  stepId: string
  status: string
  output: string | null
}

export type RunView = {
  id: string
  workflowId: string
  cursorAgentId: string | null
  currentStepId: string | null
  state: string
  steps: RunStepView[]
}
