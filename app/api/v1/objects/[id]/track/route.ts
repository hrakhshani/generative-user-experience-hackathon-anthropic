import { authenticateToken, jsonResponse, preflight, unauthorized } from "@/lib/auth/token"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"

export async function OPTIONS() {
  return preflight()
}

// Track action: start tracking an object's fields for changes.
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authenticateToken(request.headers.get("authorization"))
  if (!auth) return unauthorized()
  const { id } = await ctx.params

  const body = await request.json().catch(() => ({}))
  const fields = Array.isArray(body?.fields)
    ? body.fields.filter((f: unknown) => typeof f === "string").slice(0, 32)
    : []
  const intervalMinutes = Math.max(15, Math.min(Number(body?.interval_minutes ?? 1440), 60 * 24 * 30))

  const supabase = createAdminClient()

  const { data: obj } = await supabase
    .from("objects")
    .select("id, attributes")
    .eq("id", id)
    .eq("user_id", auth.userId)
    .maybeSingle()
  if (!obj) return jsonResponse({ error: "Not found" }, { status: 404 })

  const { data, error } = await supabase
    .from("tracked_objects")
    .upsert(
      {
        user_id: auth.userId,
        object_id: id,
        fields,
        interval_minutes: intervalMinutes,
        last_checked_at: new Date().toISOString(),
      },
      { onConflict: "user_id,object_id" },
    )
    .select("*")
    .single()

  if (error) return jsonResponse({ error: error.message }, { status: 500 })

  // Capture an initial snapshot.
  await supabase.from("tracking_snapshots").insert({
    user_id: auth.userId,
    tracked_id: data.id,
    payload: { attributes: obj.attributes },
  })

  return jsonResponse({ tracked: data }, { status: 201 })
}

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authenticateToken(request.headers.get("authorization"))
  if (!auth) return unauthorized()
  const { id } = await ctx.params

  const supabase = createAdminClient()
  const { error } = await supabase
    .from("tracked_objects")
    .delete()
    .eq("object_id", id)
    .eq("user_id", auth.userId)

  if (error) return jsonResponse({ error: error.message }, { status: 500 })
  return jsonResponse({ ok: true })
}
