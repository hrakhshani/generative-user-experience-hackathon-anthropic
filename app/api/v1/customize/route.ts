import { generateText, Output } from "ai"
import { z } from "zod"
import { authenticateToken, jsonResponse, preflight, unauthorized } from "@/lib/auth/token"
import { GATEWAY_UNAVAILABLE_MESSAGE, isGatewayUnavailable } from "@/lib/ai/gateway"
import { resolveModel } from "@/lib/ai/model"

export const runtime = "nodejs"

export async function OPTIONS() {
  return preflight()
}

// --- DSL --------------------------------------------------------------
// A small structured language for arbitrary, AI-authored DOM
// modifications. Anything not in this allow-list is rejected so Claude's
// output cannot inject scripts or arbitrary CSS that breaks the host page.

const ALLOWED_TAGS = ["div", "span", "button", "a", "p", "small", "strong", "em", "img", "br", "hr"] as const
const ALLOWED_WRAP_TAGS = ["div", "section", "article"] as const
const ALLOWED_ACTIONS = ["open_url", "copy_text", "hide_match", "alert", "noop"] as const

// Curated CSS properties the model may set inline. Anything else is dropped.
const STYLE_ALLOW = new Set([
  "display","visibility","opacity","position","top","right","bottom","left","z-index",
  "box-sizing","width","min-width","max-width","height","min-height","max-height",
  "margin","margin-top","margin-right","margin-bottom","margin-left",
  "padding","padding-top","padding-right","padding-bottom","padding-left",
  "border","border-top","border-right","border-bottom","border-left",
  "border-radius","border-color","border-style","border-width",
  "background","background-color","background-image","background-size",
  "background-position","background-repeat",
  "color","font-family","font-size","font-weight","font-style",
  "line-height","letter-spacing","text-align","text-decoration","text-transform",
  "white-space","word-break","overflow-wrap",
  "flex","flex-direction","flex-wrap","flex-grow","flex-shrink","flex-basis",
  "justify-content","align-items","align-content","align-self","gap","row-gap","column-gap",
  "list-style","list-style-type",
  "overflow","overflow-x","overflow-y",
  "object-fit","object-position","aspect-ratio",
  "box-shadow","filter","transform","cursor",
])

// Anthropic structured output requires closed objects (no
// `additionalProperties`), which rules out `z.record(...)`. We instead model
// styles as a list of {property, value} pairs and rebuild a plain object in
// the sanitizer.
const Style = z
  .array(
    z.object({
      property: z.string().describe("CSS property in kebab-case, e.g. 'background-color'."),
      value: z.string().describe("CSS value, e.g. '#1d4ed8'."),
    }),
  )
  .nullable()

const Action = z
  .object({
    type: z.enum(ALLOWED_ACTIONS),
    url: z.string().nullable(),
    target: z.string().nullable(),
    text: z.string().nullable(),
    message: z.string().nullable(),
  })
  .nullable()

const Element = z
  .object({
    tag: z.enum(ALLOWED_TAGS),
    text: z.string().nullable(),
    attrs: z
      .object({
        href: z.string().nullable(),
        target: z.string().nullable(),
        title: z.string().nullable(),
        alt: z.string().nullable(),
        src: z.string().nullable(),
      })
      .nullable(),
    style: Style,
    action: Action,
  })
  .nullable()

const Op = z.object({
  type: z.enum(["set_style", "prepend", "append", "before", "after", "wrap"]),
  style: Style,
  tag: z.enum(ALLOWED_WRAP_TAGS).nullable(),
  element: Element,
})

const ResponseSchema = z.object({
  label: z.string().describe("A short 2-4 word label naming this rule, e.g. 'Save to Notion button'."),
  rationale: z.string().describe("One-sentence explanation of what the modification does and why."),
  // NOTE: Anthropic's structured-output schema rejects `minItems` /
  // `maxItems` on arrays, so we enforce the 1..6 bound in `sanitizeOps`.
  ops: z.array(Op),
})

// ---------- Sanitization -----------------------------------------------

