import { createOpenAI } from "@ai-sdk/openai"
import { generateObject } from "ai"
import { z } from "zod"
import { authenticateToken, jsonResponse, preflight, unauthorized } from "@/lib/auth/token"
import { GATEWAY_UNAVAILABLE_MESSAGE, isGatewayUnavailable } from "@/lib/ai/gateway"
import { getUserOpenAIKey } from "@/lib/ai/model"

export const runtime = "nodejs"
// Text-only extraction — typical latency 1-2s. 60s gives us headroom
// for the rare slow gateway response without falling under Vercel's
// hard kill.
export const maxDuration = 60

export async function OPTIONS() {
  return preflight()
}

// ---------------------------------------------------------------------------
// /api/v1/extract-object — clean a noisy DOM-captured payload
//
// The extension captures `el.innerText` from a matched product/post/
// article card. That text is full of UI chrome the user does not care
// about — "+ 11 andere kleuren", "Gesponsord", "Saving...", "In
// winkelwagen", "GRATIS bezorging", duplicate price lines, etc. Saving
// it raw produces the broken-looking detail pages the user reported.
//
// This route takes that raw text plus a few hints (URL, hostname, the
// media-2 author/engagement we already pulled deterministically) and
// returns a clean, opinionated object the dashboard can render without
// any further heuristics:
//
//   {
//     kind, title, subtitle, description, bodyText,
//     brand, price, priceCurrency, rating, reviewCount,
//     authorName, authorHandle, publishedAt, tags
//   }
//
// The renderer is then a pure mapping from these fields → UI; we never
// have to grep the dirty raw text from the dashboard side again.
//
// We pin gpt-4o-mini for the same reasons as Compare / Visual Search:
// cheapest reliable structured-output model, deterministic with
// temperature 0, and good enough for this category of clean-up.
// ---------------------------------------------------------------------------

const BodySchema = z.object({
  // Raw text dump from the captured element. Capped at the same 50k
  // limit the objects route stores; in practice it's well under 8k.
  text: z.string().max(50_000),
  // Optional title the extension already guessed from <h1>/<h2>/og:title.
  title: z.string().max(500).optional().default(""),
  // The page URL — gives the model context about whether this is a
  // product page, a feed, etc.
  url: z.string().max(2048).optional().default(""),
  // Hostname (e.g. "amazon.nl") so the model can pick the right idiom.
  site: z.string().max(120).optional().default(""),
  // The media-2 fields we already pulled deterministically. Includes
  // structured author and engagement so the LLM doesn't have to
  // re-derive them. Optional / best-effort.
  hints: z
    .object({
      kind: z.string().max(40).nullable().optional(),
      author: z
        .object({
          name: z.string().max(160).nullable().optional(),
          handle: z.string().max(160).nullable().optional(),
        })
        .nullable()
        .optional(),
      timestamp: z.string().max(120).nullable().optional(),
      headings: z.array(z.string().max(300)).max(20).optional(),
      hashtags: z.array(z.string().max(60)).max(40).optional(),
    })
    .partial()
    .optional()
    .default({}),
})

// Strict structured output. Every field is a string-or-null so the
// model can't dodge a hard answer with creative typing. The renderer
// treats null as "not present" and shows nothing for it.
const ExtractedSchema = z.object({
  kind: z.enum([
    "product",
    "post",
    "article",
    "video",
    "profile",
    "comment",
    "generic",
  ]),
  title: z.string().min(1).max(280),
  subtitle: z.string().max(200).nullable(),
  description: z.string().max(800),
  bodyText: z.string().max(4000).nullable(),
  brand: z.string().max(120).nullable(),
  price: z.string().max(40).nullable(),
  priceCurrency: z.string().max(8).nullable(),
  rating: z.number().min(0).max(5).nullable(),
  reviewCount: z.number().int().min(0).max(100_000_000).nullable(),
  authorName: z.string().max(160).nullable(),
  authorHandle: z.string().max(160).nullable(),
  publishedAt: z.string().max(80).nullable(),
  tags: z.array(z.string().min(1).max(40)).max(8),
})

export type ExtractedObject = z.infer<typeof ExtractedSchema>

