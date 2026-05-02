import { embedMany, cosineSimilarity, type EmbeddingModel } from "ai"
import { authenticateToken, jsonResponse, preflight, unauthorized } from "@/lib/auth/token"
import { GATEWAY_UNAVAILABLE_MESSAGE, isGatewayUnavailable } from "@/lib/ai/gateway"
import { SEED_CATEGORIES, categoriesHash, heuristicCategorize, type SeedCategory } from "@/lib/ai/categories"
import { resolveEmbeddingModel } from "@/lib/ai/embed"

export const runtime = "nodejs"

export async function OPTIONS() {
  return preflight()
}

// In-process cache of seed-category embeddings. Computed once on first
// request after a cold start (or when the seed list hash changes) and
// reused for every subsequent request. This keeps per-request latency to
// just one `embedMany` call (the post fragments) instead of two.
//
// Keyed by `modelId` so that gateway-routed embeddings and direct-key
// embeddings don't share a cache entry. They produce numerically
// identical vectors today (same OpenAI model under the hood) but routing
// them through different code paths means we shouldn't assume that
// stays true forever.
type SeedCache = {
  hash: string
  names: string[]
  embeddings: number[][]
}
const seedCaches = new Map<string, SeedCache>()
const seedCachePromises = new Map<string, Promise<SeedCache>>()

async function getSeedEmbeddings(
  model: string | EmbeddingModel<string>,
  modelId: string,
): Promise<SeedCache> {
  const hash = categoriesHash()
  const cached = seedCaches.get(modelId)
  if (cached && cached.hash === hash) return cached
  // Avoid a thundering-herd: if multiple requests race the first embedding
  // call for this model, share a single in-flight Promise.
  const inflight = seedCachePromises.get(modelId)
  if (inflight) return inflight
  const promise = (async () => {
    const { embeddings } = await embedMany({
      model: model as never,
      values: SEED_CATEGORIES.map((c) => c.prompt),
    })
    const built: SeedCache = {
      hash,
      names: SEED_CATEGORIES.map((c) => c.name),
      embeddings: embeddings as number[][],
    }
    seedCaches.set(modelId, built)
    return built
  })()
  seedCachePromises.set(modelId, promise)
  try {
    return await promise
  } finally {
    seedCachePromises.delete(modelId)
  }
}

// Soft caps so a runaway feed (1000+ posts) doesn't translate into a
// runaway embedding bill. embedMany batches under the hood, but we still
// want predictable latency for the extension UI.
const MAX_FRAGMENTS = 200
const MAX_FRAGMENT_CHARS = 1500

