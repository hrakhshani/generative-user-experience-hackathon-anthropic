import { createClient } from "@/lib/supabase/server"
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyMedia, EmptyContent } from "@/components/ui/empty"
import { Button } from "@/components/ui/button"
import { Wand2, Trash2 } from "lucide-react"
import { togglePageRule, deletePageRule } from "@/app/dashboard/actions"
import Link from "next/link"

export const dynamic = "force-dynamic"

type Rule = {
  id: string
  name: string | null
  domain: string
  selector: string
  kind: string
  config: Record<string, unknown> | null
  enabled: boolean
  created_at: string
}

function describeRule(r: Rule) {
  const cfg = (r.config || {}) as Record<string, unknown>
  switch (r.kind) {
    case "badge":
      return `Add badge: "${(cfg.label as string) ?? "UWAL"}"`
    case "hide":
      return "Hide all matches"
    case "outline":
      return `Outline (${(cfg.color as string) ?? "#2563eb"})`
    case "note":
      return `Add note: "${((cfg.text as string) ?? "").slice(0, 60)}"`
    case "save_button":
      return `Inject "${(cfg.label as string) ?? "Save"}" button on every match`
    case "translate":
      return `Inject Translate button (target: ${(cfg.language as string) ?? "Spanish"})`
    case "summarize":
      return `Inject "${(cfg.label as string) ?? "Summarize"}" button on every match`
    case "filter": {
      const cat = cfg.category as string | null | undefined
      return cat
        ? `Pin category bar (default: "${cat}")`
        : `Pin category bar (semantic, no default filter)`
    }
    case "custom": {
      const label = (cfg.label as string) || (r.name as string) || "Custom action"
      const instruction = (cfg.instruction as string) || ""
      return instruction ? `${label} — "${instruction.slice(0, 80)}"` : label
    }
    default:
      return r.kind
  }
}

function summarizeOps(r: Rule): string | null {
  if (r.kind !== "custom") return null
  const cfg = (r.config || {}) as Record<string, unknown>
  const ops = Array.isArray(cfg.ops) ? (cfg.ops as Array<Record<string, unknown>>) : []
  if (ops.length === 0) return null
  return ops
    .map((op) => {
      const t = String(op.type || "?")
      const el = op.element as { tag?: string; text?: string } | undefined
      if (el?.tag) return `${t} <${el.tag}>${el.text ? ` "${el.text.slice(0, 24)}"` : ""}`
      return t
    })
    .join("  ·  ")
}

export default async function RulesPage() {
  const supabase = await createClient()
  const { data } = await supabase
    .from("page_rules")
    .select("*")
    .order("created_at", { ascending: false })

  const rules = (data ?? []) as Rule[]
  const grouped = new Map<string, Rule[]>()
  for (const r of rules) {
    const arr = grouped.get(r.domain) ?? []
    arr.push(r)
    grouped.set(r.domain, arr)
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 md:px-8">
      <header className="flex flex-col gap-2">
        <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">Workspace</p>
        <h1 className="text-2xl font-semibold tracking-tight">Page rules</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Persistent decorations applied to all matching elements every time you visit a domain. Created by selecting an
          element with the extension, switching scope to <span className="font-mono text-foreground">All similar</span>,
          and choosing a modification.
        </p>
      </header>

      {rules.length === 0 ? (
        <Empty className="border border-dashed border-border bg-background">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Wand2 className="h-5 w-5" />
            </EmptyMedia>
            <EmptyTitle>No rules yet</EmptyTitle>
            <EmptyDescription>
              Open any site, pick an element, switch to{" "}
              <span className="font-mono">All similar</span>, then choose Add badge, Hide, Outline, Add note, Save
              button, Translate, or Filter.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/settings">Get extension</Link>
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="flex flex-col gap-6">
          {Array.from(grouped.entries()).map(([domain, list]) => (
            <section key={domain} className="flex flex-col gap-2">
              <h2 className="font-mono text-xs uppercase tracking-wide text-muted-foreground">{domain}</h2>
              <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-background">
                {list.map((r) => (
                  <li key={r.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="rounded-full border border-border bg-muted px-2 py-0.5 font-mono text-xs uppercase tracking-wide">
                          {r.kind}
                        </span>
                        <span className="text-sm">{describeRule(r)}</span>
                        {!r.enabled ? (
                          <span className="rounded-full border border-border px-2 py-0.5 font-mono text-xs text-muted-foreground">
                            disabled
                          </span>
                        ) : null}
                      </div>
                      <code className="truncate font-mono text-xs text-muted-foreground" title={r.selector}>
                        {r.selector}
                      </code>
                      {summarizeOps(r) ? (
                        <code className="truncate font-mono text-xs text-muted-foreground/80" title="Ops">
                          {summarizeOps(r)}
                        </code>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <form
                        action={async () => {
                          "use server"
                          await togglePageRule(r.id, !r.enabled)
                        }}
                      >
                        <Button variant="outline" size="sm" type="submit">
                          {r.enabled ? "Disable" : "Enable"}
                        </Button>
                      </form>
                      <form
                        action={async () => {
                          "use server"
                          await deletePageRule(r.id)
                        }}
                      >
                        <Button variant="ghost" size="sm" type="submit" aria-label="Delete">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
