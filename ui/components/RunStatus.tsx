"use client"

import { useEffect, useState } from "react"
import { getRunAction } from "@/app/actions"
import type { RunView } from "@/lib/types"

const terminal = new Set(["completed", "failed", "cancelled"])

export function RunStatus({ initial }: { initial: RunView }) {
  const [run, setRun] = useState(initial)

  useEffect(() => {
    if (terminal.has(run.state)) return
    const timer = setInterval(() => {
      void getRunAction(run.id).then((result) => {
        if (result.ok) setRun(result.data)
      })
    }, 500)
    return () => clearInterval(timer)
  }, [run.id, run.state])

  return (
    <div>
      <p>
        Run <code data-testid="run-id">{run.id}</code>
      </p>
      <p>
        State: <strong data-testid="run-state">{run.state}</strong>
      </p>
      <p className="muted">
        workflow {run.workflowId}
        {run.currentStepId ? ` · step ${run.currentStepId}` : ""}
        {run.cursorAgentId ? ` · agent ${run.cursorAgentId}` : ""}
      </p>
      <div className="panel">
        <h2>Steps</h2>
        {run.steps.length === 0 ? (
          <p className="muted">No steps yet.</p>
        ) : (
          <ol data-testid="run-steps">
            {run.steps.map((step) => (
              <li key={step.id}>
                <code>{step.stepId}</code> — {step.status}
                {step.output ? <pre>{step.output}</pre> : null}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}
