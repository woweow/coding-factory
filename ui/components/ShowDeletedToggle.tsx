import Link from "next/link"

export function ShowDeletedToggle({ checked }: { checked: boolean }) {
  return (
    <Link
      href={checked ? "/" : "/?showDeleted=true"}
      data-testid="show-deleted"
      data-checked={checked ? "true" : "false"}
    >
      {checked ? "Hide deleted" : "Show deleted"}
    </Link>
  )
}
