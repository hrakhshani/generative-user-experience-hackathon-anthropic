import { createClient } from "@supabase/supabase-js"

/**
 * Service-role Supabase client used by the extension API routes.
 *
 * The Chrome extension authenticates with a workspace token (Bearer auth),
 * not a Supabase session, so RLS cannot apply automatically. We use the
 * service role client and ALWAYS scope queries by user_id manually.
 *
 * NEVER import this in client components.
 */
export function createAdminClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
