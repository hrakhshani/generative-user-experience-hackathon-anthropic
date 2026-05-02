import { authenticateToken, jsonResponse, preflight, unauthorized } from "@/lib/auth/token"
import { GATEWAY_UNAVAILABLE_MESSAGE, isGatewayUnavailable } from "@/lib/ai/gateway"
import { resolveModel } from "@/lib/ai/model"
import { generateText, Output } from "ai"
import { z } from "zod"

export const runtime = "nodejs"

export async function OPTIONS() {
  return preflight()
}

// Heuristic, AI-free fallback used when the AI Gateway is unavailable.
function heuristicExtract(input: { text: string; url: string }) {
  const text = input.text || ""
  const url = input.url || ""
  const attributes: Record<string, string> = {}

  const priceMatch = text.match(/(?:US?\$|£|€|EUR|USD)\s?([0-9][0-9,]*(?:\.[0-9]{2})?)/i)
  if (priceMatch) attributes.price = priceMatch[0]

  const ratingMatch = text.match(/\b([0-5](?:\.[0-9])?)\s*(?:\/\s*5|stars?|out of 5)\b/i)
  if (ratingMatch) attributes.rating = ratingMatch[1]

  // "Key: Value" lines, lightly filtered
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  for (const line of lines) {
    const m = line.match(/^([A-Za-z][A-Za-z0-9 _-]{2,30}):\s+(.{1,200})$/)
    if (m) {
      const key = m[1].toLowerCase().replace(/\s+/g, "_").slice(0, 40)
      if (!attributes[key]) attributes[key] = m[2].trim()
      if (Object.keys(attributes).length > 12) break
    }
  }

  // Title: first non-trivial line
  const title = (lines.find((l) => l.length > 6 && l.length < 160) || "").slice(0, 200) || null

  // Tags from hostname
  const tags: string[] = []
  try {
    const host = new URL(url).hostname.replace(/^www\./, "")
    if (host) tags.push(host.split(".")[0])
  } catch {
    /* ignore */
  }

  // Semantic type guess from signals
  let semantic_type = "page"
  if (attributes.price) semantic_type = "product"
  else if (/\b(recipe|ingredients|instructions)\b/i.test(text)) semantic_type = "recipe"
  else if (/\b(job|salary|apply|role|position)\b/i.test(text)) semantic_type = "job"
  else if (/\b(author|published|read time|article)\b/i.test(text)) semantic_type = "article"

  return { semantic_type, title, attributes, tags }
}

// Extract action: turn raw text/HTML from a page region into a typed Object
// with a semantic_type and key/value attributes. The extension calls this
// before saving so the saved object is structured. Falls back to a
// deterministic heuristic when the AI Gateway is unavailable.
export async function POST(request: Request) {
  const auth = await authenticateToken(request.headers.get("authorization"))
  if (!auth) return unauthorized()

  const body = await request.json().catch(() => null)
  const text = typeof body?.text === "string" ? body.text.slice(0, 12_000) : ""
  const url = typeof body?.url === "string" ? body.url : ""

  if (!text.trim()) {
    return jsonResponse({ error: "text is required" }, { status: 400 })
  }

  const schema = z.object({
    semantic_type: z
      .string()
      .describe("Best-fit type slug, e.g. 'product', 'hotel', 'article', 'job', 'recipe', 'event', 'person', 'other'"),
    title: z.string().nullable(),
    attributes: z
      .array(
        z.object({
          key: z.string(),
          value: z.string(),
        }),
      )
      .describe("Flat list of structured fields parsed from the content."),
    tags: z.array(z.string()).describe("0-5 short topical tags."),
  })

  const { model, usingUserKey } = resolveModel(request, {
    gatewayModel: "openai/gpt-5-mini",
    tier: "fast",
  })

  try {
    const { experimental_output } = await generateText({
      model,
      system:
        "You convert arbitrary web page content into structured data. " +
        "Choose semantic_type from a small set when possible. " +
        "Only include attributes you are confident are present (price, rating, location, author, etc).",
      prompt: `URL: ${url}\n\nContent:\n${text}`,
      experimental_output: Output.object({ schema }),
    })

    const result = experimental_output

    const attributes: Record<string, string> = {}
    for (const a of result.attributes ?? []) {
      if (a.key) attributes[a.key.slice(0, 64)] = String(a.value ?? "").slice(0, 1000)
    }

    return jsonResponse({
      semantic_type: result.semantic_type,
      title: result.title,
      attributes,
      tags: result.tags ?? [],
      ai: true,
    })
  } catch (err) {
    if (!usingUserKey && isGatewayUnavailable(err)) {
      const fallback = heuristicExtract({ text, url })
      return jsonResponse({
        ...fallback,
        ai: false,
        notice: GATEWAY_UNAVAILABLE_MESSAGE,
      })
    }
    console.log("[v0] extract route failed:", err)
    const msg =
      usingUserKey && err instanceof Error ? `Anthropic API error: ${err.message}` : "Extraction failed"
    return jsonResponse({ error: msg }, { status: 500 })
  }
}
