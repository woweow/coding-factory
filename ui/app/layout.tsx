import type { Metadata } from "next"
import Link from "next/link"
import type { ReactNode } from "react"
import "./globals.css"

export const metadata: Metadata = {
  title: "coding-factory",
  description: "Workflow JSON UI over factory RPC"
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header>
          <Link href="/">coding-factory</Link>
          <Link href="/workflows/new">New workflow</Link>
        </header>
        <main>{children}</main>
      </body>
    </html>
  )
}
