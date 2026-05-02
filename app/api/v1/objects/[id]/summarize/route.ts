import { authenticateToken, jsonResponse, preflight, unauthorized } from "@/lib/auth/token"
import { createAdminClient } from "@/lib/supabase/admin"
import { GATEWAY_UNAVAILABLE_MESSAGE, isGatewayUnavailable } from "@/lib/ai/gateway"
import { resolveModel } from "@/lib/ai/model"
import { generateText } from "ai"

export const runtime = "nodejs"

export async function OPTIONS() {
  return preflight()
}

// Deterministic AI-free fallback. Produces a short summary by selecting the
// first non-trivial sentences from the source text.
function heuristicSummary(source: string): string {
  const cleaned = source.replace(/\s+/g, " ").trim()
  if (!cleaned) return ""
  const sentences = cleaned.split(/(?<=[.!?])\s+/).filter((s) => s.length > 20 && s.length < 400)
  const picked = sentences.slice(0, 3).join(" ")
  return (picked || cleaned).slice(0, 600)
}

// Summarize action: generate an AI summary of the object's text content
// and persist it on the object row. Falls back to a heuristic summary when
// the AI Gateway is unavailable.
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authenticateToken(request.headers.get("authorization"))
  if (!auth) return unauthorized()
  const { id } = await ctx.params

  const supabase = createAdminClient()
  const { data: obj } = await supabase
    .from("objects")
    .select("id, title, text, url, attributes")
    .eq("id", id)
    .eq("user_id", auth.userId)
    .maybeSingle()

  if (!obj) return jsonResponse({ error: "Not found" }, { status: 404 })

  // Tighter content cap. The previous 12k-char ceiling routinely pushed
  // generateText past 30s on slow gateway days, which the user perceived
  // as a freeze. 4k is plenty for a 2-4 sentence summary and keeps p95
  // latency in the single-digit seconds.
  const source = [
    obj.title ? `Title: ${obj.title}` : "",
    obj.url ? `URL: ${obj.url}` : "",
    obj.attributes ? `Attributes: ${JSON.stringify(obj.attributes).slice(0, 1200)}` : "",
    obj.text ? `Content: ${String(obj.text).slice(0, 4000)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")

  if (!source.trim()) {
    return jsonResponse({ error: "Object has no content to summarize" }, { status: 400 })
  }

  const { model, usingUserKey } = resolveModel(request, {
    gatewayModel: "openai/gpt-5-mini",
    tier: "fast",
  })

  // Server-side hard ceiling. AbortController fires at 25s — well below
  // typical edge runtime / Vercel function timeouts but long enough that
  // a healthy gateway always finishes. If we time out, we fall through
  // to the heuristic summary below so the user still gets *something*.
  const ac = new AbortController()
  const timeout = setTimeout(() => ac.abort(), 25_000)
  try {
    const { text } = await generateText({
      model,
      system:
        "You produce concise, neutral summaries of arbitrary web content. " +
        "Output 2-4 sentences. No preamble, no markdown, no lists.",
      prompt: source,
      abortSignal: ac.signal,
      // Disable retries: we already have a deterministic heuristic
      // fallback, so chasing transient failures with exponential backoff
      // just makes the user wait longer for the same outcome.
      maxRetries: 0,
    })

    const summary = text.trim().slice(0, 8000)
    await supabase.from("objects").update({ summary }).eq("id", id).eq("user_id", auth.userId)

    return jsonResponse({ summary, ai: true })
  } catch (err) {
    // Timeout (we aborted) — fall back to the heuristic so the UI gets a
    // 200 with a usable summary instead of hanging the user out to dry.
    const aborted =
      ac.signal.aborted || (err instanceof Error && /aborted|abort/i.test(err.message))
    if (aborted) {
      const summary = heuristicSummary(String(obj.text || obj.title || ""))
      await supabase.from("objects").update({ summary }).eq("id", id).eq("user_id", auth.userId)
      return jsonResponse({
        summary,
        ai: false,
        notice: "AI summary timed out after 25s — showing a heuristic summary instead.",
      })
    }
    if (!usingUserKey && isGatewayUnavailable(err)) {
      const summary = heuristicSummary(String(obj.text || obj.title || ""))
      await supabase.from("objects").update({ summary }).eq("id", id).eq("user_id", auth.userId)
      return jsonResponse({ summary, ai: false, notice: GATEWAY_UNAVAILABLE_MESSAGE })
    }
    console.log("[v0] summarize route failed:", err)
    const msg =
      usingUserKey && err instanceof Error ? `Anthropic API error: ${err.message}` : "Summarization failed"
    return jsonResponse({ error: msg }, { status: 500 })
  } finally {
    clearTimeout(timeout)
  }
}
