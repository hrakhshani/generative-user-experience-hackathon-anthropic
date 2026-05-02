import { createOpenAI } from "@ai-sdk/openai"
import { generateObject } from "ai"
import { z } from "zod"
import { authenticateToken, jsonResponse, preflight, unauthorized } from "@/lib/auth/token"
import { GATEWAY_UNAVAILABLE_MESSAGE, isGatewayUnavailable } from "@/lib/ai/gateway"
import { getUserOpenAIKey } from "@/lib/ai/model"

export const runtime = "nodejs"
// Vercel function timeout. Default for Node runtime is 10s on Hobby and
// 15s on Pro — both well under the 30s wall-clock we set in the route,
// so a slow generateObject call would surface as a confusing 504 from
// the platform rather than our friendly "timed out" error. Bumping to
// 60s gives the route headroom and matches what the platform allows on
// Pro by default.
export const maxDuration = 60

export async function OPTIONS() {
  return preflight()
}

// ---------------------------------------------------------------------------
// /api/v1/compare-text — stateless side-by-side comparison.
//
// Used by the in-page "Compare" rule (extension/content.js). The rule injects
// a checkbox onto every matched card, lets the user pick 2-8 items, then
// sends the visible text of each pick here. The server asks the LLM to
// distil the items into a comparison TABLE with shared columns, so the
// client can render a clean grid in a modal — no per-site scraping logic
// required.
//
// Differs from the existing /api/v1/compare endpoint, which loads previously
// SAVED objects from Supabase by id. This one is purely transient: nothing
// is persisted, no object rows are required, the user just picks cards on
// the live page and gets a table back.
// ---------------------------------------------------------------------------

const ItemSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().max(280).optional().default(""),
  // Real-world product URLs (Amazon, eBay, Aliexpress…) routinely
  // exceed 2 KB once tracking + ref params are appended. We don't
  // want a long URL to fail the entire compare request, so accept any
  // string up to a generous ceiling and silently truncate to 2 KB
  // before it ever hits the model. The URL is metadata only — it's
  // shown back to the user and embedded in the prompt as an FYI, but
  // truncating it never affects the comparison itself.
  url: z
    .string()
    .max(8192)
    .optional()
    .default("")
    .transform((u) => (u.length > 2048 ? u.slice(0, 2048) : u)),
  // Text from the matched card. Capped client-side to ~2 KB per item; we
  // cap again here (8 KB) as a defensive ceiling.
  text: z.string().max(8000).default(""),
})

const BodySchema = z.object({
  items: z.array(ItemSchema).min(2).max(8),
  // Optional user-provided framing ("compare for trail running on muddy
  // terrain", "which is best for travel", etc.). Steers which columns the
  // model picks and how it phrases the verdict.
  prompt: z.string().max(500).optional().default(""),
  // Optional context — the kind of thing being compared ("Running shoes",
  // "Headphones", "Apartment listings"). Lets the model lock in domain-
  // appropriate columns instead of having to infer from text alone.
  context: z.string().max(120).optional().default(""),
})