export async function POST(req: Request) {
  const auth = await authenticateToken(req.headers.get("authorization"))
  if (!auth) return unauthorized()

  const raw = await req.json().catch(() => null)
  const parsed = BodySchema.safeParse(raw)
  if (!parsed.success) {
    return jsonResponse(
      { error: parsed.error.issues[0]?.message || "Invalid payload" },
      { status: 400 },
    )
  }
  const { text, title, url, site, hints } = parsed.data

  // Pinned to gpt-4o-mini. User's OpenAI key takes the direct path;
  // otherwise the gateway.
  const userOpenAIKey = getUserOpenAIKey(req)
  const usingUserKey = !!userOpenAIKey
  const provider = usingUserKey ? "openai/gpt-4o-mini (direct)" : "openai/gpt-4o-mini"
  const model = usingUserKey
    ? createOpenAI({ apiKey: userOpenAIKey })("gpt-4o-mini")
    : ("openai/gpt-4o-mini" as const)

  const ac = new AbortController()
  const timeout = setTimeout(() => ac.abort(), 30_000)

  try {
    const { object } = await generateObject({
      model,
      schema: ExtractedSchema,
      // System prompt is the entire spec. Long-but-deterministic beats
      // few-shot for this kind of structured normalization.
      system: [
        "You clean up a noisy text dump captured from a webpage element",
        "and return a structured, dashboard-ready record. The dump comes",
        "from a real card on a live site so it's full of UI chrome (",
        "menu labels, sponsored tags, tracking states, currency symbols",
        "duplicated, microcopy like 'Saving...', 'In cart', 'FREE",
        "delivery'). Your job is to remove that noise and surface the",
        "FACTUAL CONTENT: what is this thing, what's its name, who made",
        "it, how much, etc. Never invent details that aren't supported",
        "by the source.",
        "",
        "STEP 1 — `kind`. Pick the closest match:",
        "  product   anything for sale (clothing, electronics, books-as-product, services with prices…)",
        "  post      a social-media post (LinkedIn, X, Reddit, Instagram, Mastodon…)",
        "  article   a blog post, news article, paper, long-form piece",
        "  video     a video listing or video player card (YouTube, Vimeo, TikTok)",
        "  profile   a user/person/company profile page",
        "  comment   a single reply / comment in a thread",
        "  generic   none of the above",
        "",
        "STEP 2 — Fill the fields. Each rule below applies to all kinds",
        "unless tagged with [PRODUCT], [POST], etc.",
        "",
        "`title` — the SINGLE most important name of this thing.",
        "  [PRODUCT] the product's display name as a shopper would search",
        "    for it. NOT 'Sponsored', NOT '#1 best seller', NOT 'Brand X /",
        "    Subbrand Y' — pick the actual product line. If brand and",
        "    product are mashed together (e.g. 'Orthofeet Women's",
        "    Orthopedic Hands-Free Nira Slip-On Sneakers'), keep only",
        "    the product part: 'Women\\'s Orthopedic Hands-Free Nira",
        "    Slip-On Sneakers'.",
        "  [POST/COMMENT] the first non-empty sentence of the body, up",
        "    to ~12 words, ending where a natural break occurs. No",
        "    leading hashtags, no @mentions.",
        "  [ARTICLE] the article headline.",
        "  [PROFILE] the person's or company's display name.",
        "  [VIDEO] the video's title.",
        "  Never include trailing UI tokens like 'Sponsored', 'Promoted',",
        "  '1 of 12', 'Live'.",
        "",
        "`subtitle` — secondary identifier:",
        "  [PRODUCT] brand only (e.g. 'Orthofeet', 'Nike', 'Sony')",
        "  [POST] the author handle if visible (e.g. '@elonmusk')",
        "  [ARTICLE] outlet name (e.g. 'The New York Times')",
        "  [VIDEO] channel name",
        "  null if not present.",
        "",
        "`description` — 1-3 sentence plain-English description of WHAT",
        "this is, in YOUR words. No marketing fluff, no emoji. For a",
        "product describe what it is + the most distinctive feature.",
        "For a post describe what it's about. ~30-80 words is a good",
        "target. Always populate this field; if you truly have nothing",
        "to say, write a one-sentence neutral description.",
        "",
        "`bodyText` — [POST/COMMENT/ARTICLE only] the actual content of",
        "the post/comment/article body, with UI chrome removed. Keep",
        "paragraph breaks as \\n. null for products / videos / profiles.",
        "Cap around 600 words.",
        "",
        "`brand` — [PRODUCT] the brand string ONLY, no extra words. null",
        "for everything else.",
        "",
        "`price` — [PRODUCT] the displayed price as a single string,",
        "preserving the original currency symbol and number formatting",
        "(e.g. '€169,90', '$29.99', '£12'). If the dump shows two prices",
        "(was/is, list/sale), pick the FINAL/ACTUAL price the buyer",
        "would pay. null if no price is shown or if not a product.",
        "",
        "`priceCurrency` — three-letter ISO code where determinable",
        "('EUR', 'USD', 'GBP', 'JPY'). null otherwise.",
        "",
        "`rating` — [PRODUCT/VIDEO] numeric rating on a 0-5 scale. If",
        "the source uses 0-10 or 0-100, normalize to 0-5. null if no",
        "rating is shown.",
        "",
        "`reviewCount` — [PRODUCT/VIDEO] number of ratings/reviews as a",
        "plain integer (e.g. 643). Strip parentheses and commas. null if",
        "not present.",
        "",
        "`authorName` — [POST/COMMENT/ARTICLE] human display name.",
        "",
        "`authorHandle` — [POST/COMMENT] @-handle including the @.",
        "",
        "`publishedAt` — ISO date if you can derive one, otherwise the",
        "human-readable timestamp string ('2h', 'yesterday', 'May 7').",
        "null if not present.",
        "",
        "`tags` — up to 8 short topic / category labels in lowercase.",
        "[POST] use #hashtags from the body if present (without the #).",
        "[PRODUCT] use category words ('sneakers', 'orthopedic',",
        "'slip-on'). [] if nothing fits.",
        "",
        "FORMATTING RULES:",
        "  - Always answer in the SAME human language as the source",
        "    text. Don't translate to English.",
        "  - Trim every string. No trailing whitespace.",
        "  - Strip leading/trailing UI tokens: 'Sponsored', 'Ad',",
        "    '#1 best seller', 'Promoted', 'Saving...', 'Save',",
        "    'In cart', 'In winkelwagen', 'Add to cart', 'GRATIS",
        "    bezorging', '+ N kleuren', '23%', etc.",
        "  - When the source is genuinely too sparse, prefer null /",
        "    empty array over hallucinations.",
      ].join("\n"),
      messages: [
        {
          role: "user",
          content: [
            url ? `URL: ${url}` : "",
            site ? `Hostname: ${site}` : "",
            title ? `Page-suggested title: ${title}` : "",
            hints?.kind ? `Hint kind: ${hints.kind}` : "",
            hints?.author?.name ? `Hint author name: ${hints.author.name}` : "",
            hints?.author?.handle ? `Hint author handle: ${hints.author.handle}` : "",
            hints?.timestamp ? `Hint timestamp: ${hints.timestamp}` : "",
            hints?.headings && hints.headings.length > 0
              ? `Headings: ${hints.headings.slice(0, 6).join(" | ")}`
              : "",
            hints?.hashtags && hints.hashtags.length > 0
              ? `Hashtags: ${hints.hashtags.slice(0, 12).join(", ")}`
              : "",
            "",
            "Raw captured text (start ⟨ end ⟩):",
            "⟨",
            text.slice(0, 12_000),
            "⟩",
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
      abortSignal: ac.signal,
      maxRetries: 0,
      // Deterministic — same input → same output. We do NOT want
      // saved-object pages to look different on every refetch.
      temperature: 0,
      topP: 0,
    })

    return jsonResponse({
      extracted: object,
      ai: true,
      model: provider,
    })
  } catch (err) {
    const aborted =
      ac.signal.aborted || (err instanceof Error && /aborted|abort/i.test(err.message))
    if (aborted) {
      return jsonResponse(
        { error: "Object extraction timed out." },
        { status: 504 },
      )
    }
    if (!usingUserKey && isGatewayUnavailable(err)) {
      return jsonResponse({ error: GATEWAY_UNAVAILABLE_MESSAGE }, { status: 402 })
    }
    console.log("[v0] /extract-object error", err)
    const msg =
      usingUserKey && err instanceof Error
        ? `Provider error: ${err.message}`
        : "Object extraction failed"
    return jsonResponse({ error: msg }, { status: 500 })
  } finally {
    clearTimeout(timeout)
  }
}
