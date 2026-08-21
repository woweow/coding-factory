export type NodeWork = {
  id: string
  systemPrompt: string
  edgePrompt: string
  choices: string[]
}

export async function runNode(work: NodeWork): Promise<string> {
  console.log(`  ${work.id}: ${work.systemPrompt} | ${work.edgePrompt}`)
  return work.choices[0] ?? "done"
}
