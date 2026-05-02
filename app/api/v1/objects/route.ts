import { authenticateToken, jsonResponse, preflight, unauthorized } from "@/lib/auth/token"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"

export async function OPTIONS() {
  return preflight()
}

// List objects
export async function GET(request: Request) {
  const auth = await authenticateToken(request.headers.get("authorization"))
  if (!auth) return unauthorized()

  const url = new URL(request.url)
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200)
  const domain = url.searchParams.get("domain")
  const semanticType = url.searchParams.get("type")

  const supabase = createAdminClient()
  let query = supabase
    .from("objects")
    .select("*")
    .eq("user_id", auth.userId)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (domain) query = query.eq("domain", domain)
  if (semanticType) query = query.eq("semantic_type", semanticType)

  const { data, error } = await query
  if (error) return jsonResponse({ error: error.message }, { status: 500 })
  return jsonResponse({ objects: data })
}

// Save action: persist a new object extracted from a page.
export async function POST(request: Request) {
  const auth = await authenticateToken(request.headers.get("authorization"))
  if (!auth) return unauthorized()

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return jsonResponse({ error: "Invalid JSON body" }, { status: 400 })
  }

  const url = String(body.url ?? "").slice(0, 2048)
  if (!url) return jsonResponse({ error: "url is required" }, { status: 400 })

  let domain = ""
  try {
    domain = new URL(url).hostname
  } catch {
    return jsonResponse({ error: "Invalid url" }, { status: 400 })
  }

  const row = {
    user_id: auth.userId,
    url,
    domain,
    title: typeof body.title === "string" ? body.title.slice(0, 500) : null,
    text: typeof body.text === "string" ? body.text.slice(0, 50_000) : null,
    html: typeof body.html === "string" ? body.html.slice(0, 1_600_000) : null,
    attributes: body.attributes && typeof body.attributes === "object" ? body.attributes : {},
    dom_path: typeof body.dom_path === "string" ? body.dom_path.slice(0, 2000) : null,
    semantic_type: typeof body.semantic_type === "string" ? body.semantic_type.slice(0, 64) : null,
    screenshot_url: typeof body.screenshot_url === "string" ? body.screenshot_url.slice(0, 2048) : null,
    media: body.media && typeof body.media === "object" && !Array.isArray(body.media) ? body.media : {},
    tags: Array.isArray(body.tags) ? body.tags.filter((t: unknown) => typeof t === "string").slice(0, 32) : [],
    selector: typeof body.selector === "string" ? body.selector.slice(0, 2000) : null,
    selector_kind:
      body.selector_kind === "pattern" || body.selector_kind === "single" ? body.selector_kind : "single",
    pattern_count: Number.isFinite(body.pattern_count) ? Number(body.pattern_count) : null,
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase.from("objects").insert(row).select("*").single()
  if (error) return jsonResponse({ error: error.message }, { status: 500 })
  return jsonResponse({ object: data }, { status: 201 })
}
