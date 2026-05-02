import { createClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import Link from "next/link"
import {
  addAnnotation,
  deleteAnnotation,
  deleteObject,
  startTracking,
  stopTracking,
  summarizeObject,
} from "@/app/dashboard/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Field, FieldLabel, FieldGroup } from "@/components/ui/field"
import { ArrowLeft, ExternalLink, Sparkles, Trash2, Bell, BellOff } from "lucide-react"
import { ObjectMedia, type Media } from "@/components/dashboard/object-media"
import { ObjectPostCard, type Media2 } from "@/components/dashboard/object-post-card"

export const dynamic = "force-dynamic"

export default async function ObjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: object } = await supabase
    .from("objects")
    .select("*")
    .eq("id", id)
    .maybeSingle()
  if (!object) notFound()

  const [{ data: annotations }, { data: tracked }] = await Promise.all([
    supabase
      .from("annotations")
      .select("*")
      .eq("object_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("tracked_objects").select("*").eq("object_id", id).maybeSingle(),
  ])

  const attributes = (object.attributes ?? {}) as Record<string, unknown>

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-8 md:px-8">
      <div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All objects
        </Link>
      </div>

      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">{object.domain}</span>
          {object.semantic_type ? (
            <span className="rounded-full border border-border bg-muted px-2 py-0.5 font-mono text-xs">
              {object.semantic_type}
            </span>
          ) : null}
          {tracked ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 font-mono text-xs">
              <Bell className="h-3 w-3" />
              Tracking
            </span>
          ) : null}
          {object.selector_kind === "pattern" && object.pattern_count ? (
            <span
              className="rounded-full border border-border bg-muted px-2 py-0.5 font-mono text-xs"
              title={object.selector ?? ""}
            >
              pattern · {object.pattern_count} matches
            </span>
          ) : null}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-balance md:text-3xl">
          {object.title || object.url}
        </h1>
        <a
          href={object.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-fit items-center gap-1 break-all font-mono text-xs text-muted-foreground hover:text-foreground"
        >
          {object.url}
          <ExternalLink className="h-3 w-3 shrink-0" />
        </a>
      </header>

      <section className="flex flex-wrap gap-2">
        <form
          action={async () => {
            "use server"
            await summarizeObject(object.id)
          }}
        >
          <Button type="submit" size="sm" className="gap-2">
            <Sparkles className="h-3.5 w-3.5" />
            {object.summary ? "Re-summarize" : "Summarize"}
          </Button>
        </form>
        {tracked ? (
          <form
            action={async () => {
              "use server"
              await stopTracking(object.id)
            }}
          >
            <Button type="submit" size="sm" variant="outline" className="gap-2">
              <BellOff className="h-3.5 w-3.5" />
              Stop tracking
            </Button>
          </form>
        ) : null}
        <form
          action={async () => {
            "use server"
            await deleteObject(object.id)
          }}
        >
          <Button type="submit" size="sm" variant="ghost" className="gap-2 text-muted-foreground">
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>
        </form>
      </section>

      {/* Single unified saved-object card. */}
      {/*                                                              */}
      {/* The captured screenshot is the card's thumbnail (no separate */}
      {/* "Screenshot" section any more). The post body is rendered    */}
      {/* from the LLM-cleaned `media.extracted` payload when present, */}
      {/* falling back to the deterministic media-2 fields. The live   */}
      {/* DOM snapshot is folded into the SAME card as a collapsible   */}
      {/* "Show original snapshot" panel — one element on the page,    */}
      {/* not three. We always render it: even when nothing was        */}
      {/* extractable, the card still serves as the "Open" CTA + the   */}
      {/* snapshot toggle.                                             */}
      <ObjectPostCard
        media={(object.media as Media2 | null) ?? ({} as Media2)}
        sourceUrl={object.url as string}
        screenshotPath={(object.screenshot_url as string | null) || null}
        html={(object.html as string | null) || null}
      />

      {/* Flat-resource list (every captured link/image/video on the   */}
      {/* page). Useful for scraping debugging; collapsed below the    */}
      {/* hero card. Skipped entirely for media-2 rows where the post  */}
      {/* card already shows everything the user cares about.          */}
      {object.media &&
      (object.media as Media2).__schema !== "media-2" &&
      Object.keys(object.media as Record<string, unknown>).length > 0 ? (
        <ObjectMedia media={object.media as Media} />
      ) : null}

      {object.summary ? (
        <section className="rounded-lg border border-border bg-secondary/30 p-4">
          <p className="mb-2 font-mono text-xs uppercase tracking-wide text-muted-foreground">Summary</p>
          <p className="text-sm leading-relaxed text-foreground">{object.summary}</p>
        </section>
      ) : null}

      <section>
        <p className="mb-3 font-mono text-xs uppercase tracking-wide text-muted-foreground">Attributes</p>
        {Object.keys(attributes).length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
            No structured attributes were extracted for this object.
          </p>
        ) : (
          <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-2">
            {Object.entries(attributes).map(([k, v]) => (
              <div key={k} className="flex flex-col gap-1 bg-background p-3">
                <dt className="font-mono text-xs text-muted-foreground">{k}</dt>
                <dd className="break-words text-sm text-foreground">{String(v)}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      {object.text ? (
        <section>
          <p className="mb-3 font-mono text-xs uppercase tracking-wide text-muted-foreground">Captured text</p>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-muted p-4 font-mono text-xs leading-relaxed text-muted-foreground">
            {String(object.text).slice(0, 8000)}
          </pre>
        </section>
      ) : null}

      <section className="rounded-lg border border-border bg-background p-4">
        <p className="mb-3 font-mono text-xs uppercase tracking-wide text-muted-foreground">
          {tracked ? "Tracking" : "Track changes"}
        </p>
        <form action={startTracking} className="flex flex-col gap-3 md:flex-row md:items-end">
          <input type="hidden" name="object_id" value={object.id} />
          <FieldGroup className="flex-1">
            <Field>
              <FieldLabel htmlFor="fields">Fields (comma-separated)</FieldLabel>
              <Input
                id="fields"
                name="fields"
                placeholder="price, in_stock"
                defaultValue={(tracked?.fields ?? []).join(", ")}
              />
            </Field>
          </FieldGroup>
          <div className="flex flex-col gap-1">
            <Label htmlFor="interval_minutes" className="text-sm">
              Interval (min)
            </Label>
            <Input
              id="interval_minutes"
              name="interval_minutes"
              type="number"
              min={15}
              defaultValue={tracked?.interval_minutes ?? 1440}
              className="w-32"
            />
          </div>
          <Button type="submit" size="sm" className="gap-2">
            <Bell className="h-3.5 w-3.5" />
            {tracked ? "Update" : "Start tracking"}
          </Button>
        </form>
      </section>

      <section>
        <p className="mb-3 font-mono text-xs uppercase tracking-wide text-muted-foreground">Annotations</p>
        <form action={addAnnotation} className="mb-4 flex flex-col gap-3 rounded-lg border border-border bg-background p-4">
          <input type="hidden" name="object_id" value={object.id} />
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="field">Field (optional)</FieldLabel>
              <Input id="field" name="field" placeholder="price, title, ..." />
            </Field>
            <Field>
              <FieldLabel htmlFor="body">Note</FieldLabel>
              <textarea
                id="body"
                name="body"
                required
                rows={3}
                className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                placeholder="Add a note about this object..."
              />
            </Field>
          </FieldGroup>
          <div>
            <Button type="submit" size="sm">
              Add annotation
            </Button>
          </div>
        </form>

        {(annotations ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No annotations yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {(annotations ?? []).map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-3 rounded-lg border border-border bg-background p-3">
                <div className="flex flex-col gap-1">
                  {a.field ? (
                    <span className="w-fit rounded-full border border-border bg-muted px-2 py-0.5 font-mono text-xs">
                      {a.field}
                    </span>
                  ) : null}
                  <p className="text-sm text-foreground">{a.body}</p>
                  <span className="font-mono text-xs text-muted-foreground">
                    {new Date(a.created_at).toLocaleString()}
                  </span>
                </div>
                <form
                  action={async () => {
                    "use server"
                    await deleteAnnotation(a.id, object.id)
                  }}
                >
                  <Button type="submit" size="sm" variant="ghost" className="text-muted-foreground">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
