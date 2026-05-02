import { authenticateToken, jsonResponse, preflight, unauthorized } from "@/lib/auth/token"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"

export async function OPTIONS() {
  return preflight()
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authenticateToken(request.headers.get("authorization"))
  if (!auth) return unauthorized()
  const { id } = await ctx.params

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return jsonResponse({ error: "Invalid JSON body" }, { status: 400 })
  }

  const patch: Record<string, unknown> = {}
  if (typeof body.name === "string") patch.name = body.name.slice(0, 200)
  if (typeof body.enabled === "boolean") patch.enabled = body.enabled
  if (body.config && typeof body.config === "object") patch.config = body.config

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("page_rules")
    .update(patch)
    .eq("id", id)
    .eq("user_id", auth.userId)
    .select("*")
    .single()

  if (error) return jsonResponse({ error: error.message }, { status: 500 })
  if (!data) return jsonResponse({ error: "Not found" }, { status: 404 })
  return jsonResponse({ rule: data })
}

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authenticateToken(request.headers.get("authorization"))
  if (!auth) return unauthorized()
  const { id } = await ctx.params

  const supabase = createAdminClient()
  const { error } = await supabase
    .from("page_rules")
    .delete()
    .eq("id", id)
    .eq("user_id", auth.userId)

  if (error) return jsonResponse({ error: error.message }, { status: 500 })
  return jsonResponse({ ok: true })
}