function sanitizeStyle(style: unknown): Record<string, string> | null {
  if (!Array.isArray(style)) return null
  const out: Record<string, string> = {}
  for (const entry of style) {
    if (!entry || typeof entry !== "object") continue
    const rawKey = (entry as { property?: unknown }).property
    const rawVal = (entry as { value?: unknown }).value
    if (typeof rawKey !== "string" || typeof rawVal !== "string") continue
    const key = rawKey.toLowerCase().trim()
    if (!STYLE_ALLOW.has(key)) continue
    const v = rawVal.trim()
    if (!v) continue
    // Drop anything that looks like a CSS hack or external resource we can't validate.
    if (/expression\s*\(|javascript:|<|>/i.test(v)) continue
    if (key.startsWith("background") && /url\s*\(/i.test(v) && !/^url\(\s*["']?https:\/\//i.test(v)) continue
    out[key] = v
  }
  return Object.keys(out).length ? out : null
}

function sanitizeUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") return null
  try {
    const u = new URL(url, "https://placeholder.local/")
    if (u.protocol === "http:" || u.protocol === "https:" || u.protocol === "mailto:") return u.toString()
    return null
  } catch {
    return null
  }
}

function sanitizeAction(action: z.infer<typeof Action>) {
  if (!action) return null
  const t = action.type
  if (t === "open_url") {
    const url = sanitizeUrl(action.url)
    if (!url) return null
    return { type: t, url, target: action.target === "_self" ? "_self" : "_blank" }
  }
  if (t === "copy_text") {
    if (typeof action.text !== "string" || !action.text) return null
    return { type: t, text: action.text.slice(0, 4000) }
  }
  if (t === "alert") {
    if (typeof action.message !== "string" || !action.message) return null
    return { type: t, message: action.message.slice(0, 500) }
  }
  if (t === "hide_match") return { type: t }
  return { type: "noop" }
}

function sanitizeElement(el: z.infer<typeof Element>) {
  if (!el) return null
  const tag = (el.tag || "span").toLowerCase()
  if (!ALLOWED_TAGS.includes(tag as (typeof ALLOWED_TAGS)[number])) return null

  const out: {
    tag: string
    text: string | null
    attrs: { href?: string; target?: string; title?: string; alt?: string; src?: string }
    style: Record<string, string> | null
    action: ReturnType<typeof sanitizeAction>
  } = {
    tag,
    text: typeof el.text === "string" ? el.text.slice(0, 1000) : null,
    attrs: {},
    style: sanitizeStyle(el.style),
    action: sanitizeAction(el.action),
  }

  if (el.attrs) {
    if (el.attrs.href) {
      const href = sanitizeUrl(el.attrs.href)
      if (href) out.attrs.href = href
    }
    if (el.attrs.src) {
      const src = sanitizeUrl(el.attrs.src)
      if (src) out.attrs.src = src
    }
    if (el.attrs.target === "_blank" || el.attrs.target === "_self") out.attrs.target = el.attrs.target
    if (el.attrs.title) out.attrs.title = String(el.attrs.title).slice(0, 200)
    if (el.attrs.alt) out.attrs.alt = String(el.attrs.alt).slice(0, 200)
  }

  return out
}

function sanitizeOps(ops: z.infer<typeof Op>[]) {
  const out: unknown[] = []
  // Hard cap at 6 ops regardless of what the model produces.
  for (const op of ops.slice(0, 6)) {
    if (op.type === "set_style") {
      const style = sanitizeStyle(op.style)
      if (style) out.push({ type: "set_style", style })
    } else if (op.type === "wrap") {
      const tag = op.tag && ALLOWED_WRAP_TAGS.includes(op.tag) ? op.tag : "div"
      out.push({ type: "wrap", tag, style: sanitizeStyle(op.style) })
    } else {
      const el = sanitizeElement(op.element)
      if (el) out.push({ type: op.type, element: el })
    }
  }
  return out
}

// ---------- Route ------------------------------------------------------

export async function POST(req: Request) {
  const auth = await authenticateToken(req.headers.get("authorization"))
  if (!auth) return unauthorized()

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return jsonResponse({ error: "Invalid payload" }, { status: 400 })
  }

  const instruction = String((body as Record<string, unknown>).instruction || "").trim()
  if (!instruction) {
    return jsonResponse({ error: "instruction required" }, { status: 400 })
  }
  const selector =
    typeof (body as Record<string, unknown>).selector === "string"
      ? ((body as Record<string, unknown>).selector as string)
      : ""
  const fingerprint = (body as Record<string, unknown>).fingerprint ?? null

  const system = [
    "You design small DOM modifications to be applied to every match of a CSS selector.",
    "You must output a list of ops in our DSL. Allowed op types:",
    "  - set_style: { type, style }   apply CSS to the match itself",
    "  - prepend / append / before / after: { type, element }   insert a new element",
    "  - wrap: { type, tag, style }   wrap the match in a container",
    "Each `element` has tag (one of div, span, button, a, p, small, strong, em, img, br, hr), optional text,",
    "attrs (href, src, target, title, alt), style, and an optional action that fires on click:",
    "  - open_url:  { type:'open_url', url, target?: '_blank'|'_self' }",
    "  - copy_text: { type:'copy_text', text }",
    "  - hide_match: hides the matched element",
    "  - alert: { type:'alert', message }",
    "Style is a list of { property, value } pairs (kebab-case CSS property + plain CSS value),",
    "e.g. [{property:'background-color', value:'#1d4ed8'}, {property:'color', value:'#ffffff'}].",
    "Use simple, readable styling that matches modern UIs (rounded corners, tasteful padding,",
    "system fonts). Do NOT include scripts or unsafe URLs.",
    "Keep ops minimal: usually 1-2 is enough. Prefer `append` for adding buttons to posts.",
  ].join("\n")

  const userPrompt = [
    `Instruction from user: ${instruction}`,
    ``,
    `Target selector (already validated): ${selector || "(unknown)"}`,
    fingerprint ? `Element fingerprint:\n${JSON.stringify(fingerprint).slice(0, 4000)}` : "",
  ]
    .filter(Boolean)
    .join("\n")

  const { model, usingUserKey } = resolveModel(req, {
    gatewayModel: "anthropic/claude-opus-4.6",
    tier: "smart",
  })

  try {
    const result = await generateText({
      model,
      system,
      prompt: userPrompt,
      experimental_output: Output.object({ schema: ResponseSchema }),
    })
    const out = result.experimental_output
    const ops = sanitizeOps(out.ops)
    if (ops.length === 0) {
      return jsonResponse(
        { error: "Could not produce a safe rule from that instruction. Try rephrasing." },
        { status: 422 },
      )
    }
    return jsonResponse({ label: out.label.slice(0, 80), rationale: out.rationale, ops, ai: true })
  } catch (e) {
    if (!usingUserKey && isGatewayUnavailable(e)) {
      return jsonResponse({ error: GATEWAY_UNAVAILABLE_MESSAGE }, { status: 503 })
    }
    console.log("[v0] /customize error", e)
    const msg =
      usingUserKey && e instanceof Error ? `Anthropic API error: ${e.message}` : "Failed to generate rule"
    return jsonResponse({ error: msg }, { status: 500 })
  }
}
