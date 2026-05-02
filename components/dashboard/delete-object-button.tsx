"use client"

import { useTransition } from "react"
import { Trash2 } from "lucide-react"
import { deleteObject } from "@/app/dashboard/actions"
import { cn } from "@/lib/utils"

/**
 * Small per-card delete affordance for the Saved list.
 *
 * The Saved card is rendered as a `<Link>` that wraps the whole card,
 * so a nested `<form>` or `<button>` inside it would be invalid HTML
 * (no buttons inside anchors). This component is rendered as a sibling
 * of the link inside the same `<li>` and uses absolute positioning to
 * float over the top-right corner. Pointer events on the wrapper are
 * scoped tightly so the rest of the card area stays clickable.
 *
 * Behaviour:
 * - Hover-revealed on desktop, always visible on touch screens.
 * - One-tap with native `confirm()` — keeps the UI footprint tiny.
 * - Uses `useTransition` to show a subtle spinner state and avoid
 *   stacking duplicate delete requests if the user mashes the button.
 */
export function DeleteObjectButton({
  id,
  title,
}: {
  id: string
  title: string
}) {
  const [isPending, startTransition] = useTransition()

  function handleClick(e: React.MouseEvent) {
    // The card is an `<a>` (Link). Stop the click from bubbling up so
    // the user doesn't get navigated to the detail page when they
    // intend to delete.
    e.preventDefault()
    e.stopPropagation()
    if (isPending) return
    const ok = window.confirm(`Delete "${title}"? This cannot be undone.`)
    if (!ok) return
    startTransition(async () => {
      await deleteObject(id)
    })
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={`Delete ${title}`}
      title="Delete"
      disabled={isPending}
      className={cn(
        "absolute right-2 top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-md",
        "border border-border bg-background/90 text-muted-foreground shadow-sm backdrop-blur",
        "transition-all hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
        // Always show on touch — there's no hover affordance there.
        "[@media(hover:none)]:opacity-100",
        isPending && "cursor-wait opacity-60",
      )}
    >
      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="sr-only">Delete</span>
    </button>
  )
}
