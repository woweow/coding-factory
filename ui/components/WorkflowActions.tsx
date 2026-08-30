"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { deleteWorkflowAction, startRunAction } from "@/app/actions"

export function WorkflowActions({ id }: { id: string }) {
  const router = useRouter()
  const [prompt, setPrompt] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const onDelete = async () => {
    setPending(true)
    setError(null)
    const result = await deleteWorkflowAction(id)
    setPending(false)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    router.push("/")
    router.refresh()
  }

  const onRun = async () => {
    setPending(true)
    setError(null)
    const result = await startRunAction(id, prompt)
    setPending(false)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    router.push(`/runs/${result.data.id}`)
  }

  return (
    <div>
      <div className="row">
        <input
          data-testid="run-prompt"
          placeholder="prompt (optional)"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
        />
        <button type="button" className="primary" data-testid="run-workflow" disabled={pending} onClick={() => void onRun()}>
          Run
        </button>
        <button type="button" data-testid="delete-workflow" disabled={pending} onClick={() => void onDelete()}>
          Delete
        </button>
      </div>
      {error ? (
        <p className="error" data-testid="action-error">
          {error}
        </p>
      ) : null}
    </div>
  )
}
