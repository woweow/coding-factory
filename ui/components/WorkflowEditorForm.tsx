"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { WorkflowJsonEditor } from "@/components/WorkflowJsonEditor"
import { createWorkflowAction, updateWorkflowAction } from "@/app/actions"

type WorkflowEditorFormProps = {
  mode: "create" | "edit"
  workflowId?: string
  initialJson: string
  readOnly?: boolean
}

export function WorkflowEditorForm({
  mode,
  workflowId,
  initialJson,
  readOnly = false
}: WorkflowEditorFormProps) {
  const router = useRouter()
  const [jsonText, setJsonText] = useState(initialJson)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const onSubmit = async () => {
    setPending(true)
    setError(null)
    const result =
      mode === "create"
        ? await createWorkflowAction(jsonText)
        : await updateWorkflowAction(workflowId ?? "", jsonText)
    setPending(false)
    if (!result.ok) {
      const details = result.error.details?.map((issue) => `${issue.path}: ${issue.message}`).join("\n")
      setError(details ? `${result.error.message}\n${details}` : result.error.message)
      return
    }
    if (mode === "create" && "id" in result.data) {
      router.push(`/workflows/${result.data.id}`)
      return
    }
    router.refresh()
  }

  return (
    <div>
      <WorkflowJsonEditor value={jsonText} onChange={setJsonText} readOnly={readOnly} />
      {readOnly ? (
        <p className="muted">This workflow is deleted and cannot be saved.</p>
      ) : (
        <div className="row">
          <button
            type="button"
            className="primary"
            data-testid="save-workflow"
            disabled={pending}
            onClick={() => void onSubmit()}
          >
            {mode === "create" ? "Create" : "Save"}
          </button>
        </div>
      )}
      {error ? (
        <p className="error" data-testid="form-error">
          {error}
        </p>
      ) : null}
    </div>
  )
}
