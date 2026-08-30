import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const isFactoryRoot = (dir: string): boolean =>
  existsSync(join(dir, "src/storage/schema.sql")) && existsSync(join(dir, "templates"))

const walkForRoot = (start: string): string | undefined => {
  let dir = start
  for (let i = 0; i < 12; i++) {
    if (isFactoryRoot(dir)) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return undefined
}

export const factoryRoot = (): string => {
  const fromEnv = process.env.FACTORY_ROOT?.trim()
  if (fromEnv) return fromEnv
  const fromModule = walkForRoot(dirname(fileURLToPath(import.meta.url)))
  if (fromModule) return fromModule
  const fromCwd = walkForRoot(process.cwd())
  if (fromCwd) return fromCwd
  throw new Error("cannot locate coding-factory repo root (src/storage/schema.sql)")
}

export const factoryPath = (...segments: string[]): string => join(factoryRoot(), ...segments)

export const readFactoryFile = (...segments: string[]): string => readFileSync(factoryPath(...segments), "utf8")
