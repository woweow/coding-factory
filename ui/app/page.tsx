import Link from "next/link"
import { getFactoryRpc } from "@factory/rpc/factory"
import { ShowDeletedToggle } from "@/components/ShowDeletedToggle"

export const dynamic = "force-dynamic"

export default async function HomePage({
  searchParams
}: {
  searchParams: Promise<{ showDeleted?: string }>
}) {
  const params = await searchParams
  const showDeleted = params.showDeleted === "true"
  const rpc = await getFactoryRpc()
  const result = await rpc.listWorkflows({ showDeleted })
  if (!result.ok) {
    return <p className="error">{result.error.message}</p>
  }
  return (
    <div>
      <div className="row">
        <h1>Workflows</h1>
        <ShowDeletedToggle checked={showDeleted} />
        <Link href="/workflows/new" className="button">
          New
        </Link>
      </div>
      <table data-testid="workflow-list">
        <thead>
          <tr>
            <th>Name</th>
            <th>Id</th>
            <th>Updated</th>
            <th>Deleted</th>
          </tr>
        </thead>
        <tbody>
          {result.data.length === 0 ? (
            <tr>
              <td colSpan={4} className="muted">
                No workflows.
              </td>
            </tr>
          ) : (
            result.data.map((row) => (
              <tr key={row.id} data-testid={`workflow-row-${row.name}`}>
                <td>
                  <Link href={`/workflows/${row.id}${showDeleted ? "?showDeleted=true" : ""}`}>{row.name}</Link>
                </td>
                <td>
                  <code>{row.id}</code>
                </td>
                <td>{row.updatedAt}</td>
                <td>{row.deletedAt ?? ""}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
