import { WorkflowEditorForm } from "@/components/WorkflowEditorForm"

const emptyTemplate = `{
  "name": "new-workflow",
  "entry": "only",
  "agent": {
    "model": { "id": "composer-2.5", "params": [{ "id": "fast", "value": "false" }] },
    "cloud": {
      "repos": [{ "url": "https://github.com/woweow/coding-factory", "startingRef": "main" }]
    }
  },
  "steps": [{ "id": "only", "routes": [] }]
}
`

export default function NewWorkflowPage() {
  return (
    <div>
      <h1>Create workflow</h1>
      <p className="muted">Paste a workflow JSON document and submit. The editor is a stand-in for a future builder.</p>
      <WorkflowEditorForm mode="create" initialJson={emptyTemplate} />
    </div>
  )
}
