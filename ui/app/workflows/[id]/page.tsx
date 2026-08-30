import { notFound } from "next/navigation"
import Link from "next/link"
import { getFactoryRpc } from "@factory/rpc/factory"
import { WorkflowEditorForm } from "@/components/WorkflowEditorForm"
import { WorkflowActions } from "@/components/WorkflowActions"

export const dynamic = "force-dynamic"

const pretty = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`

export default async function WorkflowPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ showDeleted?: string }>
}) {
  const { id } = await params
  const query = await searchParams
  const showDeleted = query.showDeleted === "true"
  const rpc = await getFactoryRpc()
  const result = await rpc.getWorkflow({ id, showDeleted })
  if (!result.ok) notFound()
  const workflow = result.data
  const runs = await rpc.listRuns({ workflowId: id, showDeleted })
  return (
    <div>
      <h1 data-testid="workflow-name">{workflow.name}</h1>
      <p className="muted">
        <code data-testid="workflow-id">{workflow.id}</code>
        {workflow.deletedAt ? ` · deleted ${workflow.deletedAt}` : ""}
      </p>
      {workflow.deletedAt ? null : <WorkflowActions id={workflow.id} />}
      <div className="panel">
        <h2>Definition</h2>
        <WorkflowEditorForm mode="edit" workflowId={workflow.id} initialJson={pretty(workflow.definition)} />
      </div>
      <div className="panel">
        <h2>Runs</h2>
        {!runs.ok ? (
          <p className="error">{runs.error.message}</p>
        ) : runs.data.length === 0 ? (
          <p className="muted">No runs.</p>
        ) : (
          <ul data-testid="run-list">
            {runs.data.map((run) => (
              <li key={run.id}>
                <Link href={`/runs/${run.id}`}>
                  {run.id} — {run.state}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
