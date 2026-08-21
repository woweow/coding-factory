export async function implement(ticket: string): Promise<string> {
  return `implemented: ${ticket}`
}

export async function verify(work: string): Promise<string> {
  return `verified: ${work}`
}
