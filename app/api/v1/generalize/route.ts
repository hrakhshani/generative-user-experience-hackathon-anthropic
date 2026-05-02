import { authenticateToken, jsonResponse, preflight, unauthorized } from "@/lib/auth/token"
import { GATEWAY_UNAVAILABLE_MESSAGE, isGatewayUnavailable } from "@/lib/ai/gateway"
import { resolveModel } from "@/lib/ai/model"
import { generateText, Output } from "ai"
import { z } from "zod"

export const runtime = "nodejs"

export async function OPTIONS() {
  return preflight()
}

// Generalize action: turn a single picked DOM element into a robust CSS
// selector that matches all visually similar elements on the same page
// (e.g. every post in a LinkedIn feed). The extension uses this to:
//   - decide pattern vs. single scope
//   - persist a reliable identifier on the saved Object
//   - power decoration rules that re-apply on every visit
//
// Falls back to whatever heuristic selector the client computed locally
// when the AI Gateway is unavailable, so saving still works offline.
export async function POST(request: Request) {
  const auth = await authenticateToken(request.headers.get("authorization"))
  if (!auth) return unauthorized()

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return jsonResponse({ error: "Invalid payload" }, { status: 400 })
  }

  const heuristic =
    typeof body.heuristic_selector === "string" && body.heuristic_selector.length < 2000
      ? body.heuristic_selector
      : null
  const heuristicCount =
    typeof body.heuristic_match_count === "number" ? body.heuristic_match_count : null

  const schema = z.object({
    selector: z
      .string()
      .describe(
        "A CSS selector usable with document.querySelectorAll that matches the clicked element and all similar siblings.",
      ),
    kind: z
      .enum(["single", "pattern"])
      .describe("'pattern' if many similar elements exist on the page; 'single' if the element is unique."),
    confidence: z.number().min(0).max(1),
    identifier_strategy: z
      .string()
      .describe(
        "Short label for the strategy used: 'data-attribute', 'role', 'aria', 'semantic-tag', 'class', 'structural', or 'mixed'.",
      ),
    rationale: z.string().describe("One short sentence explaining why this selector is robust."),
  })

  const { model, usingUserKey } = resolveModel(request, {
    gatewayModel: "anthropic/claude-opus-4.6",
    tier: "smart",
  })

  try {
    const { experimental_output } = await generateText({
      // Claude is well-suited to selector engineering on noisy modern frontends.
      model,
      system: [
        "You are an expert at writing robust CSS selectors for browser-extension userscripts.",
        "Given a clicked element on a webpage and surrounding context (ancestors, sibling samples, the page URL, and a heuristic guess from the client), produce a CSS selector that:",
        "1. Reliably matches the clicked element AND every visually similar item on the same page (e.g. all posts in a feed, all product cards in a grid).",
        "2. Survives soft re-renders on the same site over time.",
        "3. AVOIDS brittle hashed/randomized class names (examples to ignore: 'css-1a2b3c4', 'x1n2onr6', '_2k3l4m', 'sc-abcdef'). These rotate between deploys.",
        "4. Prefers stable signals in this order of priority: data-* attributes (especially data-testid, data-id, data-urn), role and aria-* attributes, semantic tags (article, section, li), descriptive class names, and only structural :nth-child(...) as a last resort.",
        "5. Returns ONE selector string usable verbatim by document.querySelectorAll.",
        "",
        "Decide kind:",
        "- 'pattern' when the element is one of many similar items.",
        "- 'single' only when the element is genuinely unique on the page (header, sidebar widget, hero).",
        "",
        "If the client's heuristic_selector is already good, you may return it verbatim.",
      ].join("\n"),
      prompt: JSON.stringify(body).slice(0, 16_000),
      experimental_output: Output.object({ schema }),
    })

    const out = experimental_output
    return jsonResponse({
      selector: out.selector,
      kind: out.kind,
      confidence: out.confidence,
      identifier_strategy: out.identifier_strategy,
      rationale: out.rationale,
      ai: true,
    })
  } catch (err) {
    if (!usingUserKey && isGatewayUnavailable(err)) {
      return jsonResponse({
        selector: heuristic || "",
        kind: heuristic && heuristicCount && heuristicCount >= 3 ? "pattern" : "single",
        confidence: heuristic ? 0.5 : 0,
        identifier_strategy: "structural",
        rationale: "Heuristic fallback (AI Gateway unavailable).",
        ai: false,
        notice: GATEWAY_UNAVAILABLE_MESSAGE,
      })
    }
    console.log("[v0] generalize route failed:", err)
    const msg =
      usingUserKey && err instanceof Error ? `Anthropic API error: ${err.message}` : "Generalize failed"
    return jsonResponse({ error: msg }, { status: 500 })
  }
}
