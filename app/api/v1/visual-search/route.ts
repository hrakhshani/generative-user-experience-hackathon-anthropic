import { createOpenAI } from "@ai-sdk/openai"
import { generateObject } from "ai"
import { z } from "zod"
import { authenticateToken, jsonResponse, preflight, unauthorized } from "@/lib/auth/token"
import { GATEWAY_UNAVAILABLE_MESSAGE, isGatewayUnavailable } from "@/lib/ai/gateway"
import { getUserOpenAIKey } from "@/lib/ai/model"

export const runtime = "nodejs"
// Vision calls take longer than text-only generateObject (the model has
// to download + tokenize the image first), so we keep the same generous
// 60s function ceiling that compare-text uses. Real calls land at 2-4s.
export const maxDuration = 60

export async function OPTIONS() {
  return preflight()
}

// ---------------------------------------------------------------------------
// /api/v1/visual-search — image-to-search-query
//
// What this does (and only this):
//
//   1. The extension uploads an image (data URL produced by the in-page
//      upload modal, downscaled client-side to 1600px JPEG).
//   2. We send the image to gpt-4o-mini's vision endpoint and ask for a
//      VERY SHORT search query — the kind of thing a user would actually
//      type into a search box. 3-6 words, plain text, no punctuation,
//      lowercase, no quotes.
//   3. Return `{ query }`. The content script then types this query
//      into the host page's existing search bar and submits it, so the
//      user lands on the host site's native search results page.
//
// Notes:
//   - Earlier versions of this route also ranked the visible cards on
//     the page. We removed that — the user's stated goal is "use the
//     image to search", not "have v0 do its own ranking on top of the
//     page". The simpler flow is faster, more predictable, and lets the
//     user keep the source-of-truth UX of the host site they're on.
//   - Pinned to gpt-4o-mini for the same reason Compare/Grammar are
//     pinned: it's the cheapest non-reasoning vision model that
//     supports `generateObject` reliably and turns this around in 2-4s.
// ---------------------------------------------------------------------------

const BodySchema = z.object({
  // Data URL ("data:image/...;base64,...") OR a public https URL.
  // Cap raw size to ~6 MB so we don't blow up function memory on
  // accidental 4K uploads — the client modal also resizes before sending.
  image: z
    .string()
    .min(16)
    .max(6_000_000)
    .refine(
      (s) => s.startsWith("data:image/") || /^https?:\/\//.test(s),
      "image must be a data URL or http(s) URL",
    ),
  // Optional user framing ("for running", "in red", etc). Layered onto
  // the auto-extracted query; the model decides whether it's relevant.
  prompt: z.string().max(160).optional().default(""),
  // Optional hint about which site we're searching on. Helps the model
  // bias the query toward terms that site's search engine understands
  // (e.g. on Amazon: "running shoes red mesh"; on Pinterest: less
  // shopping-y phrasing). Not required.
  site: z.string().max(120).optional().default(""),
})

