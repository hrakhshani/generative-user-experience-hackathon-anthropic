import { authenticateToken, jsonResponse, preflight, unauthorized } from "@/lib/auth/token"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"

export async function OPTIONS() {
  return preflight()
}

export async function GET(request: Request) {
  const auth = await authenticateToken(request.headers.get("authorization"))
  if (!auth) return unauthorized()

  const supabase = createAdminClient()
  const { data: tokenRow } = await supabase
    .from("workspace_tokens")
    .select("name, last_used_at, created_at")
    .eq("id", auth.tokenId)
    .single()

  return jsonResponse({
    user_id: auth.userId,
    token: tokenRow,
  })
}
