import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Layers, MousePointer2, Bookmark, GitCompare, Bell, MessageSquare, Sparkles, Boxes } from "lucide-react"
import { createClient } from "@/lib/supabase/server"

export default async function HomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <div className="min-h-svh bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            <span className="font-mono text-sm tracking-tight">UWAL</span>
          </Link>
          <nav className="flex items-center gap-2">
            {user ? (
              <Button asChild size="sm">
                <Link href="/dashboard">Open dashboard</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/auth/login">Sign in</Link>
                </Button>
                <Button asChild size="sm">
                  <Link href="/auth/sign-up">Get started</Link>
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>

      <main>
        <section className="border-b border-border">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-8 px-4 py-20 md:py-28">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted px-3 py-1 text-xs text-muted-foreground">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-foreground" />
              Universal Web Action Layer
            </div>
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance md:text-6xl">
              Augment any website with reusable actions.
            </h1>
            <p className="max-w-2xl text-base text-pretty text-muted-foreground md:text-lg">
              UWAL is a Chrome extension and runtime that treats every page as structured Objects. Save, compare,
              track, annotate, summarize, and extract — without writing site-specific code.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <Link href={user ? "/dashboard" : "/auth/sign-up"}>
                  {user ? "Open dashboard" : "Create workspace"}
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/dashboard/settings">Get extension</Link>
              </Button>
            </div>
            <div className="mt-2 flex items-center gap-2 font-mono text-xs text-muted-foreground">
              <MousePointer2 className="h-3.5 w-3.5" />
              <span>Floating toolbar injected on every page</span>
            </div>
          </div>
        </section>

        <section className="border-b border-border">
          <div className="mx-auto grid max-w-6xl gap-px bg-border px-0 md:grid-cols-2 lg:grid-cols-3">
            <FeatureCell
              icon={<Bookmark className="h-4 w-4" />}
              title="Save"
              body="Persist any selected element as a reusable Object — title, text, attributes, screenshot."
            />
            <FeatureCell
              icon={<GitCompare className="h-4 w-4" />}
              title="Compare"
              body="Normalize multiple Objects into a side-by-side table. Works across sites by aligning fields."
            />
            <FeatureCell
              icon={<Bell className="h-4 w-4" />}
              title="Track"
              body="Watch specific fields for changes (price, availability, text) and capture snapshots over time."
            />
            <FeatureCell
              icon={<MessageSquare className="h-4 w-4" />}
              title="Annotate"
              body="Attach notes to an Object or to one of its fields. Notes follow the Object across sessions."
            />
            <FeatureCell
              icon={<Sparkles className="h-4 w-4" />}
              title="Summarize"
              body="AI-generated 2-4 sentence summaries of any Object, persisted to your workspace."
            />
            <FeatureCell
              icon={<Boxes className="h-4 w-4" />}
              title="Extract"
              body="Heuristics + LLM convert raw page sections into typed Objects with structured attributes."
            />
          </div>
        </section>

        <section>
          <div className="mx-auto max-w-6xl px-4 py-20">
            <div className="grid gap-12 md:grid-cols-2">
              <div>
                <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">How it works</p>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight text-balance md:text-3xl">
                  Pages become Objects. Objects accept actions.
                </h2>
                <p className="mt-4 text-pretty text-muted-foreground">
                  The extension parses the DOM, visual context, and text content into Objects with a stable shape.
                  Generic actions operate on any compatible Object — no per-site logic.
                </p>
              </div>
              <pre className="overflow-x-auto rounded-lg border border-border bg-muted p-4 font-mono text-xs leading-relaxed">
                {`{
  "url": "https://example.com/p/123",
  "domain": "example.com",
  "semantic_type": "product",
  "title": "Aeron Chair (Size B)",
  "attributes": {
    "price": "$1,495",
    "rating": "4.7",
    "in_stock": "true"
  },
  "dom_path": "main > div.product > article",
  "text": "..."
}`}
              </pre>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-6 text-xs text-muted-foreground">
          <span className="font-mono">UWAL</span>
          <span>Site-agnostic, object-first, composable.</span>
        </div>
      </footer>
    </div>
  )
}

function FeatureCell({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex flex-col gap-3 bg-background p-6">
      <div className="flex items-center gap-2 text-foreground">
        {icon}
        <span className="font-mono text-xs uppercase tracking-wide">{title}</span>
      </div>
      <p className="text-sm text-pretty text-muted-foreground">{body}</p>
    </div>
  )
}