// Strict structured output. Keep the schema small — `query` is the only
// thing the client uses. We also ask for a one-line description so the
// upload modal can preview "what the model saw" before submitting.
//
// Length budget: queries can be up to ~240 chars. That's deliberately
// generous: products want short keyword queries (~40-80 chars) but
// documents/screenshots/recipes need a multi-clause "what is this
// about" summary, and 80 chars isn't enough for those. The model is
// instructed to right-size per content type rather than always max out.
const VisualSearchSchema = z.object({
  query: z.string().min(2).max(240),
  description: z.string().min(1).max(240),
})

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
  const { image, prompt, site } = parsed.data

  // Pinned to gpt-4o-mini, which supports vision input AND `generateObject`.
  // User's OpenAI key takes the direct path; otherwise gateway.
  const userOpenAIKey = getUserOpenAIKey(req)
  const usingUserKey = !!userOpenAIKey
  const provider = usingUserKey ? "openai/gpt-4o-mini (direct)" : "openai/gpt-4o-mini"
  const model = usingUserKey
    ? createOpenAI({ apiKey: userOpenAIKey })("gpt-4o-mini")
    : ("openai/gpt-4o-mini" as const)

  // 30s wall-clock — well under maxDuration so we return a friendly 504
  // instead of letting Vercel kill the function with its own timeout.
  const ac = new AbortController()
  const timeout = setTimeout(() => ac.abort(), 30_000)

  try {
    const { object } = await generateObject({
      model,
      schema: VisualSearchSchema,
      system: [
        "You convert an uploaded image into a search query — the kind a",
        "person would actually type into a website's search box. Your",
        "job is to capture the IDENTIFYING details so the search engine",
        "returns the right results, while staying concise.",
        "",
        "STEP 1 — Decide what the image is. Pick the closest type:",
        "  PRODUCT     a physical item for sale (clothing, electronics,",
        "              furniture, books seen as a product, food packaging…)",
        "  DOCUMENT    text-heavy: a paper, slide, screenshot of an",
        "              article, receipt, recipe, form, code, etc.",
        "  PLACE       a landmark, building, street, restaurant exterior,",
        "              menu, business card, sign…",
        "  PERSON_REF  a portrait/poster of a public figure, book cover,",
        "              album cover, movie poster (search by their name)",
        "  SCENE       general photo (animal, plant, food dish, art) —",
        "              search by what is depicted",
        "",
        "STEP 2 — Build the query. Adapt the SHAPE to the type:",
        "",
        "PRODUCT (target: 4-10 words, ~40-90 chars)",
        "  Include, ONLY when clearly visible in the image:",
        "    1. Brand / model name (read it off the logo, label, tag,",
        "       or packaging — do NOT guess)",
        "    2. Product category / type",
        "    3. Color (primary, then secondary if distinctive)",
        "    4. Material / pattern (leather, mesh, knit, stripes…)",
        "    5. Defining feature (high-top, wireless, cordless, foldable…)",
        "    6. Size/capacity ONLY if printed on the item",
        "  Do NOT include: 'best', 'cheap', 'top', 'review', 'amazon',",
        "  site names, marketing language, year of release unless on label.",
        "  Order: brand model > category > color > material > feature.",
        "  Good: 'nike pegasus 41 mens running shoes triple red mesh'",
        "  Good: 'ikea malm 6-drawer dresser white'",
        "  Good: 'sony wh-1000xm5 wireless headphones black'",
        "  Bad:  'red shoes' (missing brand even though logo is visible)",
        "  Bad:  'amazing comfy nike shoes for running fast' (marketing)",
        "",
        "DOCUMENT (target: 10-25 words, ~80-200 chars)",
        "  The image is mostly text. Build a query that captures what",
        "  the document is ABOUT, not its visual look. Include:",
        "    1. Document title or main heading if present",
        "    2. 3-5 of the most specific terms / proper nouns / numbers",
        "       from the text (people, places, dates, technical terms,",
        "       product names, equation/code identifiers)",
        "    3. Document type if obvious (paper, recipe, manual, slide…)",
        "  Good: 'attention is all you need transformer paper vaswani 2017'",
        "  Good: 'react useeffect cleanup function tutorial dependency array'",
        "  Good: 'classic margherita pizza recipe san marzano tomatoes basil'",
        "",
        "PLACE (target: 3-8 words)",
        "  Name the landmark / business / street if you can read a sign,",
        "  otherwise describe distinctive architecture + city if known.",
        "  Good: 'eiffel tower paris' / 'shake shack manhattan menu'",
        "",
        "PERSON_REF (target: 3-8 words)",
        "  Search by name + context. Do NOT identify private individuals;",
        "  only public figures, book/album/movie covers with visible titles.",
        "  Good: 'dune frank herbert novel cover' / 'taylor swift midnights album'",
        "",
        "SCENE (target: 4-8 words)",
        "  Identify the subject (species, dish, art style, etc.) plus",
        "  one or two distinctive details.",
        "  Good: 'golden retriever puppy in grass'",
        "  Good: 'pad thai with shrimp lime'",
        "",
        "GENERAL RULES for `query`:",
        "  - Plain text. Lowercase. No punctuation, no quotes, no emoji.",
        "  - Words separated by single spaces.",
        "  - Prefer concrete, observable facts over guesses.",
        "  - If a brand/title/name is partially obscured or you are not",
        "    sure, OMIT it. A clean generic query beats a wrong specific.",
        "  - Use the user's optional intent and the target site to bias",
        "    word choice (e.g. on amazon prefer shopping terms).",
        "",
        "Rules for `description`:",
        "  - One short sentence (max ~25 words) of what's visually",
        "    present, in plain English. The user sees this as a sanity",
        "    check; it is NOT typed into the search bar.",
      ].join("\n"),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: [
                prompt ? `User intent: ${prompt}` : "",
                site ? `Searching on: ${site}` : "",
                "Look at this image and produce a short search query.",
              ]
                .filter(Boolean)
                .join("\n"),
            },
            // The AI SDK normalizes `{ type: "image", image: <url|dataUrl> }`
            // into the provider-specific shape.
            { type: "image", image },
          ],
        },
      ],
      abortSignal: ac.signal,
      // Single attempt — vision calls are slow enough that retrying
      // would compound the latency. The client surfaces a clean error.
      maxRetries: 0,
      // Deterministic decoding. The same image must return the same
      // query every time — anything else makes the rule feel flaky and
      // makes bug reports impossible to reproduce. We also drop top_p
      // to 0 (gpt-4o-mini accepts both knobs; setting only one of the
      // two leaves the model with a non-trivial sampling space).
      temperature: 0,
      topP: 0,
    })

    // Defensive cleanup: strip quotes, replace sentence punctuation
    // with spaces, collapse whitespace, lowercase. We DO keep hyphens
    // and digits — model numbers like "wh-1000xm5" or "pegasus 41" are
    // meaningful to product search engines. Cap at 240 chars to mirror
    // the schema and to fit comfortably in any normal search box.
    const cleanQuery = String(object.query)
      .replace(/["'`]/g, "")
      .replace(/[.,;:!?]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase()
      .slice(0, 240)

    return jsonResponse({
      query: cleanQuery,
      description: object.description,
      ai: true,
      model: provider,
    })
  } catch (err) {
    const aborted =
      ac.signal.aborted || (err instanceof Error && /aborted|abort/i.test(err.message))
    if (aborted) {
      return jsonResponse(
        { error: "Visual search timed out. Try a smaller image." },
        { status: 504 },
      )
    }
    if (!usingUserKey && isGatewayUnavailable(err)) {
      return jsonResponse({ error: GATEWAY_UNAVAILABLE_MESSAGE }, { status: 402 })
    }
    console.log("[v0] /visual-search error", err)
    const msg =
      usingUserKey && err instanceof Error
        ? `Provider error: ${err.message}`
        : "Visual search failed"
    return jsonResponse({ error: msg }, { status: 500 })
  } finally {
    clearTimeout(timeout)
  }
}
