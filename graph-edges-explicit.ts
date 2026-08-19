/**
 * Option 2: Edge-explicit routing.
 * Branching is still inferred by >1 outgoing edges, but each edge carries
 * an explicit `match` object describing how to route from agent output.
 */

export type ExplicitNode = {
  id: string
  terminal?: boolean
  systemPrompt?: string
}

export type OutputMatch =
  | { kind: "always" }
  | { kind: "equals"; key: string; value: string }

export type ExplicitEdge = {
  id: string
  from: string
  to: string
  prompt: string
  match: OutputMatch
}

export type ExplicitGraph = {
  name: string
  entry: string
  nodes: ExplicitNode[]
  edges: ExplicitEdge[]
}

export const linearExplicitGraph: ExplicitGraph = {
  name: "LinearExplicitGraph",
  entry: "implementer",
  nodes: [
    { id: "implementer", systemPrompt: "You implement code changes." },
    { id: "reviewer", systemPrompt: "You review code changes." },
    { id: "complete", terminal: true, systemPrompt: "Workflow complete." }
  ],
  edges: [
    {
      id: "e1",
      from: "implementer",
      to: "reviewer",
      prompt: "Implement this feature request.",
      match: { kind: "always" }
    },
    {
      id: "e2",
      from: "reviewer",
      to: "complete",
      prompt: "Create PR for this implementation.",
      match: { kind: "always" }
    }
  ]
}

export const branchExplicitGraph: ExplicitGraph = {
  name: "BranchExplicitGraph",
  entry: "implementer",
  nodes: [
    { id: "implementer", systemPrompt: "You implement code changes." },
    { id: "reviewer", systemPrompt: "You review and decide pass/fix." },
    { id: "complete", terminal: true, systemPrompt: "Feature completed." },
    { id: "fix", systemPrompt: "You fix issues from review." }
  ],
  edges: [
    {
      id: "e1",
      from: "implementer",
      to: "reviewer",
      prompt: "Implement this feature request.",
      match: { kind: "always" }
    },
    {
      id: "e2",
      from: "reviewer",
      to: "complete",
      prompt: "Passes review? Output decision=PASS or decision=FIX.",
      match: { kind: "equals", key: "decision", value: "PASS" }
    },
    {
      id: "e3",
      from: "reviewer",
      to: "fix",
      prompt: "Passes review? Output decision=PASS or decision=FIX.",
      match: { kind: "equals", key: "decision", value: "FIX" }
    },
    {
      id: "e4",
      from: "fix",
      to: "reviewer",
      prompt: "Fix the issues and resubmit.",
      match: { kind: "always" }
    }
  ]
}
