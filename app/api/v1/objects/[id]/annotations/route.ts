import { authenticateToken, jsonResponse, preflight, unauthorized } from "@/lib/auth/token"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"

export async function OPTIONS() {
  return preflight()
}

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authenticateToken(request.headers.get("authorization"))
  if (!auth) return unauthorized()
  const { id } = await ctx.params

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("annotations")
    .select("*")
    .eq("object_id", id)
    .eq("user_id", auth.userId)
    .order("created_at", { ascending: false })

  if (error) return jsonResponse({ error: error.message }, { status: 500 })
  return jsonResponse({ annotations: data })
}

// Annotate action: attach a note to an object (optionally to a field).
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authenticateToken(request.headers.get("authorization"))
  if (!auth) return unauthorized()
  const { id } = await ctx.params

  const body = await request.json().catch(() => null)
  if (!body || typeof body.body !== "string" || !body.body.trim()) {
    return jsonResponse({ error: "body is required" }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Verify the object belongs to this user.
  const { data: obj } = await supabase
    .from("objects")
    .select("id")
    .eq("id", id)
    .eq("user_id", auth.userId)
    .maybeSingle()
  if (!obj) return jsonResponse({ error: "Not found" }, { status: 404 })

  const { data, error } = await supabase
    .from("annotations")
    .insert({
      user_id: auth.userId,
      object_id: id,
      field: typeof body.field === "string" ? body.field.slice(0, 200) : null,
      body: body.body.slice(0, 10_000),
    })
    .select("*")
    .single()

  if (error) return jsonResponse({ error: error.message }, { status: 500 })
  return jsonResponse({ annotation: data }, { status: 201 })
}
