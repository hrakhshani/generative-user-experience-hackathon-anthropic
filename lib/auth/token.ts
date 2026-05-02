import { createAdminClient } from "@/lib/supabase/admin"

export type AuthedRequest = {
  userId: string
  tokenId: string
}

/**
 * Resolve a workspace token from an incoming Authorization header.
 * Returns the user_id the token belongs to or null if invalid/revoked.
 */
export async function authenticateToken(authHeader: string | null): Promise<AuthedRequest | null> {
  if (!authHeader) return null

  const match = authHeader.match(/^Bearer\s+(.+)$/i)
  if (!match) return null
  const token = match[1].trim()
  if (!token) return null

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("workspace_tokens")
    .select("id, user_id, revoked")
    .eq("token", token)
    .maybeSingle()

  if (error || !data || data.revoked) return null

  // Fire-and-forget last_used update.
  void supabase.from("workspace_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", data.id)

  return { userId: data.user_id, tokenId: data.id }
}

export function unauthorized() {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "content-type": "application/json", ...corsHeaders() },
  })
}

export function corsHeaders() {
  // The extension's content scripts can call this API from any origin.
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Anthropic-Key",
    "Access-Control-Max-Age": "86400",
  }
}

export function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...corsHeaders(),
      ...(init.headers ?? {}),
    },
  })
}

export function preflight() {
  return new Response(null, { status: 204, headers: corsHeaders() })
}
