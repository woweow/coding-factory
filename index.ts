import { runBranchGraph } from "./temporal/client.ts"

const path = await runBranchGraph("Implement this feature request.")
console.log(path.join(" -> "))
