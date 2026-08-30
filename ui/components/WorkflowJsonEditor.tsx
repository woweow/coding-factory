"use client"

type WorkflowJsonEditorProps = {
  id?: string
  name?: string
  value: string
  onChange?: (value: string) => void
  readOnly?: boolean
  rows?: number
}

/** Isolated editor surface. Swap this component for a workflow-builder library later. */
export function WorkflowJsonEditor({
  id = "workflow-json",
  name = "definition",
  value,
  onChange,
  readOnly = false,
  rows = 22
}: WorkflowJsonEditorProps) {
  return (
    <textarea
      id={id}
      name={name}
      data-testid="json-editor"
      value={value}
      readOnly={readOnly}
      rows={rows}
      spellCheck={false}
      onChange={onChange ? (event) => onChange(event.target.value) : undefined}
      style={{
        width: "100%",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: "0.85rem",
        padding: "0.5rem"
      }}
    />
  )
}
