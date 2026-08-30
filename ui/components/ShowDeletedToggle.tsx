"use client"

import { useRouter } from "next/navigation"

export function ShowDeletedToggle({ checked }: { checked: boolean }) {
  const router = useRouter()
  return (
    <label>
      <input
        type="checkbox"
        data-testid="show-deleted"
        checked={checked}
        onChange={(event) => {
          const next = event.target.checked
          router.push(next ? "/?showDeleted=true" : "/")
        }}
      />
      Show deleted
    </label>
  )
}
