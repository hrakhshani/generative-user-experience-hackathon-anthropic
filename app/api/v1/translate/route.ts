import { generateText, Output } from "ai"
import { z } from "zod"
import { authenticateToken, jsonResponse, preflight, unauthorized } from "@/lib/auth/token"
import { GATEWAY_UNAVAILABLE_MESSAGE, isGatewayUnavailable } from "@/lib/ai/gateway"
import { resolveModel } from "@/lib/ai/model"

export const runtime = "nodejs"

export async function OPTIONS() {
  return preflight()
}

// Translate an array of text fragments while preserving the array shape so
// the content script can drop each translated string back into its original
// DOM text node. Translating the whole `innerText` blob would lose the
// node boundaries and we couldn't reassemble the post.
//
// Why an array (not a single string): LinkedIn / X posts have many separate
// text nodes (author name, timestamp, body, hashtags, footer counts), and
// each may be wrapped in different DOM nodes. Keeping them as an indexed
// list lets us translate everything in a single API call while still
// updating each text node in place.

const ResponseSchema = z.object({
  translations: z
    .array(z.string())
    .describe("Translated fragments, one per input fragment, in the same order."),
})

export async function POST(req: Request) {
  const auth = await authenticateToken(req.headers.get("authorization"))
  if (!auth) return unauthorized()

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return jsonResponse({ error: "Invalid payload" }, { status: 400 })
  }

  const language = String((body as Record<string, unknown>).language || "").trim().slice(0, 60)
  if (!language) {
    return jsonResponse({ error: "language required" }, { status: 400 })
  }

  const fragmentsRaw = (body as Record<string, unknown>).fragments
  if (!Array.isArray(fragmentsRaw) || fragmentsRaw.length === 0) {
    return jsonResponse({ error: "fragments[] required" }, { status: 400 })
  }
  // Bound the request: at most 200 fragments and ~12k chars total. Past
  // that the user is almost certainly translating an entire feed in one
  // shot and we'd rather they do it post-by-post.
  const fragments: string[] = []
  let total = 0
  for (const f of fragmentsRaw.slice(0, 200)) {
    const s = typeof f === "string" ? f : ""
    fragments.push(s)
    total += s.length
    if (total > 12_000) {
      return jsonResponse({ error: "Selection too large to translate in one call." }, { status: 413 })
    }
  }

  const { model, usingUserKey } = resolveModel(req, {
    gatewayModel: "anthropic/claude-opus-4.6",
    tier: "fast",
  })

  const system = [
    "You translate UI text fragments scraped from social-media posts and articles.",
    `Translate every fragment into ${language}.`,
    "Rules:",
    "- Return EXACTLY the same number of translations as input fragments, in the same order.",
    "- Preserve URLs, @mentions, #hashtags, emoji, and numbers verbatim.",
    "- If a fragment is empty or whitespace, return it unchanged.",
    "- If a fragment is already in the target language, return it unchanged.",
    "- Do not add explanations, prefixes, or suffixes — only the translated text.",
  ].join("\n")

  const userPrompt = JSON.stringify({ language, fragments })

  try {
    const { experimental_output } = await generateText({
      model,
      system,
      prompt: userPrompt,
      experimental_output: Output.object({ schema: ResponseSchema }),
    })

    let translations = experimental_output.translations
    // Defensive: pad / truncate so the array length always matches the
    // input. The content script relies on positional alignment.
    if (translations.length < fragments.length) {
      translations = translations.concat(fragments.slice(translations.length))
    } else if (translations.length > fragments.length) {
      translations = translations.slice(0, fragments.length)
    }

    return jsonResponse({ translations, language, ai: true })
  } catch (e) {
    if (!usingUserKey && isGatewayUnavailable(e)) {
      return jsonResponse({ error: GATEWAY_UNAVAILABLE_MESSAGE }, { status: 503 })
    }
    console.log("[v0] /translate error", e)
    const msg =
      usingUserKey && e instanceof Error ? `Anthropic API error: ${e.message}` : "Translation failed"
    return jsonResponse({ error: msg }, { status: 500 })
  }
}
