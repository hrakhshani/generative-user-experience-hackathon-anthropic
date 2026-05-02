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
    .from("objects")
    .select("*, annotations(*)")
    .eq("id", id)
    .eq("user_id", auth.userId)
    .maybeSingle()

  if (error) return jsonResponse({ error: error.message }, { status: 500 })
  if (!data) return jsonResponse({ error: "Not found" }, { status: 404 })
  return jsonResponse({ object: data })
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authenticateToken(request.headers.get("authorization"))
  if (!auth) return unauthorized()
  const { id } = await ctx.params

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return jsonResponse({ error: "Invalid body" }, { status: 400 })
  }

  const update: Record<string, unknown> = {}
  if (typeof body.title === "string") update.title = body.title.slice(0, 500)
  if (typeof body.summary === "string") update.summary = body.summary.slice(0, 8000)
  if (typeof body.semantic_type === "string") update.semantic_type = body.semantic_type.slice(0, 64)
  if (body.attributes && typeof body.attributes === "object") update.attributes = body.attributes
  if (Array.isArray(body.tags)) {
    update.tags = body.tags.filter((t: unknown) => typeof t === "string").slice(0, 32)
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("objects")
    .update(update)
    .eq("id", id)
    .eq("user_id", auth.userId)
    .select("*")
    .maybeSingle()

  if (error) return jsonResponse({ error: error.message }, { status: 500 })
  if (!data) return jsonResponse({ error: "Not found" }, { status: 404 })
  return jsonResponse({ object: data })
}

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authenticateToken(request.headers.get("authorization"))
  if (!auth) return unauthorized()
  const { id } = await ctx.params

  const supabase = createAdminClient()
  const { error } = await supabase.from("objects").delete().eq("id", id).eq("user_id", auth.userId)

  if (error) return jsonResponse({ error: error.message }, { status: 500 })
  return jsonResponse({ ok: true })
}
