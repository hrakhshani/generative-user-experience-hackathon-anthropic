import { authenticateToken, jsonResponse, preflight, unauthorized } from "@/lib/auth/token"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"

const ALLOWED_KINDS = new Set([
  "badge",
  "hide",
  "outline",
  "note",
  "save_button",
  "custom",
  "translate",
  "filter",
  "summarize",
  "rank",
  // Comparison rule: injects checkboxes onto matched cards plus a docked
  // comparison bar; calls /api/v1/compare-text with the selection and
  // renders the response as a side-by-side table modal.
  "compare",
  // Grammar-check rule: injects a "Fix grammar" button on each matched
  // card; clicking sends the visible text fragments to /grammar-check
  // and replaces each text node with the corrected version (toggle to
  // revert). Pinned to gpt-4o-mini for fast minimum-edit corrections.
  "grammar_check",
  // Visual-search rule: page-level. Mounts a floating "Search by image"
  // pill; user uploads an image, we send it to /api/v1/visual-search
  // (gpt-4o-mini vision) which returns a SHORT search query, and we
  // type that query into the host page's primary search bar and submit.
  // No card scoring — the rule just turns an image into a text search
  // and lets the host site's own search engine handle the rest.
  "visual_search",
])

export async function OPTIONS() {
  return preflight()
}

export async function GET(request: Request) {
  const auth = await authenticateToken(request.headers.get("authorization"))
  if (!auth) return unauthorized()

  const url = new URL(request.url)
  const domain = url.searchParams.get("domain")
  const supabase = createAdminClient()

  let query = supabase
    .from("page_rules")
    .select("*")
    .eq("user_id", auth.userId)
    .order("created_at", { ascending: false })

  if (domain) {
    // Match both with and without the `www.` prefix so a rule saved on
    // `www.nike.com` still applies when the user lands on `nike.com`
    // (and vice versa). Without this, the same site effectively behaves
    // like two separate domains depending on how the user reached it.
    const stripped = domain.replace(/^www\./i, "")
    const candidates = Array.from(new Set([domain, stripped, `www.${stripped}`]))
    query = query.in("domain", candidates).eq("enabled", true)
  }

  const { data, error } = await query
  if (error) return jsonResponse({ error: error.message }, { status: 500 })
  return jsonResponse({ rules: data })
}

export async function POST(request: Request) {
  const auth = await authenticateToken(request.headers.get("authorization"))
  if (!auth) return unauthorized()

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return jsonResponse({ error: "Invalid JSON body" }, { status: 400 })
  }

  const domain = String(body.domain ?? "").slice(0, 253).toLowerCase()
  const selector = String(body.selector ?? "").slice(0, 2000)
  const kind = String(body.kind ?? "")
  if (!domain) return jsonResponse({ error: "domain is required" }, { status: 400 })
  if (!selector) return jsonResponse({ error: "selector is required" }, { status: 400 })
  if (!ALLOWED_KINDS.has(kind)) {
    return jsonResponse({ error: `kind must be one of: ${[...ALLOWED_KINDS].join(", ")}` }, { status: 400 })
  }

  const row = {
    user_id: auth.userId,
    name: typeof body.name === "string" ? body.name.slice(0, 200) : null,
    domain,
    selector,
    kind,
    config: body.config && typeof body.config === "object" ? body.config : {},
    enabled: body.enabled === false ? false : true,
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase.from("page_rules").insert(row).select("*").single()
  if (error) return jsonResponse({ error: error.message }, { status: 500 })
  return jsonResponse({ rule: data }, { status: 201 })
}
