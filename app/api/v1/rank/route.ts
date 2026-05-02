import { embedMany, cosineSimilarity } from "ai"
import { authenticateToken, jsonResponse, preflight, unauthorized } from "@/lib/auth/token"
import { GATEWAY_UNAVAILABLE_MESSAGE, isGatewayUnavailable } from "@/lib/ai/gateway"
import { resolveEmbeddingModel } from "@/lib/ai/embed"

export const runtime = "nodejs"

export async function OPTIONS() {
  return preflight()
}

// Soft caps on what we'll embed in one request. Prevents a runaway
// product wall (1000+ items) from translating into a runaway bill.
const MAX_FRAGMENTS = 200
const MAX_FRAGMENT_CHARS = 1500
const MAX_QUERY_CHARS = 400

// Lightweight word-overlap fallback used when the gateway is
// unavailable. Returns a deterministic 0..1 similarity score so the UI
// still has SOMETHING to sort by; the result is clearly worse than an
// embedding ranking but it beats showing nothing.
function lexicalScore(query: string, doc: string) {
  const tokenize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1)
  const q = new Set(tokenize(query))
  if (q.size === 0) return 0
  const d = tokenize(doc)
  if (d.length === 0) return 0
  let hit = 0
  for (const t of d) if (q.has(t)) hit++
  // Normalize so longer docs don't dominate; cap at 1.
  return Math.min(1, hit / Math.max(8, d.length / 4))
}

export async function POST(req: Request) {
  const auth = await authenticateToken(req.headers.get("authorization"))
  if (!auth) return unauthorized()

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return jsonResponse({ error: "Invalid payload" }, { status: 400 })
  }

  const queryRaw = (body as Record<string, unknown>).query
  const query =
    typeof queryRaw === "string"
      ? queryRaw.trim().replace(/\s+/g, " ").slice(0, MAX_QUERY_CHARS)
      : ""
  if (!query) {
    return jsonResponse({ error: "query (string) is required" }, { status: 400 })
  }

  const fragmentsRaw = (body as Record<string, unknown>).fragments
  if (!Array.isArray(fragmentsRaw) || fragmentsRaw.length === 0) {
    return jsonResponse({ error: "fragments[] required" }, { status: 400 })
  }

  // Normalize, truncate, and remember which inputs were empty (so we can
  // skip them server-side and return a predictable result shape).
  const trimmed: string[] = []
  for (const f of fragmentsRaw.slice(0, MAX_FRAGMENTS)) {
    const s =
      typeof f === "string" ? f.trim().replace(/\s+/g, " ").slice(0, MAX_FRAGMENT_CHARS) : ""
    trimmed.push(s)
  }

  const nonEmptyIdxs: number[] = []
  const nonEmpty: string[] = []
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i].length > 0) {
      nonEmptyIdxs.push(i)
      nonEmpty.push(trimmed[i])
    }
  }

  // Trivial / all-empty input: still return a valid shape rather than an
  // error so the extension can fall back gracefully.
  if (nonEmpty.length === 0) {
    return jsonResponse({
      results: trimmed.map(() => ({ score: 0 })),
      ai: false,
      model: "heuristic-word-overlap",
    })
  }

  function fallback() {
    const results = trimmed.map(() => ({ score: 0 }))
    for (let i = 0; i < nonEmpty.length; i++) {
      results[nonEmptyIdxs[i]] = {
        score: Number(lexicalScore(query, nonEmpty[i]).toFixed(4)),
      }
    }
    return results
  }

  // Pick the embedding model. If the request carries an `x-openai-key`
  // header (set by the extension's options page) we instantiate a
  // direct OpenAI provider with that key and bypass the Vercel AI
  // Gateway entirely — necessary when the gateway is blocked behind a
  // card-on-file requirement. Otherwise we fall through to the gateway
  // model id string.
  const resolved = resolveEmbeddingModel(req)

  // Server-side wall-clock timeout. embedMany has its own retry logic
  // which can otherwise stretch a slow request to 60s+ and make the
  // extension UI look frozen.
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), 25_000)

  try {
    // Embed query + every fragment in a single batched call. Putting
    // the query in slot 0 lets us slice it cleanly afterward.
    const { embeddings } = await embedMany({
      // The AI SDK accepts either a model-id string (gateway path) or
      // a `EmbeddingModel<string>` provider instance (direct path).
      // `resolveEmbeddingModel` returns whichever is appropriate.
      model: resolved.model as never,
      values: [query, ...nonEmpty],
      abortSignal: ac.signal,
      maxRetries: 1,
    })
    const queryVec = embeddings[0] as number[]
    const fragVecs = embeddings.slice(1) as number[][]

    type Result = { score: number }
    const results: Result[] = trimmed.map(() => ({ score: 0 }))
    for (let i = 0; i < fragVecs.length; i++) {
      const score = cosineSimilarity(queryVec, fragVecs[i])
      results[nonEmptyIdxs[i]] = { score: Number(score.toFixed(4)) }
    }

    // `model` reflects whatever was actually used — either the gateway
    // model id ("openai/text-embedding-3-small") or "openai/text-embedding-3-small (direct)"
    // when the user supplied their own OpenAI key. Surfacing it back
    // to the extension lets the user (and us) verify which path ran.
    return jsonResponse({ results, ai: true, model: resolved.modelId })
  } catch (e) {
    const aborted =
      ac.signal.aborted || (e instanceof Error && /aborted|abort/i.test(e.message))
    if (aborted) {
      return jsonResponse({
        results: fallback(),
        ai: false,
        model: "heuristic-word-overlap",
        notice: "Ranking embeddings timed out — using keyword fallback",
      })
    }
    if (isGatewayUnavailable(e)) {
      return jsonResponse({
        results: fallback(),
        ai: false,
        model: "heuristic-word-overlap",
        notice: GATEWAY_UNAVAILABLE_MESSAGE,
      })
    }
    console.log("[v0] /rank error", e)
    return jsonResponse({
      results: fallback(),
      ai: false,
      model: "heuristic-word-overlap",
      notice:
        e instanceof Error
          ? `Ranking failed (${e.message}); using keyword fallback`
          : "Ranking failed; using keyword fallback",
    })
  } finally {
    clearTimeout(t)
  }
}
