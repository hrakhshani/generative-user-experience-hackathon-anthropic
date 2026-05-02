// /api/v1/derive-categories
//
// Takes a representative sample of post / product / card text from the
// current page and asks an LLM to propose 5-8 short, page-specific
// category buckets that the rest of the page can be classified into.
//
// This is what makes the "dynamic categories" filter actually feel
// dynamic — a Nike product grid produces buckets like
// ["Running", "Basketball", "Lifestyle", "Apparel", "Sale"] instead of
// reusing the LinkedIn-feed-centric SEED_CATEGORIES list, and a
// Hacker News page produces ["Programming", "Startups", "Hardware",
// "Policy", "Show HN"] instead.
//
// Output is consumed by the extension, which then passes the derived
// list back to /api/v1/categorize as a per-request `categories` array
// so embeddings get computed against the right anchors.

import { generateObject } from "ai"
import { z } from "zod"
import { authenticateToken, jsonResponse, preflight, unauthorized } from "@/lib/auth/token"
import { resolveModel } from "@/lib/ai/model"
import { GATEWAY_UNAVAILABLE_MESSAGE, isGatewayUnavailable } from "@/lib/ai/gateway"
import { SEED_CATEGORIES } from "@/lib/ai/categories"

export const runtime = "nodejs"

export async function OPTIONS() {
  return preflight()
}

const MAX_SAMPLE_ITEMS = 40
const MAX_ITEM_CHARS = 600

// Constraining the schema means the model must hit our shape exactly,
// which is what makes generateObject reliable enough to skip retries.
const schema = z.object({
  categories: z
    .array(
      z.object({
        name: z
          .string()
          .min(2)
          .max(28)
          .describe("Short category label (1-3 words). Title Case. No emojis."),
        description: z
          .string()
          .min(8)
          .max(220)
          .describe(
            "One-sentence description with concrete keywords/synonyms that describe what falls in this bucket. Used as an embedding anchor.",
          ),
      }),
    )
    .min(3)
    .max(8),
})

export async function POST(req: Request) {
  const auth = await authenticateToken(req.headers.get("authorization"))
  if (!auth) return unauthorized()

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return jsonResponse({ error: "Invalid payload" }, { status: 400 })
  }
  const fragmentsRaw = (body as Record<string, unknown>).fragments
  const host = typeof (body as Record<string, unknown>).host === "string"
    ? (body as Record<string, unknown>).host as string
    : ""
  // Optional page-level context (path, page title, h1) the extension
  // sends along so the LLM can infer which sport / vertical the page
  // belongs to even when individual product names are too short to
  // disambiguate ("Jordan Flight Court" tells the model nothing on its
  // own; "/mens-running-shoes" tells it everything).
  const pageContext = typeof (body as Record<string, unknown>).pageContext === "string"
    ? ((body as Record<string, unknown>).pageContext as string).slice(0, 600)
    : ""
  if (!Array.isArray(fragmentsRaw) || fragmentsRaw.length === 0) {
    return jsonResponse({ error: "fragments[] required" }, { status: 400 })
  }

  // Sample evenly across the input so we cover the full content variety
  // (vs just the first 40 items, which on a sorted feed would give a
  // biased view).
  const all = fragmentsRaw
    .filter((f): f is string => typeof f === "string")
    .map((f) => f.trim().replace(/\s+/g, " ").slice(0, MAX_ITEM_CHARS))
    .filter((f) => f.length > 0)

  if (all.length === 0) {
    return jsonResponse({
      categories: SEED_CATEGORIES.slice(0, 6).map((c) => ({ name: c.name, description: c.prompt })),
      ai: false,
      notice: "No usable content to derive categories from",
    })
  }

  const stride = Math.max(1, Math.floor(all.length / MAX_SAMPLE_ITEMS))
  const sample: string[] = []
  for (let i = 0; i < all.length && sample.length < MAX_SAMPLE_ITEMS; i += stride) {
    sample.push(all[i])
  }

  const { model, usingUserKey } = resolveModel(req, {
    gatewayModel: "openai/gpt-5-mini",
    tier: "fast",
  })

  // Hard server-side timeout. We'd rather return SEED_CATEGORIES than
  // make the user stare at "Categorizing…" while a slow gateway works
  // through retries.
  const ac = new AbortController()
  const timeout = setTimeout(() => ac.abort(), 20_000)

  try {
    const { object } = await generateObject({
      model,
      schema,
      abortSignal: ac.signal,
      maxRetries: 0,
      system:
        "You are a librarian designing a small, mutually-exclusive set of category buckets for a list of items found on a single web page. " +
        "Pick category names that are SPECIFIC to the actual content rather than broad generic labels. " +
        "Prefer FINE-GRAINED, sub-discipline buckets when the page is dominated by a single domain — e.g. on a running shoes grid use " +
        "['Road Running', 'Trail Running', 'Racing & Carbon Plate', 'Athletics Spikes', 'Custom & Specialty', 'Lifestyle'] " +
        "instead of just one generic 'Running' bucket. Other examples: a basketball page might split into 'Signature LeBron', " +
        "'Signature Jordan', 'GT Series', 'Outdoor', 'Lifestyle'; a football/soccer page into 'Firm Ground', 'Artificial Grass', " +
        "'Indoor / Futsal', 'Soft Ground', 'Casual'; a Hacker News thread into 'Frontend', 'AI/ML', 'Startups', 'Hardware', 'Policy', 'Show HN'. " +
        "Aim for 5–8 buckets. Each description should list 6–12 representative keywords / brand names / model names / synonyms so a downstream " +
        "embedding model can match short product names (e.g. 'Pegasus 41', 'Vaporfly 3') against the right bucket. Output Title Case names, no emojis, no trailing punctuation.",
      prompt:
        `Host: ${host || "(unknown)"}\n` +
        (pageContext ? `Page context: ${pageContext}\n` : "") +
        `\nHere are ${sample.length} sample items from the page (one per line, separated by ---):\n\n` +
        sample.map((s, i) => `[${i + 1}] ${s}`).join("\n---\n"),
    })

    return jsonResponse({
      categories: object.categories,
      ai: true,
    })
  } catch (err) {
    const aborted = ac.signal.aborted || (err instanceof Error && /aborted|abort/i.test(err.message))
    if (aborted || (!usingUserKey && isGatewayUnavailable(err))) {
      // Fall back to a trimmed slice of the seed list. This still gets
      // SOMETHING in front of the user instead of an empty bar.
      return jsonResponse({
        categories: SEED_CATEGORIES.slice(0, 6).map((c) => ({ name: c.name, description: c.prompt })),
        ai: false,
        notice: aborted
          ? "Category derivation timed out — using built-in categories"
          : GATEWAY_UNAVAILABLE_MESSAGE,
      })
    }
    console.log("[v0] /derive-categories error", err)
    return jsonResponse({
      categories: SEED_CATEGORIES.slice(0, 6).map((c) => ({ name: c.name, description: c.prompt })),
      ai: false,
      notice:
        err instanceof Error
          ? `Category derivation failed (${err.message}); using built-in categories`
          : "Category derivation failed; using built-in categories",
    })
  } finally {
    clearTimeout(timeout)
  }
}
