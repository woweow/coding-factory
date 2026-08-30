import type { NextConfig } from "next"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const uiDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(uiDir, "..")

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  outputFileTracingRoot: repoRoot,
  serverExternalPackages: [
    "@temporalio/client",
    "@temporalio/worker",
    "@temporalio/workflow",
    "@temporalio/activity",
    "@temporalio/common",
    "@temporalio/proto",
    "@temporalio/core-bridge",
    "@temporalio/envconfig",
    "mysql2",
    "@grpc/grpc-js",
    "@cursor/sdk"
  ],
  webpack: (config) => {
    const resolve = config.resolve ?? {}
    resolve.extensionAlias = {
      ...(resolve.extensionAlias ?? {}),
      ".ts": [".ts", ".tsx", ".js"],
      ".js": [".js", ".ts"]
    }
    resolve.extensions = [".ts", ".tsx", ".js", ".jsx", ".json", ...(resolve.extensions ?? [])]
    resolve.alias = {
      ...(resolve.alias ?? {}),
      "@factory": join(repoRoot, "src"),
      "@": uiDir
    }
    config.resolve = resolve
    return config
  }
}

export default nextConfig
