import { createClient } from "@/lib/supabase/server"
import Link from "next/link"
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyMedia, EmptyContent } from "@/components/ui/empty"
import { Button } from "@/components/ui/button"
import { Bookmark, ExternalLink } from "lucide-react"
import { DeleteObjectButton } from "@/components/dashboard/delete-object-button"

export const dynamic = "force-dynamic"

// User-facing name is "Saved" (everything you've saved from the web).
// The internal table / API name remains `objects` — renaming the table
// would ripple through too many call sites for a copy change.
export default async function SavedPage() {
  const supabase = await createClient()
  const { data: objects } = await supabase
    .from("objects")
    .select("id, title, url, domain, semantic_type, summary, tags, created_at, screenshot_url")
    .order("created_at", { ascending: false })
    .limit(100)

  const list = objects ?? []

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-8">
      <header className="flex flex-col gap-2">
        <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">Workspace</p>
        <h1 className="text-2xl font-semibold tracking-tight">Saved</h1>
        <p className="text-sm text-muted-foreground">
          Everything you&apos;ve saved from the web. Click an item to view details, annotate, summarize, or track.
        </p>
      </header>

      {list.length === 0 ? (
        <Empty className="border border-dashed border-border bg-background">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Bookmark className="h-5 w-5" />
            </EmptyMedia>
            <EmptyTitle>Nothing saved yet</EmptyTitle>
            <EmptyDescription>
              Install the extension and use the floating toolbar on any page to save your first item.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild size="sm">
              <Link href="/dashboard/settings">Get extension</Link>
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {list.map((o) => (
            // `group` and `relative` live on the <li> so the
            // DeleteObjectButton (a sibling of the link, not a child —
            // nesting <button> inside <a> is invalid HTML) can float
            // in the corner and reveal on hover via group-hover.
            <li key={o.id} className="group relative">
              <Link
                href={`/dashboard/objects/${o.id}`}
                className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-background transition-colors hover:bg-secondary/40"
              >
                {o.screenshot_url ? (
                  <div className="aspect-[16/9] w-full overflow-hidden border-b border-border bg-muted/30">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/v1/blob/get?path=${encodeURIComponent(o.screenshot_url)}`}
                      alt={`Screenshot of ${o.title || o.url}`}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover object-top"
                    />
                  </div>
                ) : null}
                <div className="flex h-full flex-col gap-3 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{o.domain}</span>
                    {o.semantic_type ? (
                      <span className="rounded-full border border-border bg-muted px-2 py-0.5 font-mono text-xs">
                        {o.semantic_type}
                      </span>
                    ) : null}
                  </div>
                  <h3 className="line-clamp-2 text-sm font-medium leading-snug text-foreground">
                    {o.title || o.url}
                  </h3>
                  {o.summary ? (
                    <p className="line-clamp-3 text-sm text-muted-foreground">{o.summary}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">No summary yet.</p>
                  )}
                  <div className="mt-auto flex items-center justify-between text-xs text-muted-foreground">
                    <span>{new Date(o.created_at).toLocaleDateString()}</span>
                    <span className="inline-flex items-center gap-1 group-hover:text-foreground">
                      Open <ExternalLink className="h-3 w-3" />
                    </span>
                  </div>
                </div>
              </Link>
              <DeleteObjectButton id={o.id} title={o.title || o.url || "this item"} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
