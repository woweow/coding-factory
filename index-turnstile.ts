import { promptTerminal } from "./cli.ts"
import { launchTurnstile } from "./turnstile-human-pattern.ts"

await launchTurnstile("Coin inserted.", promptTerminal)
