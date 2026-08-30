import { notFound } from "next/navigation"
import { getFactoryRpc } from "@factory/rpc/factory"
import { RunStatus } from "@/components/RunStatus"

export const dynamic = "force-dynamic"

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const rpc = await getFactoryRpc()
  const result = await rpc.getRun({ id })
  if (!result.ok) notFound()
  return (
    <div>
      <h1>Run</h1>
      <RunStatus initial={result.data} />
    </div>
  )
}
