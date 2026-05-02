import { authenticateToken, jsonResponse, preflight, unauthorized } from "@/lib/auth/token"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"

export async function OPTIONS() {
  return preflight()
}

// Compare action: load multiple objects, normalize their attributes into a
// shared set of columns, and return a comparison table.
export async function POST(request: Request) {
  const auth = await authenticateToken(request.headers.get("authorization"))
  if (!auth) return unauthorized()

  const body = await request.json().catch(() => null)
  const ids = Array.isArray(body?.object_ids)
    ? body.object_ids.filter((s: unknown) => typeof s === "string").slice(0, 12)
    : []

  if (ids.length < 2) {
    return jsonResponse({ error: "Provide at least 2 object_ids" }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("objects")
    .select("id, title, url, domain, semantic_type, attributes, summary")
    .in("id", ids)
    .eq("user_id", auth.userId)

  if (error) return jsonResponse({ error: error.message }, { status: 500 })
  if (!data || data.length < 2) {
    return jsonResponse({ error: "Could not load enough objects" }, { status: 400 })
  }

  const columns = new Set<string>()
  for (const obj of data) {
    if (obj.attributes && typeof obj.attributes === "object") {
      for (const k of Object.keys(obj.attributes)) columns.add(k)
    }
  }

  const rows = data.map((obj) => {
    const attrs = (obj.attributes ?? {}) as Record<string, unknown>
    const cells: Record<string, string | null> = {}
    for (const col of columns) {
      const v = attrs[col]
      cells[col] = v == null ? null : String(v)
    }
    return {
      id: obj.id,
      title: obj.title,
      url: obj.url,
      domain: obj.domain,
      semantic_type: obj.semantic_type,
      summary: obj.summary,
      cells,
    }
  })

  return jsonResponse({ columns: Array.from(columns), rows })
}
