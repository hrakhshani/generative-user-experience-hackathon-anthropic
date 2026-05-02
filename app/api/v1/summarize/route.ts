import { generateText } from "ai"
import { authenticateToken, jsonResponse, preflight, unauthorized } from "@/lib/auth/token"
import { GATEWAY_UNAVAILABLE_MESSAGE, isGatewayUnavailable } from "@/lib/ai/gateway"
import { resolveModel } from "@/lib/ai/model"

export const runtime = "nodejs"

export async function OPTIONS() {
  return preflight()
}

// Deterministic AI-free fallback. Picks the first few non-trivial sentences
// so the user always sees *something* useful when the gateway is missing
// billing or the upstream model times out. Mirrors the heuristic used by
// /api/v1/objects/[id]/summarize so behavior is consistent across both
// summary entry points.
function heuristicSummary(source: string): string {
  const cleaned = source.replace(/\s+/g, " ").trim()
  if (!cleaned) return ""
  const sentences = cleaned.split(/(?<=[.!?])\s+/).filter((s) => s.length > 20 && s.length < 400)
  const picked = sentences.slice(0, 3).join(" ")
  return (picked || cleaned).slice(0, 600)
}

// Lightweight, stateless summarize endpoint. Unlike the per-object
// summarize route, this one accepts raw text and returns a summary
// without any database persistence — used by the in-page "Summarize"
// decoration button so users can summarize any matched element on the
// fly, even posts they never saved.
export async function POST(req: Request) {
  const auth = await authenticateToken(req.headers.get("authorization"))
  if (!auth) return unauthorized()

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return jsonResponse({ error: "Invalid payload" }, { status: 400 })
  }

  const text = String((body as Record<string, unknown>).text || "").trim()
  const title = String((body as Record<string, unknown>).title || "").trim()
  const url = String((body as Record<string, unknown>).url || "").trim()

  if (!text && !title) {
    return jsonResponse({ error: "text required" }, { status: 400 })
  }

  // Same 4k cap as the per-object route for consistent latency.
  const source = [title ? `Title: ${title}` : "", url ? `URL: ${url}` : "", text ? `Content: ${text.slice(0, 4000)}` : ""]
    .filter(Boolean)
    .join("\n\n")

  const { model, usingUserKey } = resolveModel(req, {
    gatewayModel: "openai/gpt-5-mini",
    tier: "fast",
  })

  // Hard 25s ceiling. Beyond that we abort and return the heuristic so
  // the in-page popover never spins forever.
  const ac = new AbortController()
  const timeout = setTimeout(() => ac.abort(), 25_000)

  try {
    const { text: out } = await generateText({
      model,
      system:
        "You produce concise, neutral summaries of arbitrary web content. " +
        "Output 2-4 sentences. No preamble, no markdown, no lists.",
      prompt: source,
      abortSignal: ac.signal,
      maxRetries: 0,
    })
    return jsonResponse({ summary: out.trim().slice(0, 1200), ai: true })
  } catch (err) {
    const aborted =
      ac.signal.aborted || (err instanceof Error && /aborted|abort/i.test(err.message))
    if (aborted) {
      return jsonResponse({
        summary: heuristicSummary(text || title),
        ai: false,
        notice: "AI summary timed out after 25s — showing a heuristic summary instead.",
      })
    }
    if (!usingUserKey && isGatewayUnavailable(err)) {
      return jsonResponse({
        summary: heuristicSummary(text || title),
        ai: false,
        notice: GATEWAY_UNAVAILABLE_MESSAGE,
      })
    }
    console.log("[v0] /summarize error", err)
    const msg = usingUserKey && err instanceof Error ? `Anthropic API error: ${err.message}` : "Summarization failed"
    return jsonResponse({ error: msg }, { status: 500 })
  } finally {
    clearTimeout(timeout)
  }
}
