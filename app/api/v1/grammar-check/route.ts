import { createOpenAI } from "@ai-sdk/openai"
import { generateObject } from "ai"
import { z } from "zod"
import { authenticateToken, jsonResponse, preflight, unauthorized } from "@/lib/auth/token"
import { GATEWAY_UNAVAILABLE_MESSAGE, isGatewayUnavailable } from "@/lib/ai/gateway"
import { getUserOpenAIKey } from "@/lib/ai/model"

export const runtime = "nodejs"
// Vercel function timeout. Grammar check is bounded (per-fragment caps,
// max 200 fragments, max 12k chars) so it should always finish well
// under this, but giving headroom prevents the platform from killing
// requests with a large selection.
export const maxDuration = 60

export async function OPTIONS() {
  return preflight()
}

// Per-fragment grammar correction.
//
// We accept an array of text fragments (one per text node inside the
// matched element) and return a parallel `corrections: string[]` of the
// same length. The content script then drops each correction back into
// its original DOM text node — same approach as /api/v1/translate, which
// is the closest existing pattern.
//
// Why a parallel array instead of a single string blob:
//   - Posts on LinkedIn / X / Reddit / blogs split body text across many
//     text nodes (author, timestamp, body, hashtags, footer counts).
//   - Re-flattening into one blob loses the node boundaries and we'd
//     have no way to write the corrections back without re-rendering.
//   - The positional contract (corrections[i] replaces fragments[i])
//     keeps the in-page logic dead simple and survives partial updates.

const ResponseSchema = z.object({
  corrections: z
    .array(z.string())
    .describe(
      "Grammar-corrected fragments, one per input fragment, in the same order.",
    ),
})

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

  // Bound the request: at most 200 fragments and ~12k chars total.
  // Mirrors /translate so users get consistent caps.
  const fragments: string[] = []
  let total = 0
  for (const f of fragmentsRaw.slice(0, 200)) {
    const s = typeof f === "string" ? f : ""
    fragments.push(s)
    total += s.length
    if (total > 12_000) {
      return jsonResponse(
        { error: "Selection too large to grammar-check in one call." },
        { status: 413 },
      )
    }
  }

  // Optional language hint (e.g. "en-GB", "en-US") so the model knows
  // which spelling/usage rules to apply. Defaults to neutral English.
  const language = String(
    (body as Record<string, unknown>).language || "English",
  )
    .trim()
    .slice(0, 60) || "English"

  // Pinned to gpt-4o-mini for the same reasons as /compare-text:
  //
  //   - This is a "fix in place" task with a tightly-bounded output
  //     (same length & shape as input). Reasoning models add 15-30s of
  //     "thinking" time for what should be a 1-2s call.
  //   - One model = consistent style of corrections across requests, so
  //     the user's feed reads coherently when grammar fixes apply across
  //     multiple posts.
  //   - generateObject's strict structured output works cleanly with
  //     gpt-4o-mini and lets us guarantee the array length contract.
  //
  // Honors the user's OpenAI key (direct path) when set; otherwise the
  // request goes through the Vercel AI Gateway as a model-id string.
  const userOpenAIKey = getUserOpenAIKey(req)
  const usingUserKey = !!userOpenAIKey
  const model = usingUserKey
    ? createOpenAI({ apiKey: userOpenAIKey })("gpt-4o-mini")
    : ("openai/gpt-4o-mini" as const)

  const system = [
    "You are a grammar and spelling corrector for fragments of text scraped",
    `from web pages. Target language: ${language}.`,
    "",
    "Apply the SMALLEST POSSIBLE edits to make each fragment grammatically",
    "correct and idiomatic. Preserve the author's voice exactly.",
    "",
    "Strict rules:",
    "- Return EXACTLY the same number of corrections as input fragments,",
    "  in the same order. corrections[i] replaces fragments[i].",
    "- If a fragment is already grammatical, return it UNCHANGED (byte-for-byte).",
    "- Fix: spelling, subject-verb agreement, tense consistency, punctuation,",
    "  capitalization, missing articles, awkward word order.",
    "- DO NOT: rewrite for style, change vocabulary level, shorten/lengthen,",
    "  translate, summarize, paraphrase, add or remove information, change",
    "  the meaning, or add explanations.",
    "- Preserve verbatim: URLs, @mentions, #hashtags, emoji, code spans,",
    "  numbers, units, proper nouns, brand names, and technical jargon.",
    "- Preserve leading/trailing whitespace. If the input is empty or only",
    "  whitespace, return it unchanged.",
    "- Preserve the original casing pattern (e.g. ALL CAPS stays ALL CAPS,",
    "  Title Case stays Title Case) unless that casing is itself the error.",
    "- Output the corrected text only — no quotes, no explanations, no diff",
    "  markers, no labels.",
  ].join("\n")

  const userPrompt = JSON.stringify({ language, fragments })

  // Hard wall-clock ceiling so the in-page button never spins forever.
  // Set under maxDuration so we surface a friendly 504 rather than the
  // platform's generic timeout.
  const ac = new AbortController()
  const timeout = setTimeout(() => ac.abort(), 45_000)
  let aborted = false
  ac.signal.addEventListener("abort", () => {
    aborted = true
  })

  try {
    const { object } = await generateObject({
      model,
      system,
      prompt: userPrompt,
      schema: ResponseSchema,
      abortSignal: ac.signal,
      // Single attempt: a retry would compound latency on the user's
      // perceived "Fix grammar" click. If the model fails we surface
      // a clean error and the user can click again.
      maxRetries: 0,
    })

    let corrections = object.corrections
    // Defensive: pad / truncate so the array length always matches the
    // input. The content script relies on positional alignment to write
    // each correction back into the original text node.
    if (corrections.length < fragments.length) {
      corrections = corrections.concat(fragments.slice(corrections.length))
    } else if (corrections.length > fragments.length) {
      corrections = corrections.slice(0, fragments.length)
    }

    // If the model hallucinated an empty correction for non-empty input
    // (which would silently delete content), fall back to the original
    // fragment. Better to under-correct than to lose the user's text.
    corrections = corrections.map((c, i) => {
      if (typeof c !== "string") return fragments[i]
      if (!c.trim() && fragments[i].trim()) return fragments[i]
      return c
    })

    return jsonResponse({
      corrections,
      language,
      model: usingUserKey ? "openai/gpt-4o-mini (direct)" : "openai/gpt-4o-mini",
      ai: true,
    })
  } catch (e) {
    if (aborted) {
      return jsonResponse(
        { error: "Grammar check timed out. Try a smaller selection or set an OpenAI key in extension options." },
        { status: 504 },
      )
    }
    if (!usingUserKey && isGatewayUnavailable(e)) {
      return jsonResponse({ error: GATEWAY_UNAVAILABLE_MESSAGE }, { status: 503 })
    }
    console.log("[v0] /grammar-check error", e)
    const msg =
      usingUserKey && e instanceof Error
        ? `OpenAI API error: ${e.message}`
        : "Grammar check failed"
    return jsonResponse({ error: msg }, { status: 500 })
  } finally {
    clearTimeout(timeout)
  }
}