export async function POST(req: Request) {
  const auth = await authenticateToken(req.headers.get("authorization"))
  if (!auth) return unauthorized()

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return jsonResponse({ error: "Invalid payload" }, { status: 400 })
  }

  const fragmentsRaw = (body as Record<string, unknown>).fragments
  if (!Array.isArray(fragmentsRaw) || fragmentsRaw.length === 0) {
    return jsonResponse({ error: "fragments[] required" }, { status: 400 })
  }

  // Optional caller-provided categories. When the extension has already
  // derived a per-page category list (via /api/v1/derive-categories) it
  // sends them here so embeddings get computed against the right anchors
  // instead of the generic SEED_CATEGORIES taxonomy.
  const customCategoriesRaw = (body as Record<string, unknown>).categories
  let activeCategories: SeedCategory[] = SEED_CATEGORIES
  let usingCustomCategories = false
  if (Array.isArray(customCategoriesRaw) && customCategoriesRaw.length > 0) {
    const sanitized = customCategoriesRaw
      .map((c) => {
        if (!c || typeof c !== "object") return null
        const obj = c as Record<string, unknown>
        const name = typeof obj.name === "string" ? obj.name.trim().slice(0, 40) : ""
        const description =
          typeof obj.description === "string"
            ? obj.description.trim().slice(0, 400)
            : typeof obj.prompt === "string"
              ? obj.prompt.trim().slice(0, 400)
              : ""
        if (!name || !description) return null
        return { name, prompt: description } satisfies SeedCategory
      })
      .filter((c): c is SeedCategory => c !== null)
      .slice(0, 12)
    if (sanitized.length >= 2) {
      activeCategories = sanitized
      usingCustomCategories = true
    }
  }

  // Normalize, truncate, and remember which inputs were empty (so we can
  // skip them server-side and return a predictable result shape).
  const trimmed: string[] = []
  for (const f of fragmentsRaw.slice(0, MAX_FRAGMENTS)) {
    const s = typeof f === "string" ? f.trim().replace(/\s+/g, " ").slice(0, MAX_FRAGMENT_CHARS) : ""
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

  const categoryNames = activeCategories.map((c) => c.name)

  // Trivial / all-empty input: still return a valid shape rather than an
  // error so the extension can fall back gracefully.
  if (nonEmpty.length === 0) {
    return jsonResponse({
      results: trimmed.map(() => ({ top: null, score: 0, alternatives: [] })),
      categories: categoryNames,
      ai: false,
      model: "heuristic-keyword",
    })
  }

  // Build the heuristic up front — it's pure CPU and cheap, and we'll
  // need it as a fallback if the gateway throws. The heuristic uses
  // SEED_CATEGORIES (its keyword index is precomputed); when the caller
  // supplied custom categories the heuristic still runs as a safety net
  // but its `top` will be a SEED name, so we map back to the closest
  // active category by string match.
  function fallback() {
    const heuristic = heuristicCategorize(nonEmpty)
    type Result = { top: string | null; score: number; alternatives: { name: string; score: number }[] }
    const results: Result[] = trimmed.map(() => ({ top: null, score: 0, alternatives: [] }))
    for (let i = 0; i < heuristic.length; i++) results[nonEmptyIdxs[i]] = heuristic[i]
    return results
  }

  // Resolve the embedding model. If `x-openai-key` is present we route
  // directly to OpenAI with the user's key (bypassing the AI Gateway's
  // card-on-file requirement); otherwise we use the gateway model id.
  const resolved = resolveEmbeddingModel(req)

  // Server-side timeout for the embedding call. embedMany has its own
  // retry logic which can otherwise stretch a slow request to 60s+ and
  // make the extension UI look frozen.
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), 25_000)

  try {
    // Embed BOTH the active anchors and the post fragments in a single
    // call when categories are custom (no caching), or use the cached
    // SEED embeddings when categories are the default. Doing them
    // together saves an HTTP round trip.
    let anchorEmbeddings: number[][]
    if (usingCustomCategories) {
      const { embeddings: combined } = await embedMany({
        model: resolved.model as never,
        values: [...activeCategories.map((c) => c.prompt), ...nonEmpty],
        abortSignal: ac.signal,
        maxRetries: 1,
      })
      anchorEmbeddings = combined.slice(0, activeCategories.length) as number[][]
      const fragmentEmbeddings = combined.slice(activeCategories.length) as number[][]
      type Result = {
        top: string | null
        score: number
        alternatives: { name: string; score: number }[]
      }
      const results: Result[] = trimmed.map(() => ({ top: null, score: 0, alternatives: [] }))
      for (let i = 0; i < fragmentEmbeddings.length; i++) {
        const vec = fragmentEmbeddings[i]
        const scored = anchorEmbeddings.map((sv, j) => ({
          name: activeCategories[j].name,
          score: cosineSimilarity(vec, sv),
        }))
        scored.sort((a, b) => b.score - a.score)
        const top = scored[0]
        results[nonEmptyIdxs[i]] = {
          top: top.name,
          score: Number(top.score.toFixed(4)),
          alternatives: scored
            .slice(1, 4)
            .map((s) => ({ name: s.name, score: Number(s.score.toFixed(4)) })),
        }
      }
      return jsonResponse({ results, categories: categoryNames, ai: true, model: resolved.modelId })
    }

    const seed = await getSeedEmbeddings(resolved.model, resolved.modelId)
    const { embeddings } = await embedMany({
      model: resolved.model as never,
      values: nonEmpty,
      abortSignal: ac.signal,
      maxRetries: 1,
    })

    type Result = {
      top: string | null
      score: number
      alternatives: { name: string; score: number }[]
    }
    const results: Result[] = trimmed.map(() => ({ top: null, score: 0, alternatives: [] }))

    for (let i = 0; i < embeddings.length; i++) {
      const vec = embeddings[i] as number[]
      const scored = seed.embeddings.map((sv, j) => ({
        name: seed.names[j],
        score: cosineSimilarity(vec, sv),
      }))
      scored.sort((a, b) => b.score - a.score)
      const top = scored[0]
      results[nonEmptyIdxs[i]] = {
        top: top.name,
        score: Number(top.score.toFixed(4)),
        alternatives: scored.slice(1, 4).map((s) => ({ name: s.name, score: Number(s.score.toFixed(4)) })),
      }
    }

    return jsonResponse({ results, categories: seed.names, ai: true, model: resolved.modelId })
  } catch (e) {
    const aborted = ac.signal.aborted || (e instanceof Error && /aborted|abort/i.test(e.message))
    if (aborted) {
      return jsonResponse({
        results: fallback(),
        categories: categoryNames,
        ai: false,
        model: "heuristic-keyword",
        notice: "Embeddings timed out — using keyword fallback",
      })
    }
    if (isGatewayUnavailable(e)) {
      return jsonResponse({
        results: fallback(),
        categories: categoryNames,
        ai: false,
        model: "heuristic-keyword",
        notice: GATEWAY_UNAVAILABLE_MESSAGE,
      })
    }
    console.log("[v0] /categorize error", e)
    return jsonResponse({
      results: fallback(),
      categories: categoryNames,
      ai: false,
      model: "heuristic-keyword",
      notice:
        e instanceof Error
          ? `Embedding failed (${e.message}); using keyword fallback`
          : "Embedding failed; using keyword fallback",
    })
  } finally {
    clearTimeout(t)
  }
}
