/**
 * Terminal input adapter — stands in for a UI. Not part of the graph runtime.
 */
import * as readline from "node:readline"
import { stdin, stdout } from "node:process"
import type { HumanInputRequest } from "./graph-node-routes.ts"

const readPipedLines = (): Promise<string[]> =>
  new Promise((resolve) => {
    if (stdin.isTTY) {
      resolve([])
      return
    }
    const lines: string[] = []
    let buffer = ""
    const onData = (chunk: Buffer | string) => {
      buffer += chunk.toString()
      let newline = buffer.indexOf("\n")
      while (newline >= 0) {
        lines.push(buffer.slice(0, newline).trim())
        buffer = buffer.slice(newline + 1)
        newline = buffer.indexOf("\n")
      }
    }
    const onEnd = () => {
      stdin.off("data", onData)
      if (buffer.trim()) lines.push(buffer.trim())
      resolve(lines)
    }
    stdin.on("data", onData)
    stdin.on("end", onEnd)
    stdin.resume()
  })

let pipedLines: string[] | undefined

const nextLine = async (): Promise<string> => {
  if (pipedLines === undefined) pipedLines = await readPipedLines()
  if (!stdin.isTTY) {
    const line = pipedLines.shift()
    if (line === undefined) throw new Error("stdin closed before input")
    return line
  }
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: stdin, output: stdout })
    rl.question("", (answer) => {
      rl.close()
      resolve(answer)
    })
  })
}

export const promptTerminal = async (request: HumanInputRequest): Promise<string> => {
  console.log(`\n  awaiting input: ${request.message}`)
  stdout.write("  you: ")
  return nextLine()
}