// Schema describing the table we want back.
//
// Originally written with `cells: z.record(z.string(), z.string())` so each
// row could declare its values per column name, but OpenAI's strict
// structured-output mode (used by `generateObject` for openai/gpt-5*)
// rejects open key/value maps — every JSON-Schema object must have a
// fixed `properties` set with explicit `required`. We work around it by
// asking for a parallel `values: string[]` aligned to the `columns`
// array. The post-processing block below zips them back into the
// {column → cell} map the client expects, so the response shape on the
// wire stays unchanged.
const ComparisonSchema = z.object({
  // 3-7 column names that meaningfully differentiate the items. Short
  // labels ("Price", "Weight", "Battery"), not sentences.
  columns: z.array(z.string().min(1).max(40)).min(2).max(8),
  rows: z
    .array(
      z.object({
        // Echoes the input id so the client can map cells back to the
        // selected DOM element.
        id: z.string().min(1),
        // Item title as the model interpreted it (often shorter / cleaner
        // than what we sent). Shown in the leftmost cell.
        label: z.string().min(1).max(160),
        // One value per `columns` entry, in the same order. Use "—" for
        // genuinely unknown values rather than omitting an entry.
        values: z.array(z.string().max(280)),
      }),
    )
    .min(2)
    .max(8),
  // 1-2 sentence summary positioned under the table — gives the user the
  // headline takeaway without forcing them to read every cell.
  verdict: z.string().max(400),
  // Row id the model would recommend overall, with a one-line reason.
  // Nullable when nothing clearly stands out.
  recommended: z
    .object({
      id: z.string().min(1),
      reason: z.string().max(220),
    })
    .nullable(),
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
  const { items, prompt, context } = parsed.data

  // Build the source block. We pass title/url alongside the truncated text
  // so the model has metadata to anchor on (URL helps disambiguate
  // identical-looking product names). Per-item text capped at 1200 chars
  // — empirically enough for product / listing cards and keeps total
  // input under ~10K chars even with 8 items, which the nano tier can
  // turn around in 1-3s.
  const block = items
    .map((it, i) => {
      const lines = [
        `### Item ${i + 1} (id: ${it.id})`,
        it.title ? `Title: ${it.title}` : "",
        it.url ? `URL: ${it.url}` : "",
        it.text ? `Content:\n${it.text.slice(0, 1200)}` : "",
      ]
      return lines.filter(Boolean).join("\n")
    })
    .join("\n\n")

  // Compare is pinned to a SINGLE model — gpt-4o-mini — regardless of
  // which provider keys the user has configured. Reasoning is:
  //
  //   - Comparison is fundamentally a "fill in this table" task; the
  //     older non-reasoning minis turn it around in 1-3s where reasoning
  //     models (gpt-5-mini / claude-sonnet-4-5) take 15-30s.
  //   - One model means consistent column choices and verdict tone
  //     across requests, which matters when users compare multiple
  //     groups in a session.
  //   - generateObject's strict structured output works cleanly on
  //     gpt-4o-mini; Anthropic's tool/JSON path adds overhead that
  //     defeats the latency goal.
  //
  // We still respect the user's OpenAI key (direct path) when set,
  // otherwise we route through the Vercel AI Gateway as the
  // gatewayModel string.
  const userOpenAIKey = getUserOpenAIKey(req)
  const usingUserKey = !!userOpenAIKey
  const provider = usingUserKey ? "openai/gpt-4o-mini (direct)" : "openai/gpt-4o-mini"
  const model = usingUserKey
    ? createOpenAI({ apiKey: userOpenAIKey })("gpt-4o-mini")
    : ("openai/gpt-4o-mini" as const)

  // Hard wall-clock ceiling. Set well under the 60s function maxDuration
  // so we can return a clean 504 with a friendly message rather than
  // having Vercel kill the function and surface its own timeout.
  const ac = new AbortController()
  const timeout = setTimeout(() => ac.abort(), 45_000)

  try {
    const { object } = await generateObject({
      // `model` is `LanguageModel | string`; both are accepted shapes for
      // generateObject (string → resolved by the gateway).
      model,
      schema: ComparisonSchema,
      system: [
        "You are a comparison engine. Given 2-8 items, you produce a tight",
        "side-by-side comparison TABLE that highlights what genuinely",
        "differs between them.",
        "",
        "Rules:",
        "- Pick 3-6 columns that meaningfully differentiate the items.",
        "  Avoid columns where every item has the same value.",
        "- Column labels are short nouns (e.g. 'Price', 'Weight', 'Battery',",
        "  'Use case'). Not sentences. Capitalize the first letter.",
        "- For each row, return `values` as an array EXACTLY the same length",
        "  as `columns`, in the SAME order. values[i] is the cell for",
        "  columns[i]. Use '—' when a value is genuinely unknown.",
        "- Cell values are concise: numbers with units ('245 g'), short",
        "  noun phrases ('all-day commute'), or '—' if truly unknown. No",
        "  full sentences inside cells.",
        "- Use the same units across a column. If items mix metric/imperial,",
        "  convert to the more common one for that domain.",
        "- The verdict is 1-2 sentences. State the headline tradeoff.",
        "- The 'recommended' field is the single best overall pick if one",
        "  clearly stands out, else null. Reason is one short sentence.",
        "- Echo the exact `id` we gave you for each row. Do not invent ids.",
      ].join("\n"),
      prompt: [
        context ? `Comparing: ${context}` : "",
        prompt ? `User goal: ${prompt}` : "",
        "",
        "Items:",
        block,
      ]
        .filter(Boolean)
        .join("\n"),
      abortSignal: ac.signal,
      // Retries here would compound the latency the user is already
      // unhappy about. A single attempt; if it fails the modal surfaces
      // a clean error and the user clicks Compare again.
      maxRetries: 0,
    })

    // Zip the parallel `values: string[]` returned by the model into the
    // {column → cell} shape the client renders. If the model returned
    // fewer values than columns we backfill with "—"; extras are ignored.
    // This keeps the wire format stable even though the underlying
    // schema had to change for OpenAI strict-mode compatibility.
    const cols = object.columns
    const rows = object.rows.map((r) => {
      const cells: Record<string, string> = {}
      for (let i = 0; i < cols.length; i++) {
        const v = r.values?.[i]
        cells[cols[i]] = typeof v === "string" && v.trim() ? v.trim() : "—"
      }
      return { id: r.id, label: r.label, cells }
    })

    return jsonResponse({
      columns: cols,
      rows,
      verdict: object.verdict,
      recommended: object.recommended,
      ai: true,
      // Surface which provider actually ran (helps the client show the
      // same status banner pattern as Rank: gateway / openai-direct /
      // anthropic-direct).
      model: provider,
    })
  } catch (err) {
    const aborted =
      ac.signal.aborted || (err instanceof Error && /aborted|abort/i.test(err.message))
    if (aborted) {
      return jsonResponse(
        { error: "Comparison timed out. Try fewer items, shorter cards, or set an OpenAI key in extension options." },
        { status: 504 },
      )
    }
    if (!usingUserKey && isGatewayUnavailable(err)) {
      return jsonResponse({ error: GATEWAY_UNAVAILABLE_MESSAGE }, { status: 402 })
    }
    console.log("[v0] /compare-text error", err)
    const msg =
      usingUserKey && err instanceof Error
        ? `Provider error: ${err.message}`
        : "Comparison failed"
    return jsonResponse({ error: msg }, { status: 500 })
  } finally {
    clearTimeout(timeout)
  }
}
